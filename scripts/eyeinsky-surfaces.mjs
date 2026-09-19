import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto('http://127.0.0.1:4194/');
  await page.waitForFunction(
    () =>
      window.__eyeinsky &&
      document.querySelector('#loading-screen').classList.contains('hidden'),
  );
  await new Promise((r) => setTimeout(r, 3000));
  const result = {};
  for (const view of [
    'display',
    'director',
    'catalog',
    'sensors',
    'preferences',
  ]) {
    await page.evaluate((v) => window.__eyeinsky.openView(v), view);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: `${out}/surface-${view}.png` });
    result[view] = await page.$eval('#eye-workspace', (e) => e.innerText);
  }
  result.models = await page.$eval('#models3d-toggle', (e) => ({
    disabled: e.matches(':disabled'),
    parent: e.parentElement.outerHTML,
    ancestry: [
      e,
      ...(function* (n) {
        while (n.parentElement) {
          n = n.parentElement;
          yield n;
        }
      })(e),
    ].map((n) => `${n.tagName}#${n.id}.${n.className}`),
  }));
  await fs.writeFile(`${out}/surfaces.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.models));
} finally {
  await browser.close();
}
