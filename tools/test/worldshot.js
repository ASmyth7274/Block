// node tools/test/worldshot.js out.png "seed=1&x=0&z=0&yaw=0&pitch=-20&time=6000" [w h] [groundOffset]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [,, out, params = '', w = 1280, h = 720, ground] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.goto('file://' + path.resolve(__dirname, '../preview/world.html') + '?' + params);
  if (ground !== undefined) {
    // wait for the camera column to load, then place camera above the ground
    await page.waitForFunction(() => window.world && world.getChunk(Math.floor(window.cam ? cam.x : 0) >> 4, 0) !== undefined, null, { timeout: 5000 }).catch(() => {});
    for (let i = 0; i < 100; i++) {
      const y = await page.evaluate(() => { const c = world.getChunk(Math.floor(cam_x()) >> 4, Math.floor(cam_z()) >> 4); return c ? world.topSolidY(Math.floor(cam_x()), Math.floor(cam_z())) : -1; }).catch(() => -1);
      if (y > 0) { await page.evaluate((yy) => setCam({ y: yy }), y + +ground); break; }
      await page.waitForTimeout(100);
    }
  }
  const t0 = Date.now();
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 }).catch(() => console.log('timeout waiting for ready'));
  console.log('load ms', Date.now() - t0, JSON.stringify(await page.evaluate(() => window.dbg)));
  await page.waitForTimeout(200);
  await page.screenshot({ path: out });
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
  await browser.close();
})();
