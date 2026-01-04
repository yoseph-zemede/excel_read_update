use chrono::{Datelike, Duration, NaiveDate};
use serde_json::{Map, Value};
use std::collections::HashMap;

fn excel_serial_to_date(serial: f64) -> Option<NaiveDate> {
    // Match the Electron app's conversion: (serial - 25569) days since Unix epoch.
    let days = (serial - 25569.0).floor() as i64;
    NaiveDate::from_ymd_opt(1970, 1, 1).map(|d| d + Duration::days(days))
}

fn parse_date(value: &Value) -> Option<NaiveDate> {
    match value {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                return None;
            }
            // Try yyyy-mm-dd (what the app typically uses)
            if let Ok(d) = NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
                return Some(d);
            }
            // Try RFC3339-ish timestamps
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
                return Some(dt.date_naive());
            }
            // Try numeric string (Excel serial)
            if let Ok(n) = trimmed.parse::<f64>() {
                return excel_serial_to_date(n);
            }
            None
        }
        Value::Number(n) => n.as_f64().and_then(excel_serial_to_date),
        _ => None,
    }
}

fn as_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

pub fn calculate_derived_columns(input: &[Map<String, Value>], replace_nan_with_zero: bool) -> Vec<Map<String, Value>> {
    // Normalize and sort by date
    let mut rows: Vec<_> = input
        .iter()
        .filter_map(|row| {
            let date = parse_date(row.get("Date")?)?;
            let open = row.get("Open").and_then(as_f64);
            let high = row.get("High").and_then(as_f64);
            let low = row.get("Low").and_then(as_f64);
            let close = row.get("Close").and_then(as_f64);
            Some((date, open, high, low, close))
        })
        .collect();

    rows.sort_by_key(|r| r.0);

    #[derive(Clone)]
    struct Row {
        date: NaiveDate,
        open: f64,
        high: f64,
        low: f64,
        close: f64,
        pct_change: f64,
        month_no: i64,
        normalized: f64,
        average_norm: f64,
        true_seasonal: f64,
        year: i32,
    }

    let mut processed: Vec<Row> = Vec::with_capacity(rows.len());

    for (idx, (date, open, high, low, close)) in rows.into_iter().enumerate() {
        let open = open.unwrap_or(0.0);
        let high = high.unwrap_or(0.0);
        let low = low.unwrap_or(0.0);
        let close = close.unwrap_or(0.0);

        let pct_change = if idx == 0 {
            if replace_nan_with_zero { 0.0 } else { f64::NAN }
        } else {
            let prev_close = processed[idx - 1].close;
            let change = close - prev_close;
            if replace_nan_with_zero {
                if change.is_finite() { change } else { 0.0 }
            } else {
                change
            }
        };

        processed.push(Row {
            date,
            open,
            high,
            low,
            close,
            pct_change,
            month_no: date.month() as i64,
            normalized: 0.0,
            average_norm: 0.0,
            true_seasonal: 0.0,
            year: date.year(),
        });
    }

    // normalized per year
    let mut year_min_max: HashMap<i32, (f64, f64)> = HashMap::new();
    for r in &processed {
        let entry = year_min_max.entry(r.year).or_insert((f64::INFINITY, f64::NEG_INFINITY));
        if r.pct_change.is_finite() {
            entry.0 = entry.0.min(r.pct_change);
            entry.1 = entry.1.max(r.pct_change);
        }
    }

    for r in &mut processed {
        let (min, max) = year_min_max.get(&r.year).copied().unwrap_or((0.0, 0.0));
        let range = max - min;
        let val = if range == 0.0 || !r.pct_change.is_finite() {
            if replace_nan_with_zero { 0.0 } else { f64::NAN }
        } else {
            ((r.pct_change - min) / range) * 100.0
        };
        r.normalized = if replace_nan_with_zero { if val.is_finite() { val } else { 0.0 } } else { val };
    }

    // Average_Norm cumulative by month
    let mut month_sum: [f64; 12] = [0.0; 12];
    let mut month_count: [u32; 12] = [0; 12];
    for r in &mut processed {
        let idx = (r.month_no.clamp(1, 12) - 1) as usize;
        if r.normalized.is_finite() {
            month_sum[idx] += r.normalized;
            month_count[idx] += 1;
        }
        let avg = if month_count[idx] > 0 {
            month_sum[idx] / month_count[idx] as f64
        } else {
            0.0
        };
        r.average_norm = if replace_nan_with_zero { if avg.is_finite() { avg } else { 0.0 } } else { avg };
    }

    // True_Seasonal per year based on Average_Norm
    let mut year_avg_min_max: HashMap<i32, (f64, f64)> = HashMap::new();
    for r in &processed {
        let entry = year_avg_min_max.entry(r.year).or_insert((f64::INFINITY, f64::NEG_INFINITY));
        if r.average_norm.is_finite() {
            entry.0 = entry.0.min(r.average_norm);
            entry.1 = entry.1.max(r.average_norm);
        }
    }

    for r in &mut processed {
        let (min, max) = year_avg_min_max.get(&r.year).copied().unwrap_or((0.0, 0.0));
        let range = max - min;
        let val = if range == 0.0 || !r.average_norm.is_finite() {
            if replace_nan_with_zero { 0.0 } else { f64::NAN }
        } else {
            ((r.average_norm - min) / range) * 100.0
        };
        r.true_seasonal = if replace_nan_with_zero { if val.is_finite() { val } else { 0.0 } } else { val };
    }

    // Convert back to JSON rows
    processed
        .into_iter()
        .map(|r| {
            let mut m = Map::new();
            m.insert("Date".to_string(), Value::String(r.date.format("%Y-%m-%d").to_string()));
            m.insert("Open".to_string(), Value::Number(serde_json::Number::from_f64(r.open).unwrap_or_else(|| serde_json::Number::from(0))));
            m.insert("High".to_string(), Value::Number(serde_json::Number::from_f64(r.high).unwrap_or_else(|| serde_json::Number::from(0))));
            m.insert("Low".to_string(), Value::Number(serde_json::Number::from_f64(r.low).unwrap_or_else(|| serde_json::Number::from(0))));
            m.insert("Close".to_string(), Value::Number(serde_json::Number::from_f64(r.close).unwrap_or_else(|| serde_json::Number::from(0))));
            m.insert("%change".to_string(), Value::Number(serde_json::Number::from_f64(r.pct_change).unwrap_or_else(|| serde_json::Number::from(0))));
            m.insert("M-no".to_string(), Value::Number(serde_json::Number::from(r.month_no)));
            m.insert("normalized".to_string(), Value::Number(serde_json::Number::from_f64(r.normalized).unwrap_or_else(|| serde_json::Number::from(0))));
            m.insert("Average_Norm".to_string(), Value::Number(serde_json::Number::from_f64(r.average_norm).unwrap_or_else(|| serde_json::Number::from(0))));
            m.insert("True_Seasonal".to_string(), Value::Number(serde_json::Number::from_f64(r.true_seasonal).unwrap_or_else(|| serde_json::Number::from(0))));
            m
        })
        .collect()
}
