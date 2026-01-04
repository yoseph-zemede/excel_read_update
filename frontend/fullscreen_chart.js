function renderChartFromSession(){
  const chartEl = document.getElementById('chart');
  const titleEl = document.getElementById('chart-title');
  const dtypeLabel = document.getElementById('datatype-label');
  const dtypeSelect = document.getElementById('datatype-select');
  const assetLabel = document.getElementById('asset-label');
  const assetSelect = document.getElementById('asset-select');
  const yearLabel = document.getElementById('year-label');
  const yearSelect = document.getElementById('year-select');
  try {
    const raw = sessionStorage.getItem('chartPayload');
    if (!raw) {
      chartEl.innerHTML = '<div class="error-message">No chart data found.</div>';
      return;
    }
    const payload = JSON.parse(raw);
    const theme = (function(){ try { return localStorage.getItem('theme'); } catch(e){ return 'light'; } })() || 'light';
    const layoutOverride = getPlotlyThemeLayout(theme);

    // If year-graph, enable data type selection and rebuild traces from data
    if (payload.meta && payload.meta.kind === 'year-graph' && window.electronAPI && typeof window.electronAPI.getAssetData === 'function') {
      const initialAsset = payload.meta.assetName;
      const initialYear = payload.meta.year;
      const initialType = payload.meta.dataType || 'normalized';
      if (dtypeLabel) dtypeLabel.style.display = 'inline-flex';
      if (assetLabel) assetLabel.style.display = 'inline-flex';
      if (yearLabel) yearLabel.style.display = 'inline-flex';
      if (dtypeSelect) dtypeSelect.value = initialType;
      if (payload.title) titleEl.textContent = payload.title;
      initYearGraphControls(initialAsset, initialYear, initialType, layoutOverride);
      return;
    }

    // Default: render provided traces
    const traces = payload.traces || [];
    const layout = Object.assign({}, (payload.layout || {}), layoutOverride);
    const config = payload.config || { responsive: true, displaylogo: false };
    if (payload.title) titleEl.textContent = payload.title;
    Plotly.newPlot(chartEl, traces, layout, config).then(() => {
      try { Plotly.Plots.resize(chartEl); } catch(e){}
    });
  } catch (e) {
    chartEl.innerHTML = '<div class="error-message">Error rendering chart.</div>';
  }
}

window.addEventListener('resize', () => {
  const chartEl = document.getElementById('chart');
  try { Plotly.Plots.resize(chartEl); } catch(e){}
});

window.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('back-btn');
  backBtn.addEventListener('click', () => {
    // Navigate back to main page and select Graphs tab
    try { sessionStorage.setItem('returnTab', 'graphs'); } catch(e){}
    window.location.href = 'index.html';
  });
  // Apply and toggle theme
  const savedTheme = (function(){ try { return localStorage.getItem('theme'); } catch(e){ return null; } })() || 'light';
  if (savedTheme === 'dark') document.body.classList.add('dark');
  const themeToggle = document.getElementById('theme-toggle-fullscreen');
  if (themeToggle) {
    themeToggle.textContent = savedTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
    themeToggle.addEventListener('click', () => {
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      document.body.classList.toggle('dark', next === 'dark');
      try { localStorage.setItem('theme', next); } catch(e){}
      renderChartFromSession();
      themeToggle.textContent = next === 'dark' ? '☀️ Light' : '🌙 Dark';
    });
  }
  renderChartFromSession();
});

// Theme helpers (duplicated minimal from main.js)
function getPlotlyThemeLayout(theme) {
  const isDark = theme === 'dark';
  return {
    paper_bgcolor: isDark ? '#0b0b0b' : '#ffffff',
    plot_bgcolor: isDark ? '#0b0b0b' : '#ffffff',
    font: { color: isDark ? '#e5e7eb' : '#1e293b' },
    xaxis: {
      gridcolor: isDark ? '#374151' : '#e5e7eb',
      linecolor: isDark ? '#9ca3af' : '#1f2937',
      tickfont: { color: isDark ? '#e5e7eb' : '#1e293b' }
    },
    yaxis: {
      gridcolor: isDark ? '#374151' : '#e5e7eb',
      linecolor: isDark ? '#9ca3af' : '#1f2937',
      tickfont: { color: isDark ? '#e5e7eb' : '#1e293b' }
    }
  };
}

