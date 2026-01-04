// Tab switching
document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Update buttons
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-panel').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Load tab-specific data
        if (tabName === 'analysis') {
            loadAnalysisTab();
        } else if (tabName === 'graphs') {
            loadGraphsTab();
        } else if (tabName === 'posneg') {
            loadPosNegTab();
        } else if (tabName === 'settings') {
            loadSettingsTab();
        }
    });
});

// Positive/Negative Tab
function parsePercentChange(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    // Allow values like "1.23%" or "-0.5"
    const cleaned = trimmed.replace('%', '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function getRowMonthNumber(row) {
    const mNo = row && (row['M-no'] ?? row['M_no'] ?? row['month'] ?? row['Month']);
    const mAsNumber = Number(mNo);
    if (Number.isFinite(mAsNumber) && mAsNumber >= 1 && mAsNumber <= 12) {
        return Math.floor(mAsNumber);
    }

    const dateValue = row && row.Date;
    const date = new Date(dateValue);
    if (!Number.isNaN(date.getTime())) {
        return date.getMonth() + 1;
    }
    return null;
}

function buildPosNegMonthlyStats(data) {
    const months = Array.from({ length: 12 }, (_, i) => ({
        monthNo: i + 1,
        positiveCount: 0,
        negativeCount: 0,
        positivePct: 0,
        negativePct: 0
    }));

    for (const row of (data || [])) {
        const monthNo = getRowMonthNumber(row);
        if (!monthNo) continue;

        const change = parsePercentChange(row['%change'] ?? row['%Change'] ?? row['pct_change'] ?? row['pctChange']);
        if (change === null) continue;

        if (change > 0) {
            months[monthNo - 1].positiveCount += 1;
        } else if (change < 0) {
            months[monthNo - 1].negativeCount += 1;
        }
        // change === 0 counts as neither
    }

    for (const m of months) {
        const total = m.positiveCount + m.negativeCount;
        if (total > 0) {
            m.positivePct = (m.positiveCount / total) * 100;
            m.negativePct = (m.negativeCount / total) * 100;
        }
    }

    return months;
}

function renderPosNegTableFromStats(stats) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let html = '<table class="data-table posneg-table"><thead><tr>';
    html += '<th>Month</th><th>Positive</th><th>Negative</th>';
    html += '</tr></thead><tbody>';

    for (const m of stats) {
        const pos = m.positivePct;
        const neg = m.negativePct;

        let rowClass = '';
        if (pos >= 60) rowClass = 'posneg-row-positive';
        else if (neg >= 60) rowClass = 'posneg-row-negative';

        html += `<tr class="${rowClass}">`;
        html += `<td>${monthNames[m.monthNo - 1]}</td>`;
        html += `<td>${pos.toFixed(1)}%</td>`;
        html += `<td>${neg.toFixed(1)}%</td>`;
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

async function loadPosNegTab() {
    const container = document.getElementById('posneg-table-container');
    const assetSelect = document.getElementById('posneg-asset');
    if (!container || !assetSelect) return;

    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Loading assets...</p></div>';

    try {
        const assetsResult = await window.electronAPI.getAssets();
        if (!assetsResult.success || assetsResult.data.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No assets found. Please upload data first.</p></div>';
            assetSelect.innerHTML = '';
            return;
        }

        const assets = assetsResult.data;
        assetSelect.innerHTML = assets.map(a => `<option value="${a}">${a}</option>`).join('');

        assetSelect.onchange = () => {
            renderPosNegTable();
        };

        await renderPosNegTable();
    } catch (error) {
        container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

async function renderPosNegTable() {
    const container = document.getElementById('posneg-table-container');
    const assetSelect = document.getElementById('posneg-asset');
    if (!container || !assetSelect) return;

    const assetName = assetSelect.value;
    if (!assetName) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">➕➖</div><p>Select an asset to view monthly percentages</p></div>';
        return;
    }

    container.innerHTML = '<p class="info-message">Loading...</p>';

    try {
        const result = await window.electronAPI.getAssetData(assetName);
        if (!result.success || !result.data || result.data.length === 0) {
            container.innerHTML = `<p class="info-message">📭 No data found for ${assetName}</p>`;
            return;
        }

        const stats = buildPosNegMonthlyStats(result.data);
        container.innerHTML = renderPosNegTableFromStats(stats);
    } catch (error) {
        container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

// Theme handling
function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('dark', isDark);
    try { localStorage.setItem('theme', theme); } catch(e){}
}

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

function updatePlotlyTheme(theme) {
    if (typeof Plotly === 'undefined') return;
    const layoutOverride = getPlotlyThemeLayout(theme);
    const plots = document.querySelectorAll('.js-plotly-plot');
    plots.forEach(plot => {
        try { Plotly.relayout(plot, layoutOverride); } catch(e){}
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForGlobal(name, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (typeof window[name] !== 'undefined') return true;
        await sleep(50);
    }
    return false;
}

let _themeUiInitialized = false;
function initThemeUi() {
    if (_themeUiInitialized) return;
    _themeUiInitialized = true;

    const savedTheme = (function(){ try { return localStorage.getItem('theme'); } catch(e){ return null; } })() || 'light';
    applyTheme(savedTheme);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const next = document.body.classList.contains('dark') ? 'light' : 'dark';
            applyTheme(next);
            updatePlotlyTheme(next);
            toggleBtn.textContent = next === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
        });
        toggleBtn.textContent = savedTheme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    }

    // If returning from fullscreen, go to Graphs tab
    try {
        const returnTab = sessionStorage.getItem('returnTab');
        if (returnTab) {
            sessionStorage.removeItem('returnTab');
            const navBtn = document.querySelector(`.nav-item[data-tab="${returnTab}"]`);
            if (navBtn) navBtn.click();
        }
    } catch(e){}
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initThemeUi);
} else {
    initThemeUi();
}

// Upload Tab
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const uploadResults = document.getElementById('upload-results');
const assetNameInput = document.getElementById('asset-name');
const replaceNaNCheckbox = document.getElementById('replace-nan');
    

if (uploadZone && fileInput) {
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--primary)';
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = 'var(--border)';
});
uploadZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (file) {
        await handleFileUpload(file);
    }
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await handleFileUpload(file);
    }
});
}

