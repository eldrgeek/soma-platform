const fs = require('fs');
const guideCode = fs.readFileSync('../soma-guide/soma-guide.js', 'utf8');

const contentJs = `
window.SOMA_GUIDE_CONFIG = { persona: { name: 'Adrian', avatar: '🤖' } };
${guideCode}
`;

fs.writeFileSync('content.js', contentJs);
console.log('Built adrian-extension');
