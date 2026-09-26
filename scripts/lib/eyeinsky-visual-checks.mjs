/**
 * Medidas puras del arnés visual Editorial (T0). Nada aquí toca el navegador:
 * reciben rectángulos, colores o imágenes RGBA decodificadas
 * (`{width, height, channels, data}`) y devuelven números comparables.
 */

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** '#rgb' | '#rrggbb' | 'rgb(…)' | 'rgba(…)' | 'transparent' → [r,g,b,a]. */
export function parseCssColor(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (text === 'transparent' || !text) return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits =
      hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)).concat(1);
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(text);
  if (!fn) return [0, 0, 0, 0];
  const parts = fn[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return [r, g, b, Number.isFinite(a) ? a : 1];
}

const channel = (value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Luminancia relativa WCAG de [r,g,b] 0–255. */
export function relativeLuminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const asRgb = (color) =>
  typeof color === 'string' ? parseCssColor(color).slice(0, 3) : color;

/** Razón de contraste entre dos luminancias relativas. */
export const luminanceContrast = (la, lb) =>
  (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

/** Razón de contraste WCAG entre dos colores (hex/css o [r,g,b]). */
export function contrastRatio(a, b) {
  return luminanceContrast(
    relativeLuminance(asRgb(a)),
    relativeLuminance(asRgb(b)),
  );
}

/** Mezcla [r,g,b,a] sobre un fondo opaco [r,g,b]. */
export function compositeOver([r, g, b, a], [br, bg, bb]) {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
}

/** Superficies con área y opacidad perceptible (plan T0, paso 3). */
export function visibleSurfaces(rects) {
  return rects.filter(
    ({ w, h, opacity = 1 }) => w > 0 && h > 0 && opacity > 0.05,
  ).length;
}

/**
 * Superficies de reposo fuera de las zonas permitidas (barra superior,
 * buscador, telemetría, controles de cámara): cuenta solo las cajas
 * exteriores (una caja dentro de otra caja contada no suma).
 * @param {{key:string, zone:string|null, parent:string|null}[]} boxes
 */
export function restSurfaceCount(boxes) {
  const keys = boxes
    .filter(({ zone, parent }) => !zone && !parent)
    .map(({ key }) => key);
  return { count: keys.length, keys };
}

/** Pares de rectángulos que se solapan más de `tolerance` px por eje. */
export function overlaps(rects, { ignore = [], tolerance = 1 } = {}) {
  const list = rects.filter(({ key }) => !ignore.includes(key));
  const pairs = [];
  for (let i = 0; i < list.length; i += 1)
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > tolerance && h > tolerance)
        pairs.push({ a: a.key, b: b.key, width: w, height: h });
    }
  return pairs;
}

/** Textos bajo el suelo: 14 px en móvil, 12 px en escritorio; atribuciones fuera. */
export function textFloorViolations(items, { mobile }) {
  const floor = mobile ? 14 : 12;
  return items.filter(
    ({ size, attribution }) => !attribution && size < floor - 0.01,
  );
}

/** Percentil `p` (0–1) de una lista numérica. */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  const index = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

/**
 * Fondo en el peor caso para un texto de luminancia `textLum`: el texto claro
 * se lee peor sobre el fondo más claro (p90) y el oscuro sobre el más oscuro
 * (p10).
 */
export function worstCaseBackground(backgroundLums, textLum) {
  const median = percentile(backgroundLums, 0.5);
  return textLum >= median
    ? percentile(backgroundLums, 0.9)
    : percentile(backgroundLums, 0.1);
}

/** Luminancia relativa del píxel (x, y) de una imagen RGBA/RGB. */
export function pixelLuminance(img, x, y) {
  const c = img.channels ?? 4;
  const i = (Math.round(y) * img.width + Math.round(x)) * c;
  return relativeLuminance([img.data[i], img.data[i + 1], img.data[i + 2]]);
}

/** Luminancias de un rectángulo (recortado a la imagen), con paso opcional. */
export function regionLuminances(img, { left, top, right, bottom }, step = 1) {
  const out = [];
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(img.width - 1, Math.ceil(right));
  const y1 = Math.min(img.height - 1, Math.ceil(bottom));
  for (let y = y0; y <= y1; y += step)
    for (let x = x0; x <= x1; x += step) out.push(pixelLuminance(img, x, y));
  return out;
}

const cellInside = (img, { cx, cy }, inner, left, top, cell) => {
  const corners = [
    [left, top],
    [left + cell, top],
    [left, top + cell],
    [left + cell, top + cell],
  ];
  return (
    corners.every(([x, y]) => Math.hypot(x - cx, y - cy) <= inner) &&
    left >= 0 &&
    top >= 0 &&
    left + cell < img.width &&
    top + cell < img.height
  );
};

/**
 * Día y noche dentro del disco: medias de celdas de una rejilla 6×6 que caen
 * enteras dentro del 92 % del radio. `ratio` = celda más oscura / más clara.
 */
export function diskDayNight(img, disk, grid = 6) {
  const { cx, cy, r } = disk;
  const inner = r * 0.92;
  const cell = (2 * inner) / grid;
  const means = [];
  for (let gy = 0; gy < grid; gy += 1)
    for (let gx = 0; gx < grid; gx += 1) {
      const left = cx - inner + gx * cell;
      const top = cy - inner + gy * cell;
      if (!cellInside(img, disk, inner, left, top, cell)) continue;
      const lums = regionLuminances(
        img,
        { left, top, right: left + cell, bottom: top + cell },
        Math.max(1, Math.floor(cell / 12)),
      );
      means.push(lums.reduce((s, v) => s + v, 0) / lums.length);
    }
  if (!means.length)
    return { cells: 0, dayMean: NaN, nightMean: NaN, ratio: NaN };
  const dayMean = Math.max(...means);
  const nightMean = Math.min(...means);
  return {
    cells: means.length,
    dayMean,
    nightMean,
    ratio: dayMean > 0 ? nightMean / dayMean : NaN,
  };
}