async function handleFileUpload(file) {
    if (!uploadResults) {
        throw new Error('Upload UI not initialized (missing #upload-results)');
    }
    uploadResults.innerHTML = '<p class="info-message">Processing file...</p>';
    uploadResults.classList.remove('hidden');
    
    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Convert to Uint8Array for IPC
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Read Excel file
        const readResult = await window.electronAPI.readExcelBuffer(Array.from(uint8Array));
        if (!readResult.success) {
            throw new Error(readResult.error);
        }
        
        // Validate required columns
        const requiredColumns = ['Date', 'Open', 'High', 'Low', 'Close'];
        const missingColumns = requiredColumns.filter(col => 
            !readResult.data.some(row => row.hasOwnProperty(col))
        );
        
        if (missingColumns.length > 0) {
            throw new Error(`Missing columns: ${missingColumns.join(', ')}`);
        }
        
        // Process data
        const processResult = await window.electronAPI.processData(
            readResult.data,
            replaceNaNCheckbox.checked
        );
        
        if (!processResult.success) {
            throw new Error(processResult.error);
        }
        
        const processedData = processResult.data;
        
        // Store processed data
        currentProcessedData = processedData;
        
        // Display stats
        const stats = calculateStats(processedData);
        displayUploadResults(processedData, stats);
        
    } catch (error) {
        uploadResults.innerHTML = `<div class="error-message">❌ Error: ${error.message}</div>`;
    }
}

