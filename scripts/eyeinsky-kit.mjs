import puppeteer from 'puppeteer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2';
await fs.mkdir('public/identity/favicons', { recursive: true });
for (const size of [16, 24, 32, 48, 180])
  await sharp('public/identity/logos/iris-orbital-micro-accent.svg')
    .resize(size, size)
    .png()
    .toFile(`public/identity/favicons/iris-${size}.png`);
const png = await fs.readFile('public/identity/favicons/iris-32.png');
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 32;
ico[7] = 32;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
await fs.writeFile(
  'public/identity/favicons/favicon.ico',
  Buffer.concat([ico, png]),
);
await fs.copyFile(
  `${out}/journey-home-1440.png`,
  'docs/design/eyeinsky/application.png',
);
const luminance = (hex) => {
  const c = hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
};
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);
const tokens = JSON.parse(
  await fs.readFile('docs/design/eyeinsky/tokens.json', 'utf8'),
);
const result = {
  at: new Date().toISOString(),
  contrast: Object.fromEntries(
    ['text', 'secondary', 'mineral', 'amber'].map((k) => [
      k,
      Number(contrast(tokens.colors[k], tokens.colors.surface).toFixed(2)),
    ]),
  ),
};
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4194/docs/design/eyeinsky/manual.html', {
    waitUntil: 'networkidle0',
  });
  await page.evaluate(() => document.fonts.ready);
  result.fonts = await page.evaluate(() => ({
    space: document.fonts.check('14px Space'),
    mono: document.fonts.check('14px Mono'),
    images: [...document.images].every((i) => i.complete && i.naturalWidth > 0),
  }));
  if (!Object.values(result.fonts).every(Boolean))
    throw new Error('Manual fonts or images not loaded');
  await page.pdf({
    path: 'docs/design/eyeinsky/EYEINSKY-manual.pdf',
    printBackground: true,
    preferCSSPageSize: true,
  });
} finally {
  await browser.close();
}
await fs.writeFile(`${out}/identity-kit.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
