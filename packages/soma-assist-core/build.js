const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'style.css');
const jsPath = path.join(__dirname, 'src', 'index.js');
const distDir = path.join(__dirname, 'dist');
const distJsPath = path.join(distDir, 'soma-assist-core.js');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// Escape backticks and backslashes for template literal
const escapedCss = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

const outputJs = js.replace('/*__CSS__*/', escapedCss);

fs.writeFileSync(distJsPath, outputJs);
console.log('Built dist/soma-assist-core.js successfully.');
