use crate::db::{self, DbState};
use crate::processor;
use calamine::{Data, Reader, Xlsx};
use rusqlite::{params, Connection, Row};
use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::path::PathBuf;
use tauri::State;

#[derive(Serialize)]
pub struct DialogOpenResult {
    pub canceled: bool,
    #[serde(rename = "filePaths")]
    pub file_paths: Vec<String>,
}

#[derive(Serialize)]
pub struct DialogSaveResult {
    pub canceled: bool,
    #[serde(rename = "filePath")]
    pub file_path: Option<String>,
}

#[derive(Serialize)]
pub struct ApiResult<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn ok<T>(data: T) -> ApiResult<T> {
    ApiResult {
        success: true,
        data: Some(data),
        message: None,
        error: None,
    }
}

fn ok_msg(msg: String) -> ApiResult<Value> {
    ApiResult {
        success: true,
        data: None,
        message: Some(msg),
        error: None,
    }
}

fn err<T>(e: impl ToString) -> ApiResult<T> {
    ApiResult {
        success: false,
        data: None,
        message: None,
        error: Some(e.to_string()),
    }
}

fn with_db_lock<T>(state: &DbState, f: impl FnOnce() -> anyhow::Result<T>) -> anyhow::Result<T> {
    let _g = state.lock.lock().unwrap();
    f()
}

fn conn(state: &DbState) -> anyhow::Result<Connection> {
    Ok(Connection::open(&state.db_path)?)
}

fn row_to_map(row: &Row) -> rusqlite::Result<Map<String, Value>> {
    let mut m = Map::new();
    m.insert("id".to_string(), Value::Number(row.get::<_, i64>("id")?.into()));

    let date: Option<String> = row.get("Date")?;
    m.insert("Date".to_string(), date.map(Value::String).unwrap_or(Value::Null));

    for key in ["Open", "High", "Low", "Close", "normalized", "Average_Norm", "True_Seasonal"] {
        let v: Option<f64> = row.get(key)?;
        m.insert(
            key.to_string(),
            v.and_then(serde_json::Number::from_f64).map(Value::Number).unwrap_or(Value::Null),
        );
    }

    let pct: Option<f64> = row.get("%change")?;
    m.insert(
        "%change".to_string(),
        pct.and_then(serde_json::Number::from_f64).map(Value::Number).unwrap_or(Value::Null),
    );

    let m_no: Option<i64> = row.get("M-no")?;
    m.insert(
        "M-no".to_string(),
        m_no.map(|n| Value::Number(n.into())).unwrap_or(Value::Null),
    );

    let asset: Option<String> = row.get("asset")?;
    if let Some(a) = asset {
        m.insert("asset".to_string(), Value::String(a));
    }

    let processed_date: Option<String> = row.get("processed_date")?;
    if let Some(p) = processed_date {
        m.insert("processed_date".to_string(), Value::String(p));
    }

    Ok(m)
}

#[tauri::command(rename = "show_open_dialog")]
pub async fn show_open_dialog() -> Result<DialogOpenResult, String> {
    let picked: Option<PathBuf> = rfd::FileDialog::new()
        .add_filter("Excel Files", &["xlsx", "xls"])
        .pick_file();

    match picked {
        Some(path) => Ok(DialogOpenResult {
            canceled: false,
            file_paths: vec![path.to_string_lossy().to_string()],
        }),
        None => Ok(DialogOpenResult {
            canceled: true,
            file_paths: vec![],
        }),
    }
}

#[tauri::command(rename = "show_save_dialog")]
pub async fn show_save_dialog(default_filename: String) -> Result<DialogSaveResult, String> {
    let picked: Option<PathBuf> = rfd::FileDialog::new()
        .set_file_name(&default_filename)
        .add_filter("Excel Files", &["xlsx"])
        .add_filter("Database Files", &["db"])
        .save_file();

    match picked {
        Some(path) => Ok(DialogSaveResult {
            canceled: false,
            file_path: Some(path.to_string_lossy().to_string()),
        }),
        None => Ok(DialogSaveResult {
            canceled: true,
            file_path: None,
        }),
    }
}