/** (x, y) cae dentro de algún rectángulo de UI a excluir. */
const excluded = (exclude, x, y) =>
  exclude.some(
    ({ left, top, right, bottom }) =>
      x >= left && x <= right && y >= top && y <= bottom,
  );

/**
 * Halo: media por sector angular (10°) del anillo `r+inner … r+outer` px
 * frente a la mediana del cielo lejano (`r·1.35 … r·1.6`). `exclude` quita
 * los rectángulos de UI cuando se mide sobre la captura compuesta.
 */
export function haloRing(
  img,
  { cx, cy, r },
  { inner = 3, outer = 12, exclude = [] } = {},
) {
  const bins = Array.from({ length: 36 }, () => ({ sum: 0, n: 0 }));
  const sky = [];
  const reach = r * 1.6 + 2;
  const x0 = Math.max(0, Math.floor(cx - reach));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + reach));
  const y0 = Math.max(0, Math.floor(cy - reach));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + reach));
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      if (exclude.length && excluded(exclude, x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r + inner && d <= r + outer) {
        const angle = (Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI);
        const bin = bins[Math.min(35, Math.floor(angle * 36))];
        bin.sum += pixelLuminance(img, x, y);
        bin.n += 1;
      } else if (d >= r * 1.35 && d <= r * 1.6 && (x + y) % 3 === 0) {
        sky.push(pixelLuminance(img, x, y));
      }
    }
  const means = bins.filter(({ n }) => n > 4).map(({ sum, n }) => sum / n);
  return {
    ringMax: means.length ? Math.max(...means) : NaN,
    ringMin: means.length ? Math.min(...means) : NaN,
    skyMedian: sky.length ? percentile(sky, 0.5) : NaN,
    sectors: means.length,
  };
}

/** Cielo fuera del disco (y su halo, `r·1.15`): p99 y fracción de píxeles > .25. */
export function skyStats(
  img,
  { cx, cy, r },
  { bright = 0.25, exclude = [] } = {},
) {
  const lums = [];
  for (let y = 0; y < img.height; y += 1)
    for (let x = 0; x < img.width; x += 1)
      if (
        Math.hypot(x - cx, y - cy) > r * 1.15 &&
        !(exclude.length && excluded(exclude, x, y))
      )
        lums.push(pixelLuminance(img, x, y));
  const brightCount = lums.filter((v) => v > bright).length;
  return {
    samples: lums.length,
    p99: percentile(lums, 0.99),
    brightFraction: lums.length ? brightCount / lums.length : NaN,
  };
}

/**
 * Ángulo (0–90°) entre el terminador y la vertical de pantalla, dado el Sol
 * proyectado en el plano de pantalla (`x` a la derecha, `y` hacia arriba):
 * el terminador es perpendicular a esa proyección.
 */
export function terminatorAngleFromSun(sx, sy) {
  return (Math.atan2(Math.abs(sy), Math.abs(sx)) * 180) / Math.PI;
}

const bareFamily = (family) => String(family).replace(/^["']|["']$/g, '');

/** Hay una cara `family` declarada y en estado «loaded». */
export function fontFaceLoaded(faces, family) {
  return faces.some(
    (face) => bareFamily(face.family) === family && face.status === 'loaded',
  );
}

/**
 * Tinte del cielo compuesto fuera del disco (V-14, «la Tierra es lo único que
 * brilla»): `greenCast` = mediana de G−R (un velo mineral la sube) y
 * `keyholeStep` = |luminancia mediana lejana − cercana| entre la banda
 * `r·1.1–1.3` y el resto (un ojo de cerradura deja un anillo). Sin muestras
 * en una banda, `keyholeStep` es null.
 */
export function skyTint(img, { cx, cy, r }, { exclude = [], step = 2 } = {}) {
  const casts = [];
  const near = [];
  const far = [];
  const c = img.channels ?? 4;
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r * 1.1) continue;
      if (exclude.length && excluded(exclude, x, y)) continue;
      const i = (y * img.width + x) * c;
      casts.push(img.data[i + 1] - img.data[i]);
      (d <= r * 1.3 ? near : far).push(pixelLuminance(img, x, y));
    }
  const nearMedian = near.length ? percentile(near, 0.5) : null;
  const farMedian = far.length ? percentile(far, 0.5) : null;
  return {
    samples: casts.length,
    greenCast: casts.length ? percentile(casts, 0.5) : NaN,
    nearMedian,
    farMedian,
    keyholeStep:
      nearMedian === null || farMedian === null
        ? null
        : Math.abs(farMedian - nearMedian),
  };
}

/** Hijos visibles de los créditos que se salen del viewport (V-06, §6.10). */
export function creditOverflow(rects, viewportWidth, tolerance = 0.5) {
  return rects.filter(
    ({ left, right, width }) =>
      width > 0 && (right > viewportWidth + tolerance || left < -tolerance),
  );
}

/** Altura en km del pie de telemetría (formato es-MX), o null. */
export function telemetryAltitudeKm(text) {
  const match = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*km/.exec(String(text ?? ''));
  return match ? Number(match[1].replace(/,/g, '')) : null;
}
