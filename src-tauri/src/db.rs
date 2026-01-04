use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

pub struct DbState {
    pub db_path: PathBuf,
    pub lock: Mutex<()>,
}

pub fn default_db_path(app: &tauri::App) -> anyhow::Result<PathBuf> {
    let base = app.path().app_data_dir()?;
    std::fs::create_dir_all(&base)?;
    Ok(base.join("asset_data.db"))
}

pub fn ensure_schema(db_path: &Path) -> anyhow::Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS asset_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          Date TEXT,
          Open REAL,
          High REAL,
          Low REAL,
          Close REAL,
          "%change" REAL,
          "M-no" INTEGER,
          normalized REAL,
          Average_Norm REAL,
          True_Seasonal REAL,
          asset TEXT,
          processed_date TEXT
        );
        "#,
    )?;
    Ok(())
}

pub fn with_conn<T>(db_path: &Path, f: impl FnOnce(&Connection) -> anyhow::Result<T>) -> anyhow::Result<T> {
    let conn = Connection::open(db_path)?;
    f(&conn)
}

pub fn clear_all(db_path: &Path) -> anyhow::Result<()> {
    with_conn(db_path, |conn| {
        conn.execute("DROP TABLE IF EXISTS asset_data", [])?;
        Ok(())
    })?;
    ensure_schema(db_path)?;
    Ok(())
}