fn parse_xlsx_bytes(buffer: Vec<u8>) -> ApiResult<Vec<Map<String, Value>>> {
    // Parse first sheet as "sheet_to_json"-like output.
    let cursor = std::io::Cursor::new(buffer);
    let mut workbook: Xlsx<_> = match Xlsx::new(cursor) {
        Ok(wb) => wb,
        Err(e) => return err(e),
    };

    let sheet_names = workbook.sheet_names().to_vec();
    let first = match sheet_names.first() {
        Some(s) => s.clone(),
        None => return err("No sheets found"),
    };

    let range = match workbook.worksheet_range(&first) {
        Ok(r) => r,
        Err(e) => return err(e),
    };

    let mut rows_iter = range.rows();
    let headers_row = match rows_iter.next() {
        Some(r) => r,
        None => return ok(vec![]),
    };

    let headers: Vec<String> = headers_row
        .iter()
        .map(|c| c.to_string())
        .map(|s| s.trim().to_string())
        .collect();

    let mut out: Vec<Map<String, Value>> = Vec::new();
    for r in rows_iter {
        let mut m = Map::new();
        for (idx, cell) in r.iter().enumerate() {
            let key = headers.get(idx).cloned().unwrap_or_default();
            if key.is_empty() {
                continue;
            }

            let v = match cell {
                Data::Empty => Value::Null,
                Data::String(s) => Value::String(s.to_string()),
                Data::Float(f) => serde_json::Number::from_f64(*f).map(Value::Number).unwrap_or(Value::Null),
                Data::Int(i) => Value::Number((*i).into()),
                Data::Bool(b) => Value::Bool(*b),
                Data::DateTime(dt) => Value::String(dt.to_string()),
                Data::Error(_) => Value::Null,
                _ => Value::Null,
            };
            m.insert(key, v);
        }
        if !m.is_empty() {
            out.push(m);
        }
    }

    ok(out)
}

#[tauri::command(rename = "read_excel_file")]
pub fn read_excel_file(file_path: String) -> ApiResult<Vec<Map<String, Value>>> {
    match fs::read(file_path) {
        Ok(bytes) => parse_xlsx_bytes(bytes),
        Err(e) => err(e),
    }
}

#[tauri::command(rename = "read_excel_buffer")]
pub fn read_excel_buffer(buffer: Vec<u8>) -> ApiResult<Vec<Map<String, Value>>> {
    parse_xlsx_bytes(buffer)
}

#[tauri::command(rename = "process_data")]
pub fn process_data(data: Vec<Map<String, Value>>, replace_nan: bool) -> ApiResult<Vec<Map<String, Value>>> {
    let processed = processor::calculate_derived_columns(&data, replace_nan);
    ok(processed)
}

#[tauri::command(rename = "save_to_database")]
pub fn save_to_database(state: State<'_, DbState>, data: Vec<Map<String, Value>>, asset_name: String) -> ApiResult<Value> {
    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let mut conn = conn(&state)?;
        let tx = conn.transaction()?;

        let stmt_sql = r#"
          INSERT INTO asset_data
            (Date, Open, High, Low, Close, "%change", "M-no", normalized, Average_Norm, True_Seasonal, asset, processed_date)
          VALUES
            (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#;
        {
            let mut stmt = tx.prepare(stmt_sql)?;

        let now = chrono::Utc::now().to_rfc3339();

        for row in &data {
            let date = row.get("Date").and_then(|v| v.as_str()).unwrap_or("");
            let open = row.get("Open").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let high = row.get("High").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let low = row.get("Low").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let close = row.get("Close").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let pct = row.get("%change").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let m_no = row.get("M-no").and_then(|v| v.as_i64()).unwrap_or(0);
            let norm = row.get("normalized").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let avg_norm = row.get("Average_Norm").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let true_seasonal = row.get("True_Seasonal").and_then(|v| v.as_f64()).unwrap_or(0.0);

            stmt.execute(params![
                date,
                open,
                high,
                low,
                close,
                pct,
                m_no,
                norm,
                avg_norm,
                true_seasonal,
                &asset_name,
                now
            ])?;
        }
        }

        tx.commit()?;
        Ok::<_, anyhow::Error>(data.len())
    });

    match result {
        Ok(count) => ok_msg(format!("Successfully saved {} rows for '{}'", count, asset_name)),
        Err(e) => err(e),
    }
}

