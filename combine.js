const fs = require('fs');
const core = fs.readFileSync('packages/soma-assist-core/dist/soma-assist-core.js', 'utf8');
const guide = fs.readFileSync('packages/soma-guide/soma-guide.js', 'utf8');

// Also replace 'SOMA Guide' with 'Adrian' in soma-guide.js here
const updatedGuide = guide.replace(/SOMA Guide/g, 'Adrian').replace(/SOMA guide/g, 'Adrian');

fs.writeFileSync('packages/soma-guide/soma-guide.js', core + '\n' + updatedGuide);
