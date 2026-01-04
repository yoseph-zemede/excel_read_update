#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod db;
mod processor;

use db::DbState;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = db::default_db_path(app)?;
            db::ensure_schema(&db_path)?;

            app.manage(DbState {
                db_path,
                lock: Mutex::new(()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::show_open_dialog,
            commands::show_save_dialog,
            commands::read_excel_file,
            commands::read_excel_buffer,
            commands::process_data,
            commands::save_to_database,
            commands::get_assets,
            commands::get_asset_data,
            commands::get_database_stats,
            commands::get_asset_date_range,
            commands::add_row,
            commands::update_row,
            commands::delete_row,
            commands::clear_database,
            commands::export_excel,
            commands::read_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
