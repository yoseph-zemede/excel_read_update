const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class AssetDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.SQL = null;
  }

  async initialize() {
    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }
    
    // Load existing database or create new one
    try {
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
      } else {
        this.db = new this.SQL.Database();
      }
    } catch (error) {
      // If file doesn't exist or is corrupted, create new database
      this.db = new this.SQL.Database();
    }
    
    this.createSchema();
  }

  createSchema() {
    this.db.run(`
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
      )
    `);
    this.saveToFile();
  }

  saveAssetData(data, assetName) {
    const stmt = this.db.prepare(`
      INSERT INTO asset_data 
      (Date, Open, High, Low, Close, "%change", "M-no", normalized, Average_Norm, True_Seasonal, asset, processed_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of data) {
      stmt.run([
        row.Date,
        row.Open,
        row.High,
        row.Low,
        row.Close,
        row['%change'],
        row['M-no'],
        row.normalized,
        row.Average_Norm,
        row.True_Seasonal,
        assetName,
        new Date().toISOString()
      ]);
    }
    
    stmt.free();
    this.saveToFile();
    return `Successfully saved ${data.length} rows for '${assetName}'`;
  }

  getAssets() {
    const result = this.db.exec('SELECT DISTINCT asset FROM asset_data ORDER BY asset');
    if (result.length === 0) return [];
    return result[0].values.map(row => row[0]);
  }

  getAssetData(assetName) {
    const stmt = this.db.prepare('SELECT * FROM asset_data WHERE asset = ? ORDER BY Date');
    stmt.bind([assetName]);
    
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row);
    }
    
    stmt.free();
    return rows;
  }

  getStats() {
    const totalResult = this.db.exec('SELECT COUNT(*) as count FROM asset_data');
    const assetsResult = this.db.exec('SELECT COUNT(DISTINCT asset) as count FROM asset_data');
    const dateResult = this.db.exec('SELECT MIN(Date) as min_date, MAX(Date) as max_date FROM asset_data');
    
    const totalRecords = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;
    const assetsCount = assetsResult.length > 0 ? assetsResult[0].values[0][0] : 0;
    const minDate = dateResult.length > 0 && dateResult[0].values.length > 0 ? dateResult[0].values[0][0] : null;
    const maxDate = dateResult.length > 0 && dateResult[0].values.length > 0 ? dateResult[0].values[0][1] : null;

    return {
      total_records: totalRecords,
      assets_count: assetsCount,
      min_date: minDate,
      max_date: maxDate
    };
  }

  getAssetDateRange(assetName) {
    const stmt = this.db.prepare('SELECT MIN(Date) as min_date, MAX(Date) as max_date FROM asset_data WHERE asset = ?');
    stmt.bind([assetName]);
    
    let result = { min_date: null, max_date: null };
    if (stmt.step()) {
      const row = stmt.getAsObject();
      result = {
        min_date: row.min_date,
        max_date: row.max_date
      };
    }
    
    stmt.free();
    return result;
  }

  deleteAssetData(assetName) {
    const stmt = this.db.prepare('DELETE FROM asset_data WHERE asset = ?');
    stmt.bind([assetName]);
    try {
      stmt.step();
    } catch (e) {
      // ignore
    }
    stmt.free();
    this.saveToFile();
  }

  deleteAssetRow(assetName, rowId) {
    const stmt = this.db.prepare('DELETE FROM asset_data WHERE asset = ? AND id = ?');
    stmt.bind([assetName, rowId]);
    try {
      stmt.step();
    } catch (e) {
      // ignore
    }
    stmt.free();
    this.saveToFile();
  }

  clearAll() {
    this.db.run('DROP TABLE IF EXISTS asset_data');
    this.createSchema();
  }

  saveToFile() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  close() {
    if (this.db) {
      this.saveToFile();
      this.db.close();
    }
  }
}

module.exports = AssetDatabase;

