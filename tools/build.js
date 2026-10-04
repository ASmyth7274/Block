// Builds dist/Blocklands.html: one self-contained file with every script inlined.
// Usage: node tools/build.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const begin = html.indexOf('<!-- BEGIN SCRIPTS -->');
const end = html.indexOf('<!-- END SCRIPTS -->');
if (begin < 0 || end < 0) throw new Error('script markers not found in index.html');

const block = html.slice(begin, end);
const files = [...block.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
let code = "'use strict';\n";
for (const f of files) {
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  src = src.replace(/^'use strict';\s*/, '');
  if (src.includes('</script')) throw new Error(f + ' contains a closing script tag');
  code += '\n// ---- ' + f + '\n' + src;
}
const out = html.slice(0, begin) + '<script>\n' + code + '\n</script>\n' + html.slice(end + '<!-- END SCRIPTS -->'.length);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const target = path.join(ROOT, 'dist', 'Blocklands.html');
fs.writeFileSync(target, out);
console.log('wrote ' + path.relative(ROOT, target) + ' (' + files.length + ' scripts, ' + Math.round(out.length / 1024) + ' KB)');
