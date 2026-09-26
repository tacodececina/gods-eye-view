/**
 * Funciones puras del arnés visual Editorial (T0): contraste WCAG, superficies
 * visibles, solapes, suelos de texto y medidas del globo sobre imágenes
 * sintéticas. Sin navegador: cada fixture declara su verdad de terreno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  compositeOver,
  parseCssColor,
  visibleSurfaces,
  restSurfaceCount,
  overlaps,
  textFloorViolations,
  worstCaseBackground,
  diskDayNight,
  haloRing,
  skyStats,
  terminatorAngleFromSun,
  fontFaceLoaded,
  skyTint,
  creditOverflow,
  telemetryAltitudeKm,
} from './lib/eyeinsky-visual-checks.mjs';

/** Imagen RGBA sintética `w×h` rellena por `paint(x, y) → [r,g,b]`. */
function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { width, height, channels: 4, data };
}

test('contrastRatio reproduce WCAG: paper sobre bg = 16.77', () => {
  assert.ok(Math.abs(contrastRatio('#eef1e9', '#071110') - 16.77) < 0.05);
  assert.ok(Math.abs(contrastRatio('#ffffff', '#000000') - 21) < 1e-9);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('parseCssColor lee hex, rgb() y rgba(); compositeOver mezcla por alfa', () => {
  assert.deepEqual(parseCssColor('#a6d7c2'), [166, 215, 194, 1]);
  assert.deepEqual(parseCssColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
  assert.deepEqual(parseCssColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5]);
  assert.equal(parseCssColor('transparent')[3], 0);
  assert.deepEqual(
    compositeOver([255, 255, 255, 0.5], [0, 0, 0]),
    [127.5, 127.5, 127.5],
  );
});

test('visibleSurfaces cuenta solo superficies con área y opacidad > .05', () => {
  const rects = [
    { cls: 'eye-glass-surface', w: 10, h: 10, opacity: 1 },
    { cls: 'eye-glass-surface', w: 10, h: 10, opacity: 0 },
    { cls: 'eye-glass-surface', w: 0, h: 10, opacity: 1 },
  ];
  assert.equal(visibleSurfaces(rects), 1);
});

test('restSurfaceCount descuenta las zonas permitidas y las cajas anidadas', () => {
  const boxes = [
    { key: 'a', zone: 'topbar', parent: null },
    { key: 'b', zone: null, parent: null },
    { key: 'c', zone: null, parent: 'b' },
    { key: 'd', zone: null, parent: null },
  ];
  assert.deepEqual(restSurfaceCount(boxes), { count: 2, keys: ['b', 'd'] });
});

test('overlaps ignora el lienzo y la viñeta, y tolera el roce de 1 px', () => {
  const surfaces = [
    { key: 'canvas', left: 0, top: 0, right: 100, bottom: 100 },
    { key: 'eye-vignette', left: 0, top: 0, right: 100, bottom: 100 },
    { key: 'a', left: 0, top: 0, right: 50, bottom: 50 },
    { key: 'b', left: 49.5, top: 0, right: 90, bottom: 50 },
    { key: 'c', left: 40, top: 40, right: 60, bottom: 60 },
  ];
  const pairs = overlaps(surfaces, { ignore: ['canvas', 'eye-vignette'] });
  assert.deepEqual(
    pairs.map(({ a, b }) => `${a}|${b}`),
    ['a|c', 'b|c'],
  );
});

test('textFloorViolations: 14 px en móvil, 12 px en escritorio, salvo atribuciones', () => {
  const items = [
    { text: 'hola', size: 13, attribution: false },
    { text: 'crédito', size: 9, attribution: true },
    { text: 'dato', size: 12, attribution: false },
  ];
  assert.deepEqual(
    textFloorViolations(items, { mobile: false }).map(({ text }) => text),
    [],
  );
  assert.deepEqual(
    textFloorViolations(items, { mobile: true }).map(({ text }) => text),
    ['hola', 'dato'],
  );
});

test('worstCaseBackground: texto claro mide contra el fondo más claro (p90) y oscuro contra p10', () => {
  const lums = Array.from({ length: 100 }, (_, i) => i / 99);
  assert.ok(Math.abs(worstCaseBackground(lums, 0.9) - 0.9) < 0.02);
  assert.ok(Math.abs(worstCaseBackground(lums, 0.05) - 0.1) < 0.02);
});

test('diskDayNight detecta día y noche dentro del disco y no en un disco uniforme', () => {
  const disk = { cx: 32, cy: 32, r: 28 };
  const split = image(64, 64, (x) => (x < 32 ? [200, 200, 200] : [8, 8, 10]));
  const lit = diskDayNight(split, disk);
  assert.ok(lit.dayMean > 0.4 && lit.nightMean < 0.02, JSON.stringify(lit));
  assert.ok(lit.ratio < 0.25);
  const flat = diskDayNight(
    image(64, 64, () => [90, 110, 140]),
    disk,
  );
  assert.ok(flat.ratio > 0.9);
});

test('haloRing: un anillo tenue fuera del limbo supera 2× el cielo', () => {
  const disk = { cx: 64, cy: 64, r: 40 };
  const withHalo = image(128, 128, (x, y) => {
    const d = Math.hypot(x - 64, y - 64);
    if (d <= 40) return [120, 140, 170];
    if (d <= 50) return [60, 90, 140];
    return [2, 2, 3];
  });
  const halo = haloRing(withHalo, disk);
  assert.ok(halo.ringMax > 2 * halo.skyMedian, JSON.stringify(halo));
  const bare = image(128, 128, (x, y) =>
    Math.hypot(x - 64, y - 64) <= 40 ? [120, 140, 170] : [2, 2, 3],
  );
  const none = haloRing(bare, disk);
  assert.ok(none.ringMax <= 2 * none.skyMedian + 0.01, JSON.stringify(none));
});

test('skyStats mide la densidad de estrellas fuera del disco', () => {
  const disk = { cx: 50, cy: 50, r: 20 };
  const sparse = image(100, 100, (x, y) =>
    (x * 7 + y * 13) % 997 === 0 ? [255, 255, 255] : [0, 0, 0],
  );
  const dense = image(100, 100, (x, y) =>
    (x + y) % 4 === 0 ? [200, 200, 200] : [0, 0, 0],
  );
  assert.ok(skyStats(sparse, disk).brightFraction < 0.002);
  assert.ok(skyStats(dense, disk).brightFraction > 0.1);
  assert.ok(skyStats(dense, disk).p99 > 0.45);
});

test('terminatorAngleFromSun: el terminador es perpendicular al Sol proyectado', () => {
  // Sol a la derecha → terminador vertical (0°).
  assert.ok(Math.abs(terminatorAngleFromSun(1, 0) - 0) < 1e-9);
  // Sol arriba → terminador horizontal (90°).
  assert.ok(Math.abs(terminatorAngleFromSun(0, 1) - 90) < 1e-9);
  // Sol a 30° sobre la horizontal → terminador a 30° de la vertical.
  const rad = (30 * Math.PI) / 180;
  assert.ok(
    Math.abs(terminatorAngleFromSun(-Math.cos(rad), Math.sin(rad)) - 30) < 1e-9,
  );
});

test('fontFaceLoaded exige una cara declarada y cargada, no solo check()', () => {
  const faces = [
    { family: '"Space Grotesk"', status: 'loaded' },
    { family: 'Instrument Serif', status: 'error' },
  ];
  assert.equal(fontFaceLoaded(faces, 'Space Grotesk'), true);
  assert.equal(fontFaceLoaded(faces, 'Instrument Serif'), false);
  assert.equal(fontFaceLoaded(faces, 'IBM Plex Mono'), false);
});

test('skyTint: el velo mineral fuera del disco se detecta (G−R ≥ 3) y un anillo oscuro también', () => {
  const disk = { cx: 100, cy: 100, r: 40 };
  // Captura de la issue: cielo lejano rgb(5,17,15) y 1,2 R rgb(0,2,2).
  const veiled = image(200, 200, (x, y) => {
    const d = Math.hypot(x - 100, y - 100);
    if (d <= 40) return [60, 90, 120];
    if (d <= 52) return [0, 2, 2];
    return [5, 17, 15];
  });
  const tint = skyTint(veiled, disk);
  assert.ok(tint.greenCast >= 3, JSON.stringify(tint));
  assert.ok(tint.keyholeStep > 0.003, JSON.stringify(tint));
  // Cielo del SkyBox sobrio: negro con alguna estrella blanca.
  const clean = image(200, 200, (x, y) => {
    if (Math.hypot(x - 100, y - 100) <= 40) return [60, 90, 120];
    return (x * 7 + y * 13) % 211 === 0 ? [240, 240, 240] : [0, 0, 0];
  });
  const ok = skyTint(clean, disk);
  assert.ok(ok.greenCast < 3, JSON.stringify(ok));
  assert.ok(ok.keyholeStep < 0.003, JSON.stringify(ok));
});

test('exclude: los rectángulos de UI no cuentan como cielo en skyStats, skyTint ni haloRing', () => {
  const disk = { cx: 100, cy: 100, r: 30 };
  const panel = { left: 0, top: 150, right: 200, bottom: 200 };
  const img = image(200, 200, (x, y) => {
    if (y >= 150) return [230, 240, 235];
    return Math.hypot(x - 100, y - 100) <= 30 ? [60, 90, 120] : [0, 0, 0];
  });
  assert.ok(skyStats(img, disk).brightFraction > 0.1);
  assert.equal(skyStats(img, disk, { exclude: [panel] }).brightFraction, 0);
  assert.ok(skyTint(img, disk, { exclude: [panel] }).greenCast < 3);
  const halo = haloRing(img, disk, { exclude: [panel] });
  assert.equal(halo.skyMedian, 0);
});

test('creditOverflow: todo hijo de #cesium-credits cabe en el viewport', () => {
  const rects = [
    { key: 'logo', left: 16, right: 95, width: 79 },
    { key: 'gibs', left: 222, right: 655, width: 433 },
    { key: 'expand', left: 655, right: 768, width: 113 },
    { key: 'hidden', left: 900, right: 900, width: 0 },
  ];
  assert.deepEqual(
    creditOverflow(rects, 390).map(({ key }) => key),
    ['gibs', 'expand'],
  );
  assert.deepEqual(creditOverflow(rects.slice(0, 1), 390), []);
});

test('telemetryAltitudeKm lee el formato es-MX del pie', () => {
  assert.equal(telemetryAltitudeKm('20,917.5 km'), 20917.5);
  assert.equal(telemetryAltitudeKm('802.1 km'), 802.1);
  assert.equal(telemetryAltitudeKm('—'), null);
});
