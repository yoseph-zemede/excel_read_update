class DataProcessor {
  calculateDerivedColumns(data, replaceNaNWithZero = true) {
    // Convert to array and sort by date
    let df = JSON.parse(JSON.stringify(data));
    
    // Parse dates and sort - handle various date formats
    df = df.map(row => {
      let date;
      if (typeof row.Date === 'string') {
        // Try parsing as ISO date or Excel date
        date = new Date(row.Date);
        if (isNaN(date.getTime())) {
          // Try Excel serial date (days since 1900-01-01)
          const excelDate = parseFloat(row.Date);
          if (!isNaN(excelDate)) {
            date = new Date((excelDate - 25569) * 86400 * 1000);
          }
        }
      } else if (typeof row.Date === 'number') {
        // Excel serial date
        date = new Date((row.Date - 25569) * 86400 * 1000);
      } else {
        date = new Date(row.Date);
      }
      
      return {
        ...row,
        Date: date
      };
    }).filter(row => !isNaN(row.Date.getTime()))
      .sort((a, b) => a.Date - b.Date);

    // Calculate %change
    df = df.map((row, index) => {
      if (index === 0) {
        return { ...row, '%change': replaceNaNWithZero ? 0 : null };
      }
      const change = row.Close - df[index - 1].Close;
      return { ...row, '%change': replaceNaNWithZero ? (change || 0) : change };
    });

    // Add M-no (month) and Year
    df = df.map(row => ({
      ...row,
      'M-no': row.Date.getMonth() + 1,
      Year: row.Date.getFullYear()
    }));

    // Group by year and calculate normalized
    const years = [...new Set(df.map(row => row.Year))];
    df = df.map(row => {
      const yearData = df.filter(r => r.Year === row.Year);
      const changes = yearData.map(r => r['%change']).filter(v => v !== null && v !== undefined);
      
      if (changes.length === 0) {
        return { ...row, normalized: replaceNaNWithZero ? 0 : null };
      }

      const min = Math.min(...changes);
      const max = Math.max(...changes);
      const range = max - min;

      if (range === 0) {
        return { ...row, normalized: replaceNaNWithZero ? 0 : null };
      }

      const normalized = ((row['%change'] - min) / range) * 100;
      return { 
        ...row, 
        normalized: replaceNaNWithZero ? (normalized || 0) : normalized 
      };
    });

    // Calculate Average_Norm by month
    df = df.map((row, index) => {
      const month = row['M-no'];
      const monthRows = df.filter((r, i) => r['M-no'] === month && i <= index)
        .sort((a, b) => a.Date - b.Date);
      
      const normalizedValues = monthRows.map(r => r.normalized).filter(v => v !== null && v !== undefined);
      
      if (normalizedValues.length === 0) {
        return { ...row, Average_Norm: replaceNaNWithZero ? 0 : null };
      }

      const cumulativeSum = normalizedValues.reduce((sum, val) => sum + val, 0);
      const count = normalizedValues.length;
      const averageNorm = count > 0 ? cumulativeSum / count : 0;

      return { ...row, Average_Norm: replaceNaNWithZero ? (averageNorm || 0) : averageNorm };
    });

    // Calculate True_Seasonal by year
    df = df.map(row => {
      const yearData = df.filter(r => r.Year === row.Year);
      const avgNorms = yearData.map(r => r.Average_Norm).filter(v => v !== null && v !== undefined);
      
      if (avgNorms.length === 0) {
        return { ...row, True_Seasonal: replaceNaNWithZero ? 0 : null };
      }

      const min = Math.min(...avgNorms);
      const max = Math.max(...avgNorms);
      const range = max - min;

      if (range === 0) {
        return { ...row, True_Seasonal: replaceNaNWithZero ? 0 : null };
      }

      const trueSeasonal = ((row.Average_Norm - min) / range) * 100;
      return { 
        ...row, 
        True_Seasonal: replaceNaNWithZero ? (trueSeasonal || 0) : trueSeasonal 
      };
    });

    // Remove Year column and reorder
    df = df.map(row => {
      const { Year, ...rest } = row;
      return rest;
    });

    // Convert dates back to ISO strings for JSON serialization
    df = df.map(row => ({
      ...row,
      Date: row.Date.toISOString().split('T')[0]
    }));

    return df;
  }
}

module.exports = DataProcessor;

