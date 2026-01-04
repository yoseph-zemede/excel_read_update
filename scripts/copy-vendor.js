const fs = require('fs');
const path = require('path');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} -> ${dest}`);
}

function main() {
  const root = path.resolve(__dirname, '..');

  const plotlySrc = path.join(root, 'node_modules', 'plotly.js-dist-min', 'plotly.min.js');
  const plotlyDest = path.join(root, 'frontend', 'vendor', 'plotly.min.js');

  if (!fs.existsSync(plotlySrc)) {
    console.error('Missing dependency: plotly.js-dist-min');
    console.error(`Expected: ${plotlySrc}`);
    process.exit(1);
  }

  copyFile(plotlySrc, plotlyDest);
}

main();
