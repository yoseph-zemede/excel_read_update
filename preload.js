const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showSaveDialog: (defaultFilename) => ipcRenderer.invoke('show-save-dialog', defaultFilename),
  readExcelFile: (filePath) => ipcRenderer.invoke('read-excel-file', filePath),
  readExcelBuffer: (buffer) => ipcRenderer.invoke('read-excel-buffer', buffer),
  processData: (data, replaceNaN) => ipcRenderer.invoke('process-data', data, replaceNaN),
  saveToDatabase: (data, assetName) => ipcRenderer.invoke('save-to-database', data, assetName),
  addRow: (assetName, row) => ipcRenderer.invoke('add-row', assetName, row),
  updateRow: (assetName, rowId, updatedRow) => ipcRenderer.invoke('update-row', assetName, rowId, updatedRow),
  deleteRow: (assetName, rowId) => ipcRenderer.invoke('delete-row', assetName, rowId),
  getAssets: () => ipcRenderer.invoke('get-assets'),
  getAssetData: (assetName) => ipcRenderer.invoke('get-asset-data', assetName),
  getDatabaseStats: () => ipcRenderer.invoke('get-database-stats'),
  getAssetDateRange: (assetName) => ipcRenderer.invoke('get-asset-date-range', assetName),
  clearDatabase: () => ipcRenderer.invoke('clear-database'),
  exportExcel: (data, filePath) => ipcRenderer.invoke('export-excel', data, filePath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath)
});