function calculateStats(data) {
    const dates = data.map(row => new Date(row.Date));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const years = new Set(data.map(row => new Date(row.Date).getFullYear()));
    const months = new Set(data.map(row => row['M-no']));
    
    return {
        totalRecords: data.length,
        dateRange: `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        years: years.size,
        months: months.size
    };
}

function displayUploadResults(data, stats) {
    const assetName = assetNameInput.value;
    
    uploadResults.innerHTML = `
        <div class="success-message">✅ File processed successfully</div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total Records</div>
                <div class="stat-value">${stats.totalRecords}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Date Range</div>
                <div class="stat-value" style="font-size: 1.1rem;">${stats.dateRange}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Years</div>
                <div class="stat-value">${stats.years}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Months</div>
                <div class="stat-value">${stats.months}</div>
            </div>
        </div>
        <div class="expander">
            <div class="expander-header" onclick="toggleExpander(this)">
                <span>📋 Preview Data</span>
                <span>▼</span>
            </div>
            <div class="expander-content" style="display: none;">
                ${createDataTable(data.slice(0, 8))}
            </div>
        </div>
        <button class="btn btn-primary" onclick="saveToDatabase()" style="margin-top: 1rem; width: 100%;">💾 Save to Database</button>
    `;
    uploadResults.classList.remove('hidden');
}

function toggleExpander(header) {
    const content = header.nextElementSibling;
    const arrow = header.querySelector('span:last-child');
    if (content.style.display === 'none' || !content.style.display) {
        content.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
    }
}

function createDataTable(data) {
    if (data.length === 0) return '<p>No data to display</p>';
    const hasId = data.some(r => r && Object.prototype.hasOwnProperty.call(r, 'id'));
    const columns = ['Date', 'Open', 'High', 'Low', 'Close', '%change', 'M-no', 'normalized', 'Average_Norm', 'True_Seasonal'];
    if (hasId) columns.push('Actions');

    let html = '<table class="data-table"><thead><tr>';
    columns.forEach(col => {
        html += `<th>${col}</th>`;
    });
    html += '</tr></thead><tbody>';

    data.forEach(row => {
        const rowId = row.id !== undefined ? row.id : '';
        html += `<tr data-id="${rowId}">`;
        columns.forEach(col => {
            if (col === 'Actions') {
                html += `<td class="actions-cell"><button class="btn btn-outline btn-small edit-btn" data-id="${rowId}">Edit</button><button class="btn btn-danger btn-small delete-btn" data-id="${rowId}">Delete</button></td>`;
                return;
            }

            const value = row[col];
            // Add class for editable columns for easier DOM selection
            if (['Date', 'Open', 'High', 'Low', 'Close'].includes(col)) {
                const display = value !== null && value !== undefined ? (col === 'Date' ? value : (typeof value === 'number' ? value.toFixed(2) : value)) : '';
                html += `<td class="col-${col}">${display}</td>`;
            } else {
                html += `<td>${value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(2) : value) : ''}</td>`;
            }
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

let currentProcessedData = null;

async function saveToDatabase() {
    if (!currentProcessedData) {
        uploadResults.innerHTML += `<div class="error-message">No processed data available. Please upload a file first.</div>`;
        return;
    }
    
    const assetName = assetNameInput.value.trim();
    if (!assetName) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = 'Please enter an Asset Name.';
        uploadResults.appendChild(errorDiv);
        assetNameInput.focus();
        return;
    }
    
    const result = await window.electronAPI.saveToDatabase(currentProcessedData, assetName);
    
    if (result.success) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = result.message;
        uploadResults.appendChild(successDiv);
        
        // Add download button
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn';
        downloadBtn.style.marginTop = '1rem';
        downloadBtn.textContent = '📥 Download Excel File';
        downloadBtn.onclick = () => downloadExcel(currentProcessedData, assetName);
        uploadResults.appendChild(downloadBtn);
    } else {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = result.error;
        uploadResults.appendChild(errorDiv);
    }
}

async function downloadExcel(data, assetName) {
    const result = await window.electronAPI.showSaveDialog(`${assetName}_processed.xlsx`);
    if (!result.canceled) {
        await window.electronAPI.exportExcel(data, result.filePath);
        alert('File saved successfully!');
    }
}

// Analysis Tab
async function loadAnalysisTab() {
    const content = document.getElementById('analysis-content');
    content.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Loading database...</p></div>';
    
    try {
        const statsResult = await window.electronAPI.getDatabaseStats();
        if (!statsResult.success || statsResult.data.total_records === 0) {
            content.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No database found. Please upload data first.</p></div>';
            return;
        }
        
        const stats = statsResult.data;
        const assetsResult = await window.electronAPI.getAssets();
        
        if (!assetsResult.success || assetsResult.data.length === 0) {
            content.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No assets found. Please upload data first.</p></div>';
            return;
        }
        
        const assets = assetsResult.data;
        const selectedAsset = assets[0];
        
        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Assets</div>
                    <div class="stat-value">${stats.assets_count}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Records</div>
                    <div class="stat-value">${stats.total_records.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">From</div>
                    <div class="stat-value" style="font-size: 1.1rem;">${stats.min_date}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">To</div>
                    <div class="stat-value" style="font-size: 1.1rem;">${stats.max_date}</div>
                </div>
            </div>
            <div class="form-card analysis-controls-card" style="margin-top: 1.5rem; display: block;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="form-group">
                        <label>Select Asset</label>
                        <select id="analysis-asset-select">
                            ${assets.map(asset => `<option value="${asset}">${asset}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Sort by</label>
                        <select id="analysis-sort-select">
                            <option value="date-desc">Date (newest)</option>
                            <option value="date-asc">Date (oldest)</option>
                            <option value="seasonal-desc">Seasonal (high)</option>
                        </select>
                    </div>
                </div>
                <div id="analysis-data-display"></div>
            </div>
        `;
        
        document.getElementById('analysis-asset-select').addEventListener('change', loadAssetAnalysis);
        document.getElementById('analysis-sort-select').addEventListener('change', loadAssetAnalysis);
        
        await loadAssetAnalysis();
    } catch (error) {
        content.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

async function loadAssetAnalysis() {
    const select = document.getElementById('analysis-asset-select');
    const sortSelect = document.getElementById('analysis-sort-select');
    if (!select) return;
    
    const assetName = select.value;
    const sortOption = sortSelect.value;
    const display = document.getElementById('analysis-data-display');
    display.innerHTML = '<p class="info-message">Loading...</p>';
    
    try {
        const result = await window.electronAPI.getAssetData(assetName);
        if (!result.success || result.data.length === 0) {
            display.innerHTML = `<p class="info-message">📭 No data found for ${assetName}</p>`;
            return;
        }
        
        let data = result.data;
        
        // Sort data
        if (sortOption === 'date-desc') {
            data = data.sort((a, b) => new Date(b.Date) - new Date(a.Date));
        } else if (sortOption === 'date-asc') {
            data = data.sort((a, b) => new Date(a.Date) - new Date(b.Date));
        } else {
            data = data.sort((a, b) => (b.True_Seasonal || 0) - (a.True_Seasonal || 0));
        }
        
        display.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text);">${assetName} Analysis</h3>
                <p style="color: var(--text-light);">Showing <strong>${data.length}</strong> records</p>
            </div>
            <div class="form-card" style="margin-bottom: 1rem; display:flex; gap:0.5rem; align-items:end;">
                <div style="display:flex; gap:0.5rem;">
                    <div class="form-group">
                        <label>Date</label>
                        <input id="add-date" type="date">
                    </div>
                    <div class="form-group">
                        <label>Open</label>
                        <input id="add-open" type="number" step="any">
                    </div>
                    <div class="form-group">
                        <label>High</label>
                        <input id="add-high" type="number" step="any">
                    </div>
                    <div class="form-group">
                        <label>Low</label>
                        <input id="add-low" type="number" step="any">
                    </div>
                    <div class="form-group">
                        <label>Close</label>
                        <input id="add-close" type="number" step="any">
                    </div>
                </div>
                <div style="margin-left: auto;">
                    <button class="btn btn-primary" id="add-row-btn">➕ Add Row</button>
                </div>
            </div>
            <div class="chart-card table-container" style="margin-bottom: 1.5rem; padding: 0; overflow-x: auto;" id="analysis-table-container">
                ${createDataTable(data)}
            </div>
        `;

        // Attach asset name to container for edit handlers
        display.dataset.asset = assetName;

        // Wire add row button
        document.getElementById('add-row-btn').addEventListener('click', async () => {
            const date = document.getElementById('add-date').value;
            const open = parseFloat(document.getElementById('add-open').value);
            const high = parseFloat(document.getElementById('add-high').value);
            const low = parseFloat(document.getElementById('add-low').value);
            const close = parseFloat(document.getElementById('add-close').value);

            if (!date || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                alert('Please provide valid Date, Open, High, Low, and Close values.');
                return;
            }

            const newRow = { Date: date, Open: open, High: high, Low: low, Close: close };
            const res = await window.electronAPI.addRow(assetName, newRow);
            if (res && res.success) {
                await loadAssetAnalysis();
            } else {
                alert('Error adding row: ' + (res.error || 'unknown'));
            }
        });

        // Wire edit buttons via delegation
        document.getElementById('analysis-table-container').addEventListener('click', async (e) => {
            const btn = e.target.closest('.edit-btn');
            if (btn) {
                const rowId = btn.dataset.id;
                startEditRow(rowId);
                return;
            }

            const delBtn = e.target.closest('.delete-btn');
            if (!delBtn) return;
            const rowId = delBtn.dataset.id;
            const ok = confirm('Delete this row? This cannot be undone.');
            if (!ok) return;

            const res = await window.electronAPI.deleteRow(assetName, rowId);
            if (res && res.success) {
                await loadAssetAnalysis();
            } else {
                alert('Error deleting row: ' + (res && res.error ? res.error : 'unknown'));
            }
        });
    } catch (error) {
        display.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

function createPriceChart(data, selector) {
    // Use Plotly for fast interactive candlestick chart
    const el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = '';

    // prepare arrays
    const dates = data.map(d => d.Date);
    const opens = data.map(d => +d.Open);
    const highs = data.map(d => +d.High);
    const lows = data.map(d => +d.Low);
    const closes = data.map(d => +d.Close);

    const trace = {
        x: dates,
        open: opens,
        high: highs,
        low: lows,
        close: closes,
        type: 'candlestick',
        increasing: { line: { color: '#16a34a' } },
        decreasing: { line: { color: '#dc2626' } },
        hoverinfo: 'x+open+high+low+close'
    };

    const baseLayout = {
        margin: { t: 20, r: 40, b: 40, l: 60 },
        xaxis: { rangeslider: { visible: true }, type: 'date' },
        yaxis: { autorange: true },
        showlegend: false,
        hovermode: 'x unified'
    };
    const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
    const layout = Object.assign({}, baseLayout, getPlotlyThemeLayout(theme));

    const config = { responsive: true, scrollZoom: true, displaylogo: false, modeBarButtonsToAdd: ['zoom2d','pan2d','select2d','resetScale2d'] };

    Plotly.newPlot(el, [trace], layout, config).then(() => {
        const payload = { title: 'Price Candlestick', traces: [trace], layout, config };
        addFullscreenToggleForSelector(selector, payload);
    });
}

function createSeasonalChart(data, selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = '';

    const dates = data.map(d => d.Date);
    const values = data.map(d => (d.True_Seasonal !== undefined && d.True_Seasonal !== null) ? +d.True_Seasonal : null);

    const trace = {
        x: dates,
        y: values,
        mode: 'lines+markers',
        line: { color: '#7c3aed', shape: 'spline' },
        marker: { size: 6 }
    };

    const baseLayout = {
        margin: { t: 10, r: 20, b: 40, l: 60 },
        xaxis: { type: 'date' },
        yaxis: { autorange: true },
        hovermode: 'x unified'
    };
    const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
    const layout = Object.assign({}, baseLayout, getPlotlyThemeLayout(theme));

    const config = { responsive: true, scrollZoom: true, displaylogo: false, modeBarButtonsToAdd: ['zoom2d','pan2d','resetScale2d'] };

    Plotly.newPlot(el, [trace], layout, config).then(() => {
        const payload = { title: 'True Seasonal', traces: [trace], layout, config };
        addFullscreenToggleForSelector(selector, payload);
    });
}

// Graphs Tab
async function loadGraphsTab() {
    try {
        if (typeof Plotly === 'undefined') {
            // Plotly is loaded via a deferred external script; give it a moment.
            const ok = await waitForGlobal('Plotly', 5000);
            if (!ok) {
                document.getElementById('graph-container').innerHTML = '<div class="error-message">Plotly failed to load (offline or blocked network). The app UI will still work, but Graphs need Plotly available.</div>';
                return;
            }
        }
        const assetsResult = await window.electronAPI.getAssets();
        if (!assetsResult.success || assetsResult.data.length === 0) {
            document.getElementById('graph-container').innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No assets found. Please upload data first.</p></div>';
            return;
        }
        
        const assets = assetsResult.data;
        const assetSelect = document.getElementById('graph-asset');
        assetSelect.innerHTML = assets.map(asset => `<option value="${asset}">${asset}</option>`).join('');
        
        assetSelect.addEventListener('change', updateGraphControls);
        document.getElementById('graph-year').addEventListener('change', renderGraph);
        document.getElementById('graph-type').addEventListener('change', renderGraph);
        document.getElementById('show-points').addEventListener('change', renderGraph);
        document.getElementById('show-average').addEventListener('change', renderGraph);
        document.getElementById('smooth-line').addEventListener('change', renderGraph);

        // Advanced chart removed
        
        await updateGraphControls();
    } catch (error) {
        document.getElementById('graph-container').innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}

async function updateGraphControls() {
    const assetName = document.getElementById('graph-asset').value;
    const result = await window.electronAPI.getAssetData(assetName);
    
    if (result.success && result.data && result.data.length > 0) {
        // Extract unique years from the data
        const years = [...new Set(result.data.map(row => {
            const date = new Date(row.Date);
            return date.getFullYear();
        }))].sort((a, b) => b - a); // Sort descending (newest first)
        
        const yearSelect = document.getElementById('graph-year');
        yearSelect.innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join('');
        
        // Select the most recent year by default
        if (years.length > 0) {
            yearSelect.value = years[0];
        }
    }
    
    await renderGraph();
}

async function renderGraph() {
    const assetName = document.getElementById('graph-asset').value;
    const selectedYear = document.getElementById('graph-year').value;
    const dataType = document.getElementById('graph-type').value;
    const showPoints = document.getElementById('show-points').checked;
    const showAverage = document.getElementById('show-average').checked;
    const smoothLine = document.getElementById('smooth-line').checked;
    
    if (!selectedYear) {
        return;
    }
    
    try {
        const result = await window.electronAPI.getAssetData(assetName);
        if (!result.success || result.data.length === 0) {
            document.getElementById('graph-container').innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No data available</p></div>';
            return;
        }
        
        // Filter data by selected year
        let yearData = result.data.filter(row => {
            const date = new Date(row.Date);
            return date.getFullYear() === parseInt(selectedYear);
        });
        
        if (yearData.length === 0) {
            document.getElementById('graph-container').innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No data available for selected year</p></div>';
            document.getElementById('graph-stats').classList.add('hidden');
            return;
        }
        
        // Group data by month and calculate average for each month
        const monthData = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        for (let month = 1; month <= 12; month++) {
            const monthRows = yearData.filter(row => {
                const date = new Date(row.Date);
                return date.getMonth() + 1 === month;
            });
            
            if (monthRows.length > 0) {
                const avgValue = monthRows.reduce((sum, row) => sum + (row[dataType] || 0), 0) / monthRows.length;
                monthData.push({
                    month: month,
                    monthName: monthNames[month - 1],
                    value: avgValue,
                    count: monthRows.length
                });
            } else {
                // Include month even if no data (for continuity)
                monthData.push({
                    month: month,
                    monthName: monthNames[month - 1],
                    value: null,
                    count: 0
                });
            }
        }
        
        const container = document.getElementById('graph-container');
        container.innerHTML = '';
        const graphDiv = document.createElement('div');
        graphDiv.id = 'year-graph';
        container.appendChild(graphDiv);
        
        createYearGraph(monthData, dataType, selectedYear, '#year-graph', showPoints, showAverage, smoothLine);
        
        // Display stats
        const validData = monthData.filter(d => d.value !== null);
        if (validData.length > 0) {
            const avg = validData.reduce((sum, d) => sum + d.value, 0) / validData.length;
            const min = Math.min(...validData.map(d => d.value));
            const max = Math.max(...validData.map(d => d.value));
            
            document.getElementById('graph-stats').innerHTML = `
                <div class="graph-stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Months with Data</div>
                        <div class="stat-value">${validData.length}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Average</div>
                        <div class="stat-value">${avg.toFixed(2)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Minimum</div>
                        <div class="stat-value">${min.toFixed(2)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Maximum</div>
                        <div class="stat-value">${max.toFixed(2)}</div>
                    </div>
                </div>
            `;
            document.getElementById('graph-stats').classList.remove('hidden');
        } else {
            document.getElementById('graph-stats').classList.add('hidden');
        }
    } catch (error) {
        document.getElementById('graph-container').innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
    }
}


function createYearGraph(monthData, dataType, year, selector, showPoints, showAverage, smoothLine) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = '';

    const months = monthData.map(d => d.monthName);
    const values = monthData.map(d => d.value);

    const color = dataType === 'normalized' ? '#6366f1' : '#8b5cf6';
    const title = dataType === 'normalized' ? 'Normalized Data' : 'True Seasonal Data';

    const lineTrace = {
        x: months,
        y: values,
        type: 'scatter',
        mode: showPoints ? 'lines+markers' : 'lines',
        line: { color, shape: smoothLine ? 'spline' : 'linear', width: 3 },
        marker: { size: showPoints ? 6 : 0 },
        name: `${title}`
    };

    const traces = [lineTrace];

    // Average line
    const valid = values.filter(v => v !== null && !isNaN(v));
    if (showAverage && valid.length > 0) {
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        traces.push({ x: months, y: months.map(() => avg), type: 'scatter', mode: 'lines', name: 'Average', line: { color: '#94a3b8', dash: 'dash' } });
    }

    const baseLayout = {
        title: `${document.getElementById('graph-asset').value} - ${year} - ${title}`,
        margin: { t: 30, r: 20, b: 40, l: 60 },
        xaxis: { type: 'category' },
        yaxis: { autorange: true },
        hovermode: 'x unified',
        showlegend: true
    };
    const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
    const layout = Object.assign({}, baseLayout, getPlotlyThemeLayout(theme));

    const config = { responsive: true, scrollZoom: true, displaylogo: false };
    Plotly.newPlot(el, traces, layout, config).then(() => {
        const assetName = document.getElementById('graph-asset').value;
        const payload = { title: layout.title || 'Year Graph', traces, layout, config, meta: { kind: 'year-graph', assetName, year, dataType } };
        addFullscreenToggleForSelector(selector, payload);
    });
}

// Helper: add fullscreen toggle to the nearest .chart-card
function addFullscreenToggleForSelector(selector, payload) {
    try {
        const el = document.querySelector(selector);
        if (!el) return;
        const card = el.closest('.chart-card') || el.parentElement;
        if (!card) return;
        // avoid adding duplicate button
        if (card.querySelector('.fullscreen-toggle')) return;
        const btn = document.createElement('button');
        btn.className = 'fullscreen-toggle';
        btn.innerText = '⤢';
        btn.title = 'Toggle fullscreen';
        btn.addEventListener('click', async () => {
            if (payload) {
                try { sessionStorage.setItem('chartPayload', JSON.stringify(payload)); } catch(e) {}
                window.location.href = 'fullscreen_chart.html';
                return;
            }
            // Fallback to in-card fullscreen if no payload
            card.classList.toggle('fullscreen');
            const plotDiv = el.querySelector('.js-plotly-plot') ? el.querySelector('.js-plotly-plot') : el;
            if (plotDiv && typeof Plotly !== 'undefined') {
                try { Plotly.relayout(plotDiv, { autosize: true }); } catch (e) {}
                setTimeout(() => { try { Plotly.Plots.resize(plotDiv); } catch(e){} }, 200);
            }
        });
        card.style.position = 'relative';
        card.appendChild(btn);
    } catch (e) {
        console.warn('fullscreen toggle failed', e);
    }
}

 



// Settings Tab
async function loadSettingsTab() {
    // Database size would need to be calculated from file system
    document.getElementById('db-size').innerHTML = '<div class="stat-card"><div class="stat-label">Size</div><div class="stat-value">N/A</div></div>';
    
    document.getElementById('backup-btn').addEventListener('click', async () => {
        const result = await window.electronAPI.showSaveDialog('asset_data_backup.db');
        if (!result.canceled) {
            // Backup functionality would copy the database file
            alert('Backup functionality would copy the database file to the selected location.');
        }
    });
    
    document.getElementById('clear-btn').addEventListener('click', () => {
        document.getElementById('clear-confirm').classList.remove('hidden');
    });
    
    document.getElementById('confirm-clear').addEventListener('click', async () => {
        const result = await window.electronAPI.clearDatabase();
        if (result.success) {
            alert('Database cleared successfully!');
            document.getElementById('clear-confirm').classList.add('hidden');
        } else {
            alert(`Error: ${result.error}`);
        }
    });
}

// Make functions available globally
window.toggleExpander = toggleExpander;
window.saveToDatabase = saveToDatabase;
window.downloadExcel = downloadExcel;

// Editing helpers
async function startEditRow(rowId) {
    const container = document.getElementById('analysis-table-container');
    if (!container) return;
    const tr = container.querySelector(`tr[data-id='${rowId}']`);
    if (!tr) return;

    // Prevent double-edit
    if (tr.classList.contains('editing')) return;
    tr.classList.add('editing');

    const dateTd = tr.querySelector('.col-Date');
    const openTd = tr.querySelector('.col-Open');
    const highTd = tr.querySelector('.col-High');
    const lowTd = tr.querySelector('.col-Low');
    const closeTd = tr.querySelector('.col-Close');

    const dateVal = dateTd ? dateTd.textContent.trim() : '';
    const openVal = openTd ? openTd.textContent.trim() : '';
    const highVal = highTd ? highTd.textContent.trim() : '';
    const lowVal = lowTd ? lowTd.textContent.trim() : '';
    const closeVal = closeTd ? closeTd.textContent.trim() : '';

    if (dateTd) dateTd.innerHTML = `<input class="edit-input edit-Date" type="date" value="${dateVal}">`;
    if (openTd) openTd.innerHTML = `<input class="edit-input edit-Open" type="number" step="any" value="${openVal}">`;
    if (highTd) highTd.innerHTML = `<input class="edit-input edit-High" type="number" step="any" value="${highVal}">`;
    if (lowTd) lowTd.innerHTML = `<input class="edit-input edit-Low" type="number" step="any" value="${lowVal}">`;
    if (closeTd) closeTd.innerHTML = `<input class="edit-input edit-Close" type="number" step="any" value="${closeVal}">`;

    // Replace Edit button with Save / Cancel
    const actionTd = tr.querySelector('td:last-child');
    if (actionTd) {
        actionTd.classList.add('actions-cell');
        actionTd.innerHTML = `
            <button class="btn btn-primary btn-small save-btn" data-id="${rowId}">Save</button>
            <button class="btn btn-danger btn-small cancel-btn" data-id="${rowId}">Cancel</button>
        `;

        actionTd.querySelector('.save-btn').addEventListener('click', async (e) => {
            await saveEditedRow(rowId);
        });
        actionTd.querySelector('.cancel-btn').addEventListener('click', (e) => {
            cancelEditRow(rowId);
        });
    }
}

async function saveEditedRow(rowId) {
    const container = document.getElementById('analysis-table-container');
    const tr = container.querySelector(`tr[data-id='${rowId}']`);
    if (!tr) return;
    const assetName = document.getElementById('analysis-data-display').dataset.asset;
    const dateInput = tr.querySelector('.edit-Date');
    const openInput = tr.querySelector('.edit-Open');
    const highInput = tr.querySelector('.edit-High');
    const lowInput = tr.querySelector('.edit-Low');
    const closeInput = tr.querySelector('.edit-Close');

    const updated = {};
    if (dateInput) updated.Date = dateInput.value;
    if (openInput) updated.Open = parseFloat(openInput.value);
    if (highInput) updated.High = parseFloat(highInput.value);
    if (lowInput) updated.Low = parseFloat(lowInput.value);
    if (closeInput) updated.Close = parseFloat(closeInput.value);

    // Basic validation
    if (!updated.Date || isNaN(updated.Open) || isNaN(updated.High) || isNaN(updated.Low) || isNaN(updated.Close)) {
        alert('Please provide valid Date, Open, High, Low, and Close values.');
        return;
    }

    const res = await window.electronAPI.updateRow(assetName, rowId, updated);
    if (res && res.success) {
        await loadAssetAnalysis();
    } else {
        alert('Error updating row: ' + (res.error || 'unknown'));
    }
}

function cancelEditRow(rowId) {
    // Simplest approach - reload the analysis to restore original row
    loadAssetAnalysis();
}

