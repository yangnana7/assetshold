const fs = require('fs');
const path = process.argv[2] || 'server.js';
try {
  const src = fs.readFileSync(path, 'utf8');
  // eslint-disable-next-line no-new, no-new-func
  new Function(src);
  console.log('PARSE_OK:', path);
} catch (e) {
  console.error('PARSE_ERROR:', e.message);
  process.exit(1);
}

