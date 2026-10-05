// Usage: node tools/test/run.js <scenario.js> [outDir] [width] [height]
// A scenario exports: async (ctx) => {...} with ctx = { page, shot(name), wait(ms), eval(fn|string, arg), log }
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [,, scen, outDir = '/tmp/shots', w = 1280, h = 720] = process.argv;
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const mobile = process.env.MOBILE === '1';
  const context = await browser.newContext(mobile ? { viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: +w, height: +h } });
  // tests keep the stock settings: the headless browser draws in software, which would otherwise
  // tune every test down to the lowest preset (TUNE=1 to see that happen)
  if (process.env.TUNE !== '1') await context.addInitScript(() => { try { if (!localStorage.getItem('blocklands.settings')) localStorage.setItem('blocklands.settings', JSON.stringify({ tunedFor: 'headless test' })); } catch (e) { /* no storage */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') { errors.push(t + ': ' + m.text()); console.log('[' + t + ']', m.text()); } else console.log('[console]', m.text()); });
  page.on('pageerror', (e) => { errors.push('pageerror: ' + e.message); console.log('[pageerror]', e.message, '\n', (e.stack || '').split('\n').slice(0, 6).join('\n')); });
  const url = 'file://' + path.resolve(__dirname, '../../index.html');
  const t0 = Date.now();
  await page.goto(url);
  const ctx = {
    page,
    log: (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(1) + 's]', ...a),
    wait: (ms) => page.waitForTimeout(ms),
    shot: async (name) => { const p = path.join(outDir, name + '.png'); await page.screenshot({ path: p, timeout: 120000 }); console.log('[shot]', p); },
    eval: (fn, arg) => page.evaluate(fn, arg),
    touch: async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i })) }),
    until: async (fn, timeout = 60000, step = 250) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(step); } return false; },
  };
  try { await require(path.resolve(scen))(ctx); }
  catch (e) { console.log('[scenario error]', e && e.stack || e); }
  if (errors.length) console.log('--- ' + errors.length + ' errors/warnings');
  await browser.close();
})();
