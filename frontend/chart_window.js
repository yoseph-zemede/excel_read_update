(function(){
  function renderChart(payload){
    try{
      const el = document.getElementById('chart');
      const titleEl = document.getElementById('chart-title');
      if (!el) return;
      el.innerHTML = '';
      const { title, traces, layout, config } = payload || {};
      if (titleEl && title) titleEl.textContent = title;
      if (!window.Plotly) {
        el.innerHTML = '<div class="error-message">Plotly failed to load. Please check network connectivity.</div>';
        return;
      }
      const cfg = Object.assign({ responsive: true, displaylogo: false, scrollZoom: true }, config || {});
      const lay = Object.assign({ hovermode: 'x unified', margin: { t: 40, r: 40, b: 40, l: 60 } }, layout || {});
      Plotly.newPlot(el, traces || [], lay, cfg).then(() => {
        window.addEventListener('resize', () => {
          try { Plotly.Plots.resize(el); } catch(e){}
        });
      });
    }catch(e){
      const el = document.getElementById('chart');
      if (el) el.innerHTML = '<div class="error-message">Error rendering chart</div>';
      console.error(e);
    }
  }

  if (window.electronAPI && typeof window.electronAPI.onChartData === 'function'){
    window.electronAPI.onChartData((data) => renderChart(data));
  } else {
    console.warn('electronAPI.onChartData not available');
  }

  // Also proactively request payload to avoid race conditions
  if (window.electronAPI && typeof window.electronAPI.getChartPayload === 'function'){
    try {
      window.electronAPI.getChartPayload().then((res) => {
        if (res && res.success && res.data) renderChart(res.data);
      }).catch(()=>{});
    } catch(e){}
  }
})();
