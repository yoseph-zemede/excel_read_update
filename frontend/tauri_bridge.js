(function () {
  // Provide an Electron-like API surface so the existing frontend can stay unchanged.
  const normalizeErrorMessage = (err) => {
    if (err && typeof err === 'object') {
      if (err instanceof Error && err.message) return err.message;
      if (typeof err.message === 'string' && err.message) return err.message;
      if (typeof err.error === 'string' && err.error) return err.error;
      try {
        return JSON.stringify(err);
      } catch (_) {
        return String(err);
      }
    }
    if (typeof err === 'string' && err) return err;
    if (err === null || typeof err === 'undefined') return 'Unknown error';
    return String(err);
  };

  const invoke = async (cmd, args) => {
    const t = window.__TAURI__;
    const invoker =
      (t && typeof t.invoke === 'function' && t.invoke) ||
      (t && t.core && typeof t.core.invoke === 'function' && t.core.invoke);

    if (!invoker) {
      throw new Error('Tauri runtime not available (missing __TAURI__.core.invoke)');
    }

    // Tauri expects args to be an object; passing `undefined` can reject in some builds.
    try {
      return await invoker(cmd, args ?? {});
    } catch (err) {
      throw new Error(normalizeErrorMessage(err));
    }
  };

  window.electronAPI = {
    showOpenDialog: () => invoke('show_open_dialog'),
    showSaveDialog: (defaultFilename) => invoke('show_save_dialog', { defaultFilename }),

    readExcelFile: (filePath) => invoke('read_excel_file', { filePath }),
    readExcelBuffer: (buffer) => invoke('read_excel_buffer', { buffer }),

    processData: (data, replaceNaN) => invoke('process_data', { data, replaceNan: replaceNaN }),

    saveToDatabase: (data, assetName) => invoke('save_to_database', { data, assetName }),
    addRow: (assetName, row) => invoke('add_row', { assetName, newRow: row }),
    updateRow: (assetName, rowId, updatedRow) => invoke('update_row', { assetName, rowId, updatedRow }),
    deleteRow: (assetName, rowId) => invoke('delete_row', { assetName, rowId }),

    getAssets: () => invoke('get_assets'),
    getAssetData: (assetName) => invoke('get_asset_data', { assetName }),
    getDatabaseStats: () => invoke('get_database_stats'),
    getAssetDateRange: (assetName) => invoke('get_asset_date_range', { assetName }),

    clearDatabase: () => invoke('clear_database'),

    exportExcel: (data, filePath) => invoke('export_excel', { data, filePath }),
    readFile: (filePath) => invoke('read_file', { filePath })
  };
})();