#[tauri::command(rename = "get_assets")]
pub fn get_assets(state: State<'_, DbState>) -> ApiResult<Vec<String>> {
    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let conn = conn(&state)?;
        let mut stmt = conn.prepare("SELECT DISTINCT asset FROM asset_data ORDER BY asset")?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok::<_, anyhow::Error>(rows)
    });

    match result {
        Ok(v) => ok(v),
        Err(e) => err(e),
    }
}

#[tauri::command(rename = "get_asset_data")]
pub fn get_asset_data(state: State<'_, DbState>, asset_name: String) -> ApiResult<Vec<Map<String, Value>>> {
    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let conn = conn(&state)?;
        let mut stmt = conn.prepare("SELECT * FROM asset_data WHERE asset = ?1 ORDER BY Date")?;
        let mapped = stmt
            .query_map(params![asset_name], |row| row_to_map(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok::<_, anyhow::Error>(mapped)
    });

    match result {
        Ok(v) => ok(v),
        Err(e) => err(e),
    }
}

#[derive(Serialize)]
pub struct DbStats {
    pub total_records: i64,
    pub assets_count: i64,
    pub min_date: Option<String>,
    pub max_date: Option<String>,
}

#[tauri::command(rename = "get_database_stats")]
pub fn get_database_stats(state: State<'_, DbState>) -> ApiResult<DbStats> {
    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let conn = conn(&state)?;

        let total: i64 = conn.query_row("SELECT COUNT(*) FROM asset_data", [], |r| r.get(0))?;
        let assets: i64 = conn.query_row("SELECT COUNT(DISTINCT asset) FROM asset_data", [], |r| r.get(0))?;
        let (min_date, max_date): (Option<String>, Option<String>) =
            conn.query_row("SELECT MIN(Date), MAX(Date) FROM asset_data", [], |r| Ok((r.get(0)?, r.get(1)?)))?;

        Ok::<_, anyhow::Error>(DbStats {
            total_records: total,
            assets_count: assets,
            min_date,
            max_date,
        })
    });

    match result {
        Ok(v) => ok(v),
        Err(e) => err(e),
    }
}

#[derive(Serialize)]
pub struct DateRange {
    pub min_date: Option<String>,
    pub max_date: Option<String>,
}

#[tauri::command(rename = "get_asset_date_range")]
pub fn get_asset_date_range(state: State<'_, DbState>, asset_name: String) -> ApiResult<DateRange> {
    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let conn = conn(&state)?;
        let (min_date, max_date): (Option<String>, Option<String>) = conn.query_row(
            "SELECT MIN(Date), MAX(Date) FROM asset_data WHERE asset = ?1",
            params![asset_name],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok::<_, anyhow::Error>(DateRange { min_date, max_date })
    });

    match result {
        Ok(v) => ok(v),
        Err(e) => err(e),
    }
}

#[tauri::command(rename = "add_row")]
pub fn add_row(state: State<'_, DbState>, asset_name: String, new_row: Map<String, Value>) -> ApiResult<Vec<Map<String, Value>>> {
    // Fetch base rows, append, recalc, replace asset data
    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let mut conn = conn(&state)?;

        let mut base: Vec<Map<String, Value>> = {
            let mut stmt = conn.prepare("SELECT Date, Open, High, Low, Close FROM asset_data WHERE asset = ?1 ORDER BY Date")?;
            let rows = stmt.query_map(params![&asset_name], |r| {
                    let mut m = Map::new();
                    let date: Option<String> = r.get(0)?;
                    m.insert("Date".to_string(), date.map(Value::String).unwrap_or(Value::Null));
                    for (i, key) in [(1, "Open"), (2, "High"), (3, "Low"), (4, "Close")] {
                        let v: Option<f64> = r.get(i)?;
                        m.insert(key.to_string(), v.and_then(serde_json::Number::from_f64).map(Value::Number).unwrap_or(Value::Null));
                    }
                    Ok(m)
                })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        base.push(new_row);

        let processed = processor::calculate_derived_columns(&base, true);

        // Replace asset
        conn.execute("DELETE FROM asset_data WHERE asset = ?1", params![&asset_name])?;
        insert_processed(&mut conn, &processed, &asset_name)?;

        Ok::<_, anyhow::Error>(processed)
    });

    match result {
        Ok(v) => ok(v),
        Err(e) => err(e),
    }
}

