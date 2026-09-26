/**
 * Pose de inicio (fase visual T2, §2.3): con `solar` el globo queda centrado
 * (pitch −90) y el rumbo hace que el terminador salga en diagonal, 25–35° de
 * la vertical, para el Sol de cualquier fecha; la altura Global conserva
 * ≥ 17 000 km en escritorio. `legacy` reproduce la pose anterior y `tilt` es
 * la propuesta del sistema de diseño.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitHeight, solarHomePose } from './eyeinskyHomePose.js';

const rad = Math.PI / 180;
const unit = (latDeg, lonDeg) => [
  Math.cos(latDeg * rad) * Math.cos(lonDeg * rad),
  Math.cos(latDeg * rad) * Math.sin(lonDeg * rad),
  Math.sin(latDeg * rad),
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Ángulo terminador–vertical medido proyectando el Sol en la pantalla. */
function projectedTerminatorDeg(pose, sun) {
  const lat = pose.lat * rad;
  const lon = pose.lon * rad;
  const east = [-Math.sin(lon), Math.cos(lon), 0];
  const north = [
    -Math.sin(lat) * Math.cos(lon),
    -Math.sin(lat) * Math.sin(lon),
    Math.cos(lat),
  ];
  const h = pose.heading * rad;
  // pitch −90: «arriba» en pantalla es el acimut del rumbo.
  const up = north.map((n, i) => n * Math.cos(h) + east[i] * Math.sin(h));
  const right = east.map((e, i) => e * Math.cos(h) - north[i] * Math.sin(h));
  const sx = dot(sun, right);
  const sy = dot(sun, up);
  return Math.atan2(Math.abs(sy), Math.abs(sx)) / rad;
}

// Sol (subsolar lat, lon) en equinoccios y solsticios de 2026 a horas dispares.
const SUNS = {
  '2026-03-20T14:46Z': unit(0, -41.5),
  '2026-06-21T08:24Z': unit(23.44, 54),
  '2026-09-23T00:05Z': unit(0, 177.9),
  '2026-12-21T20:50Z': unit(-23.44, -129.1),
};
const DESKTOP = { width: 1440, height: 900 };
const FOVY_DESKTOP = 2 * Math.atan(Math.tan(30 * rad) * (900 / 1440));

test('solar: terminador 25–35° de la vertical en 4 fechas, globo centrado', () => {
  for (const [label, sun] of Object.entries(SUNS)) {
    const pose = solarHomePose({
      sunEcef: sun,
      viewport: DESKTOP,
      fovy: FOVY_DESKTOP,
    });
    assert.equal(pose.pitch, -90, label);
    const angle = projectedTerminatorDeg(pose, sun);
    assert.ok(angle >= 25 && angle <= 35, `${label}: ${angle.toFixed(2)}°`);
    const subsolarLon = Math.atan2(sun[1], sun[0]) / rad;
    const delta = ((((pose.lon - subsolarLon) % 360) + 540) % 360) - 180;
    assert.ok(Math.abs(delta - 60) < 1e-9, `${label}: lon subsolar + 60°`);
    assert.equal(pose.lat, 20);
  }
});

test('altura Global ≥ 17 000 km a 1440×900; el disco llena ~74 %', () => {
  const pose = solarHomePose({
    sunEcef: SUNS['2026-03-20T14:46Z'],
    viewport: DESKTOP,
    fovy: FOVY_DESKTOP,
  });
  assert.ok(pose.alt >= 17_000_000, `${pose.alt}`);
  assert.ok(pose.alt < 30_000_000, `${pose.alt}`);
});

test('fitHeight: más relleno = más cerca; el móvil llena el 90 % del ancho', () => {
  const fovy = FOVY_DESKTOP;
  const near = fitHeight({ viewport: DESKTOP, fovy, fill: 0.9 });
  const far = fitHeight({ viewport: DESKTOP, fovy, fill: 0.6 });
  assert.ok(near < far);
  const phone = fitHeight({
    viewport: { width: 390, height: 844 },
    fovy: 60 * rad,
    fill: 0.9,
  });
  assert.ok(phone > 15_000_000 && phone < 30_000_000, `${phone}`);
});

test('legacy reproduce {−92, 18, 18e6|26e6, 0, −90}; tilt = pitch −70, rumbo −20', () => {
  const sun = SUNS['2026-06-21T08:24Z'];
  assert.deepEqual(
    solarHomePose({ sunEcef: sun, viewport: DESKTOP, fovy: 1, mode: 'legacy' }),
    { lon: -92, lat: 18, alt: 18_000_000, heading: 0, pitch: -90 },
  );
  assert.equal(
    solarHomePose({
      sunEcef: sun,
      viewport: { width: 390, height: 844 },
      fovy: 1,
      mode: 'legacy',
    }).alt,
    26_000_000,
  );
  const tilt = solarHomePose({
    sunEcef: sun,
    viewport: DESKTOP,
    fovy: FOVY_DESKTOP,
    mode: 'tilt',
  });
  assert.equal(tilt.pitch, -70);
  assert.equal(tilt.heading, -20);
  assert.ok(tilt.alt >= 17_000_000);
  // La inclinación orbita el punto (lon, lat): el globo queda encuadrado; con
  // la misma cámara y pitch −70 el disco caía fuera de cuadro (medido en T2).
  assert.equal(tilt.frame, 'orbit');
  assert.equal(
    solarHomePose({ sunEcef: sun, viewport: DESKTOP, fovy: FOVY_DESKTOP })
      .frame,
    'camera',
  );
});

test('sin Sol (marco no disponible) cae a legacy y nunca lanza', () => {
  const pose = solarHomePose({ sunEcef: null, viewport: DESKTOP, fovy: 1 });
  assert.deepEqual(pose, {
    lon: -92,
    lat: 18,
    alt: 18_000_000,
    heading: 0,
    pitch: -90,
  });
});
