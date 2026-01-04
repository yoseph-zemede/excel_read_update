# Asset Analyzer - Tauri Desktop App

A desktop application for financial data analysis with seasonal pattern detection, built with **Tauri (Rust)** and a **vanilla HTML/JS** frontend.

## Features

- 📥 Upload Excel files with financial data (Date, Open, High, Low, Close columns)
- 📊 Automatic seasonal calculations and data normalization
- 📈 Interactive graphing
- 💾 Local SQLite database storage
- 🎨 Modern, clean user interface

## Requirements

- Node.js (v16+ recommended)
- Rust toolchain (stable) + Cargo
- Tauri system dependencies for your OS (Linux typically needs WebKitGTK)

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Application

Start the application in development mode:
```bash
npm run dev
```

## Building for Production

Build the application for your platform:
```bash
npm run build
```

Artifacts are produced under `src-tauri/target/release/bundle`.

## Project Structure

```
├── package.json            # Node deps + Tauri CLI scripts
├── src-tauri/              # Tauri (Rust) backend
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs         # Tauri entrypoint
│       ├── commands.rs     # Tauri commands (invoke handlers)
│       ├── db.rs           # SQLite helpers
│       └── processor.rs    # Derived-column calculations
├── frontend/
│   ├── index.html          # Main UI
│   ├── styles.css          # Application styles
│   ├── main.js             # Frontend JavaScript
│   ├── tauri_bridge.js     # Provides window.electronAPI via Tauri invoke
│   └── vendor/
│       └── plotly.min.js   # Copied from node_modules at build/dev time
└── scripts/
	└── copy-vendor.js      # Copies Plotly into frontend/vendor
```

## Usage

1. **Upload Tab**: Upload an Excel file with Date, Open, High, Low, Close columns
2. **Analysis Tab**: View and analyze saved data with interactive charts
3. **Graphs Tab**: Create custom graphs with date filters and options
4. **Settings Tab**: Manage database and application settings

## Technologies Used

- **Tauri**: Desktop application framework
- **Rust**: Backend (Excel parsing, database, export)
- **calamine**: Excel parsing
- **rusqlite (bundled)**: SQLite storage
- **rust_xlsxwriter**: Excel export
- **Plotly**: Frontend charting

## License

MIT