#[tauri::command(rename = "update_row")]
pub fn update_row(state: State<'_, DbState>, asset_name: String, row_id: Value, updated_row: Map<String, Value>) -> ApiResult<Vec<Map<String, Value>>> {
    let row_id_str = row_id.to_string();

    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let mut conn = conn(&state)?;

        let mut base: Vec<(i64, Map<String, Value>)> = {
            let mut stmt = conn.prepare("SELECT id, Date, Open, High, Low, Close FROM asset_data WHERE asset = ?1 ORDER BY Date")?;
            let rows = stmt.query_map(params![&asset_name], |r| {
                    let id: i64 = r.get(0)?;
                    let mut m = Map::new();
                    let date: Option<String> = r.get(1)?;
                    m.insert("Date".to_string(), date.map(Value::String).unwrap_or(Value::Null));
                    for (i, key) in [(2, "Open"), (3, "High"), (4, "Low"), (5, "Close")] {
                        let v: Option<f64> = r.get(i)?;
                        m.insert(key.to_string(), v.and_then(serde_json::Number::from_f64).map(Value::Number).unwrap_or(Value::Null));
                    }
                    Ok((id, m))
                })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let idx = base.iter().position(|(id, _)| id.to_string() == row_id_str.trim_matches('"'));
        let Some(i) = idx else { return Err(anyhow::anyhow!("Row not found")); };

        // Apply updates
        for (k, v) in updated_row {
            base[i].1.insert(k, v);
        }

        let to_process: Vec<Map<String, Value>> = base.into_iter().map(|(_, m)| m).collect();
        let processed = processor::calculate_derived_columns(&to_process, true);

        conn.execute("DELETE FROM asset_data WHERE asset = ?1", params![&asset_name])?;
        insert_processed(&mut conn, &processed, &asset_name)?;

        Ok::<_, anyhow::Error>(processed)
    });

    match result {
        Ok(v) => ok(v),
        Err(e) => err(e),
    }
}

