// Disable sandbox on Linux - must be set before requiring electron
if (process.platform === 'linux') {
  process.argv.push('--no-sandbox');
}

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('./backend/database');
const DataProcessor = require('./backend/dataProcessor');
const XLSX = require('xlsx');

// Also set via app command line (backup method)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('--no-sandbox');
}

let mainWindow;
// No child windows for fullscreen; using in-app page navigation
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'default',
    backgroundColor: '#ffffff'
  });

  // Load the frontend
  const indexPath = path.join(__dirname, 'frontend', 'index.html');
  mainWindow.loadFile(indexPath);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize database
app.whenReady().then(async () => {
  const dbPath = path.join(__dirname, 'asset_data.db');
  db = new Database(dbPath);
  await db.initialize();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
    ]
  });
  return result;
});

ipcMain.handle('show-save-dialog', async (event, defaultFilename) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename,
    filters: [
      { name: 'Excel Files', extensions: ['xlsx'] },
      { name: 'Database Files', extensions: ['db'] }
    ]
  });
  return result;
});

ipcMain.handle('read-excel-file', async (event, filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-excel-buffer', async (event, uint8Array) => {
  try {
    const buffer = Buffer.from(uint8Array);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('process-data', async (event, data, replaceNaN) => {
  try {
    const processor = new DataProcessor();
    const processed = processor.calculateDerivedColumns(data, replaceNaN);
    return { success: true, data: processed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-to-database', async (event, data, assetName) => {
  try {
    const result = db.saveAssetData(data, assetName);
    return { success: true, message: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-assets', async () => {
  try {
    const assets = db.getAssets();
    return { success: true, data: assets };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-asset-data', async (event, assetName) => {
  try {
    const data = db.getAssetData(assetName);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-database-stats', async () => {
  try {
    const stats = db.getStats();
    return { success: true, data: stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-asset-date-range', async (event, assetName) => {
  try {
    const range = db.getAssetDateRange(assetName);
    return { success: true, data: range };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-row', async (event, assetName, newRow) => {
  try {
    const processor = new DataProcessor();
    // Get existing rows for asset
    const existing = db.getAssetData(assetName) || [];
    const base = existing.map(r => ({ Date: r.Date, Open: r.Open, High: r.High, Low: r.Low, Close: r.Close }));

    // Append new row
    base.push(newRow);

    const processed = processor.calculateDerivedColumns(base, true);

    // Replace asset data in DB
    db.deleteAssetData(assetName);
    db.saveAssetData(processed, assetName);

    return { success: true, data: processed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-row', async (event, assetName, rowId, updatedRow) => {
  try {
    const processor = new DataProcessor();
    const existing = db.getAssetData(assetName) || [];

    const base = existing.map(r => ({ id: r.id, Date: r.Date, Open: r.Open, High: r.High, Low: r.Low, Close: r.Close }));

    const idx = base.findIndex(r => r.id === rowId || String(r.id) === String(rowId));
    if (idx === -1) {
      return { success: false, error: 'Row not found' };
    }

    // Replace fields (updatedRow may contain Date/Open/High/Low/Close)
    base[idx] = { ...base[idx], ...updatedRow };

    // Remove id before processing
    const toProcess = base.map(r => ({ Date: r.Date, Open: r.Open, High: r.High, Low: r.Low, Close: r.Close }));

    const processed = processor.calculateDerivedColumns(toProcess, true);

    // Replace in DB
    db.deleteAssetData(assetName);
    db.saveAssetData(processed, assetName);

    return { success: true, data: processed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-row', async (event, assetName, rowId) => {
  try {
    const processor = new DataProcessor();
    const existing = db.getAssetData(assetName) || [];

    const remaining = existing
      .filter(r => !(r.id === rowId || String(r.id) === String(rowId)))
      .map(r => ({ Date: r.Date, Open: r.Open, High: r.High, Low: r.Low, Close: r.Close }));

    // Recalculate derived columns after deletion
    const processed = processor.calculateDerivedColumns(remaining, true);

    // Replace in DB
    db.deleteAssetData(assetName);
    db.saveAssetData(processed, assetName);

    return { success: true, data: processed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-database', async () => {
  try {
    db.clearAll();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-excel', async (event, data, filePath) => {
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Processed_Data');
    XLSX.writeFile(wb, filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Removed window-based fullscreen; charts open in a dedicated page within the main window

