import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2';
const result = {
  at: new Date().toISOString(),
  width: 390,
  height: 844,
  source: 'USGS REAL',
  checks: [],
  errors: [],
};
const check = (name, ok, detail) => {
  result.checks.push({ name, ok, detail });
  assert.ok(ok, name);
};
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
let page;
try {
  page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  page.on('pageerror', (e) => result.errors.push(String(e)));
  const ready = () =>
    page.waitForFunction(
      () =>
        window.__eyeinsky &&
        document.querySelector('#loading-screen').classList.contains('hidden'),
    );
  await page.goto('http://127.0.0.1:4194/');
  await ready();
  await page.click('.eye-nav [data-eye-view="signals"]');
  await page.waitForFunction(
    () =>
      window.__eyeinsky.rows.length >= 2 &&
      !document.querySelector('#eye-refresh').disabled,
    { timeout: 60000 },
  );
  const ids = await page.$$eval('#eye-signal-list button', (b) =>
    b.slice(0, 2).map((e) => e.dataset.signalId),
  );
  result.ids = ids;
  for (const id of ids) {
    await page.click(`[data-signal-id="${id}"]`);
    await new Promise((r) => setTimeout(r, 950));
    check(
      `mobile selects real ID ${id}`,
      await page.evaluate(
        (id) =>
          window.__eyeinsky.selectedId === id &&
          window.__godsEyeView.viewer.selectedEntity.properties.usgsId.getValue() ===
            id,
        id,
      ),
    );
    await page.click('#eye-inspector-close');
  }
  await page.select('#eye-filter-hours', '6');
  await page.click('.eye-nav [data-eye-view="operations"]');
  await page.type('#eye-operation-name', 'Recorrido móvil');
  await page.type('#eye-operation-note', 'Nota móvil privada');
  await page.click('#eye-operation-save');
  await page.waitForFunction(() =>
    document
      .querySelector('#eye-operation-status')
      .textContent.includes('Guardado'),
  );
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records[0],
  );
  await page.reload();
  await ready();
  await page.click('.eye-nav [data-eye-view="operations"]');
  await page.click('[data-operation-action="open"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('#eye-operation-status')
        .textContent.includes('Operación abierta'),
    { timeout: 60000 },
  );
  await new Promise((r) => setTimeout(r, 1000));
  check(
    'mobile reload restores visible operation, note, source selection and camera',
    await page.evaluate((saved) => {
      const view = window.__eyeinsky.readView();
      return (
        !document.querySelector('#eye-workspace').hidden &&
        document
          .querySelector('#eye-note-history')
          .textContent.includes('Nota móvil privada') &&
        view.selection === saved.selection &&
        view.filters.hours === 6 &&
        Math.abs(view.camera.alt - saved.camera.alt) < 5
      );
    }, saved),
  );
  await page.screenshot({ path: `${out}/mobile-operation-restored.png` });
  await page.click('[data-operation-action="rename"]');
  await page.$eval('#eye-dialog input', (e) => (e.value = 'Móvil revisado'));
  await page.click('#eye-dialog-confirm');
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records[0]
        .name === 'Móvil revisado',
  );
  check('mobile rename', true);
  await page.click('#eye-command-open');
  await page.type('#eye-command-search', 'Compartir');
  await page.click('#eye-command-list button');
  await page.waitForSelector('#eye-dialog textarea');
  const url = await page.$eval('#eye-dialog textarea', (e) => e.value);
  check(
    'mobile shared link excludes notes and operation name',
    !decodeURIComponent(url).includes('privada') &&
      !decodeURIComponent(url).includes('Móvil'),
  );
  await page.click('#eye-dialog-cancel');
  await page.waitForFunction(() => !document.querySelector('#eye-dialog').open);
  await page.click('[data-operation-action="delete"]');
  await page.click('#eye-dialog-confirm');
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records
        .length === 0,
  );
  check('mobile confirmed deletion', true);
  await page.click('#eye-panel-close');
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.click('#eye-home');
  check(
    'reduced-motion home moves camera without a timed flight',
    await page.evaluate(
      () => Math.abs(window.__eyeinsky.readView().camera.alt - 26000000) < 5,
    ),
  );
  const focus = [];
  await page.focus('#eye-help');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    focus.push(
      await page.evaluate(() => ({
        id: document.activeElement.id,
        tag: document.activeElement.tagName,
        visible: document.activeElement.getClientRects().length > 0,
      })),
    );
  }
  check(
    'keyboard tab visits visible controls then exits page to browser chrome',
    focus.slice(0, -1).every((f) => f.visible && f.tag !== 'BODY') &&
      focus.at(-1).tag === 'BODY',
    focus,
  );
  const client = await page.createCDPSession();
  const before = await page.evaluate(
    () => window.__eyeinsky.readView().camera.lon,
  );
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 175, y: 385 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 240, y: 405 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await new Promise((r) => setTimeout(r, 500));
  check(
    'touch rotates the actual globe',
    await page.evaluate(
      (lon) => Math.abs(window.__eyeinsky.readView().camera.lon - lon) > 0.01,
      before,
    ),
  );
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  // Puppeteer reloads when hasTouch changes; wait for the new page's owner.
  await ready();
  await page.click('#eye-home');
  await page.evaluate(() => window.__eyeinsky.openView('display'));
  await page.$eval('#draw-toggle', (button) =>
    button.scrollIntoView({ block: 'center' }),
  );
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    window.__qaClicks = [];
    document.addEventListener(
      'click',
      (e) =>
        window.__qaClicks.push(
          e.target.id || e.target.closest('button')?.id || e.target.tagName,
        ),
      true,
    );
  });
  await page.click('#draw-toggle');
  result.drawAfterToggle = await page.evaluate(() => ({
    clicks: window.__qaClicks,
    active: window.__gevDrawTool?.active,
    toggle: document.querySelector('#draw-toggle').getAttribute('aria-pressed'),
    row: document.querySelector('#draw-mode-row').outerHTML,
    hint: document.querySelector('#draw-hint').textContent,
  }));
  await page.click('[data-shape="pin"]');
  await page.mouse.click(760, 440);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__gevAnnotations.count() > 0);
  check(
    'manual mark uses existing annotation engine',
    await page.evaluate(() => window.__gevAnnotations.count() === 1),
  );
  await page.click('#draw-clear');
  check(
    'manual annotations clear',
    await page.evaluate(() => window.__gevAnnotations.count() === 0),
  );
  await page.screenshot({ path: `${out}/annotations-display.png` });
  check(
    'no script errors in mobile journey',
    result.errors.length === 0,
    result.errors,
  );
} catch (e) {
  result.failure = String(e.stack || e);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: `${out}/mobile-failure.png` });
} finally {
  await fs.writeFile(
    `${out}/mobile-journey.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await browser.close();
}