#[tauri::command(rename = "delete_row")]
pub fn delete_row(state: State<'_, DbState>, asset_name: String, row_id: Value) -> ApiResult<Vec<Map<String, Value>>> {
    let row_id_str = row_id.to_string();

    let result = with_db_lock(&state, || {
        db::ensure_schema(&state.db_path)?;
        let mut conn = conn(&state)?;

        let base: Vec<(i64, Map<String, Value>)> = {
            let mut stmt = conn.prepare("SELECT id, Date, Open, High, Low, Close FROM asset_data WHERE asset = ?1 ORDER BY Date")?;
            let rows = stmt.query_map(params![&asset_name], |r| {
                    let id: i64 = r.get(0)?;
                    let mut m = Map::new();
                    let date: Option<String> = r.get(1)?;
                    m.insert("Date".to_string(), date.map(Value::String).unwrap_or(Value::Null));
                    for (i, key) in [(2, "Open"), (3, "High"), (4, "Low"), (5, "Close")] {
                        let v: Option<f64> = r.get(i)?;
                        m.insert(key.to_string(), v.and_then(serde_json::Number::from_f64).map(Value::Number).unwrap_or(Value::Null));
                    }
                    Ok((id, m))
                })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let keep: Vec<Map<String, Value>> = base
            .into_iter()
            .filter(|(id, _)| id.to_string() != row_id_str.trim_matches('"'))
            .map(|(_, m)| m)
            .collect();

        let processed = processor::calculate_derived_columns(&keep, true);

        conn.execute("DELETE FROM asset_data WHERE asset = ?1", params![&asset_name])?;
        insert_processed(&mut conn, &processed, &asset_name)?;

        Ok::<_, anyhow::Error>(processed)
    });

    match result {
        Ok(v) => ok(v),
        Err(e) => err(e),
    }
}

#[tauri::command(rename = "clear_database")]
pub fn clear_database(state: State<'_, DbState>) -> ApiResult<Value> {
    let result = with_db_lock(&state, || {
        db::clear_all(&state.db_path)?;
        Ok::<_, anyhow::Error>(())
    });

    match result {
        Ok(_) => ApiResult { success: true, data: None, message: None, error: None },
        Err(e) => err(e),
    }
}

fn insert_processed(conn: &mut Connection, data: &[Map<String, Value>], asset_name: &str) -> anyhow::Result<()> {
    let tx = conn.transaction()?;
    let sql = r#"
      INSERT INTO asset_data
        (Date, Open, High, Low, Close, "%change", "M-no", normalized, Average_Norm, True_Seasonal, asset, processed_date)
      VALUES
        (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    "#;
    {
        let mut stmt = tx.prepare(sql)?;
        let now = chrono::Utc::now().to_rfc3339();

        for row in data {
            let date = row.get("Date").and_then(|v| v.as_str()).unwrap_or("");
            let open = row.get("Open").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let high = row.get("High").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let low = row.get("Low").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let close = row.get("Close").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let pct = row.get("%change").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let m_no = row.get("M-no").and_then(|v| v.as_i64()).unwrap_or(0);
            let norm = row.get("normalized").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let avg_norm = row.get("Average_Norm").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let true_seasonal = row.get("True_Seasonal").and_then(|v| v.as_f64()).unwrap_or(0.0);

            stmt.execute(params![
                date,
                open,
                high,
                low,
                close,
                pct,
                m_no,
                norm,
                avg_norm,
                true_seasonal,
                asset_name,
                now
            ])?;
        }
    }

    tx.commit()?;
    Ok(())
}

#[tauri::command(rename = "export_excel")]
pub fn export_excel(data: Vec<Map<String, Value>>, file_path: String) -> ApiResult<Value> {
    use rust_xlsxwriter::Workbook;

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    if data.is_empty() {
        if let Err(e) = workbook.save(&file_path) {
            return err(e.to_string());
        }
        return ApiResult { success: true, data: None, message: None, error: None };
    }

    let preferred_headers = [
        "Date",
        "Open",
        "High",
        "Low",
        "Close",
        "%change",
        "M-no",
        "normalized",
        "Average_Norm",
        "True_Seasonal",
    ];

    let mut headers: Vec<String> = preferred_headers
        .iter()
        .filter(|k| data[0].contains_key(**k))
        .map(|s| s.to_string())
        .collect();

    // Add any extra keys at the end.
    for k in data[0].keys() {
        if !headers.iter().any(|h| h == k) {
            headers.push(k.clone());
        }
    }

    for (col, h) in headers.iter().enumerate() {
        let _ = worksheet.write_string(0, col as u16, h);
    }

    for (row_idx, row) in data.iter().enumerate() {
        let excel_row = (row_idx + 1) as u32;
        for (col, h) in headers.iter().enumerate() {
            let v = row.get(h).unwrap_or(&Value::Null);
            let col_u16 = col as u16;
            match v {
                Value::Null => {}
                Value::Bool(b) => {
                    let _ = worksheet.write_boolean(excel_row, col_u16, *b);
                }
                Value::Number(n) => {
                    if let Some(f) = n.as_f64() {
                        let _ = worksheet.write_number(excel_row, col_u16, f);
                    }
                }
                Value::String(s) => {
                    let _ = worksheet.write_string(excel_row, col_u16, s);
                }
                other => {
                    let _ = worksheet.write_string(excel_row, col_u16, &other.to_string());
                }
            }
        }
    }

    match workbook.save(&file_path) {
        Ok(_) => ApiResult { success: true, data: None, message: None, error: None },
        Err(e) => err(e.to_string()),
    }
}

#[tauri::command(rename = "read_file")]
pub async fn read_file(file_path: String) -> ApiResult<Vec<u8>> {
    match fs::read(&file_path) {
        Ok(bytes) => ok(bytes),
        Err(e) => err(e),
    }
}
