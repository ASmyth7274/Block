// Usage: node tools/shot.js <url-or-path> <out.png> [width] [height] [waitMs] [evalScript]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [,, target, out, w = 1280, h = 800, wait = 500, evalScript] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); else console.log('[console]', m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
  const url = target.startsWith('http') || target.startsWith('file:') ? target : 'file://' + path.resolve(target);
  await page.goto(url);
  await page.waitForTimeout(+wait);
  if (evalScript) { const r = await page.evaluate(evalScript); if (r !== undefined) console.log('[eval]', typeof r === 'string' ? r : JSON.stringify(r)); }
  await page.screenshot({ path: out });
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
})();