// Build month averages and render a year graph in fullscreen
async function renderYearGraphFullscreen(assetName, year, dataType, layoutOverride){
  const chartEl = document.getElementById('chart');
  try {
    const result = await window.electronAPI.getAssetData(assetName);
    if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
      chartEl.innerHTML = '<div class="error-message">No data available.</div>';
      return;
    }
    const rowsForYear = result.data.filter(row => {
      const d = new Date(row.Date);
      return d.getFullYear() === parseInt(year);
    });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const months = [];
    const values = [];
    for (let m=1; m<=12; m++){
      const monthRows = rowsForYear.filter(row => { const d = new Date(row.Date); return d.getMonth()+1 === m; });
      months.push(monthNames[m-1]);
      if (monthRows.length > 0){
        const avg = monthRows.reduce((sum, row) => sum + (row[dataType] || 0), 0) / monthRows.length;
        values.push(avg);
      } else {
        values.push(null);
      }
    }

    const color = dataType === 'normalized' ? '#6366f1' : '#8b5cf6';
    const title = `${assetName} - ${year} - ${dataType === 'normalized' ? 'Normalized Data' : 'True Seasonal Data'}`;
    const lineTrace = {
      x: months,
      y: values,
      type: 'scatter',
      mode: 'lines+markers',
      line: { color, shape: 'spline', width: 3 },
      marker: { size: 6 },
      name: dataType === 'normalized' ? 'Normalized Data' : 'True Seasonal Data'
    };
    const traces = [lineTrace];
    const baseLayout = { title, margin: { t: 30, r: 20, b: 40, l: 60 }, xaxis: { type: 'category' }, yaxis: { autorange: true }, hovermode: 'x unified', showlegend: true };
    const layout = Object.assign({}, baseLayout, layoutOverride || {});
    const config = { responsive: true, scrollZoom: true, displaylogo: false };
    Plotly.newPlot(chartEl, traces, layout, config).then(() => { try { Plotly.Plots.resize(chartEl); } catch(e){} });
  } catch (e) {
    chartEl.innerHTML = '<div class="error-message">Error rendering year graph.</div>';
  }
}

async function initYearGraphControls(initialAsset, initialYear, initialType, layoutOverride){
  const assetSelect = document.getElementById('asset-select');
  const yearSelect = document.getElementById('year-select');
  const dtypeSelect = document.getElementById('datatype-select');
  // Load assets
  try {
    const assetsRes = await window.electronAPI.getAssets();
    if (assetsRes && assetsRes.success && Array.isArray(assetsRes.data)) {
      const assets = assetsRes.data;
      assetSelect.innerHTML = assets.map(a => `<option value="${a}">${a}</option>`).join('');
      assetSelect.value = initialAsset || (assets[0] || '');
    }
  } catch(e){}
  // Load years for selected asset
  await populateYearsForAsset(assetSelect.value, initialYear);
  // Event handlers
  assetSelect.onchange = async () => {
    await populateYearsForAsset(assetSelect.value);
    const year = yearSelect.value;
    const dtype = dtypeSelect.value || initialType;
    renderYearGraphFullscreen(assetSelect.value, year, dtype, layoutOverride);
  };
  yearSelect.onchange = () => {
    const dtype = dtypeSelect.value || initialType;
    renderYearGraphFullscreen(assetSelect.value, yearSelect.value, dtype, layoutOverride);
  };
  dtypeSelect.onchange = () => {
    renderYearGraphFullscreen(assetSelect.value, yearSelect.value, dtypeSelect.value, layoutOverride);
  };
  // Initial render
  renderYearGraphFullscreen(assetSelect.value, yearSelect.value || initialYear, dtypeSelect.value || initialType, layoutOverride);
}

async function populateYearsForAsset(assetName, preferYear){
  const yearSelect = document.getElementById('year-select');
  try {
    const res = await window.electronAPI.getAssetData(assetName);
    if (res && res.success && Array.isArray(res.data)){
      const yearsSet = new Set(res.data.map(r => new Date(r.Date).getFullYear()));
      const years = Array.from(yearsSet).sort((a,b) => b-a);
      yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
      yearSelect.value = preferYear && years.includes(parseInt(preferYear)) ? preferYear : (years[0] || '');
    }
  } catch(e){}
}
