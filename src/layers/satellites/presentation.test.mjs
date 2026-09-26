/**
 * Satélites con `?globe=editorial` (satStyle=editorial, satLabels=intent):
 * sin rojo ni amarillo de visor, ISS en verde mineral vivo y ámbar solo al
 * fijarla, órbita discontinua fina en verde, ficha en Grotesk sin mayúsculas
 * de consola, sin corchetes de detección y rótulos por intención con el
 * presupuesto por altura (plan §2.5). En legacy nada cambia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { ISS_NORAD, POINT_STYLES, satelliteLabelBudget } from './policy.js';
import {
  EDITORIAL_SAT_COLORS,
  editorialCardDetails,
  issLabelLook,
  orbitPathLook,
  pointStyleFor,
  resolveSatellitePresentation,
  satelliteDetectionEnabled,
  trackedCardLook,
  trackedPointColor,
} from './presentation.js';

const css = (color) => color.toCssHexString();
const EDITORIAL = resolveSatellitePresentation({
  style: 'editorial',
  labels: 'intent',
});
const LEGACY = resolveSatellitePresentation();

test('la presentación se resuelve congelada y cae a legacy ante valores ajenos', () => {
  assert.deepEqual({ ...LEGACY }, { style: 'legacy', labels: 'legacy' });
  assert.ok(Object.isFrozen(EDITORIAL));
  assert.deepEqual(
    { ...resolveSatellitePresentation({ style: 'neon', labels: 7 }) },
    { style: 'legacy', labels: 'legacy' },
  );
});

test('paleta: verde mineral #a6d7c2 y ámbar #e6b46d, nunca rojo ni amarillo puro', () => {
  assert.equal(EDITORIAL_SAT_COLORS.live, '#a6d7c2');
  assert.equal(EDITORIAL_SAT_COLORS.amber, '#e6b46d');
});

test('ISS en editorial: 7 px en --ei-live con halo de su color a .25; legacy intacta', () => {
  const iss = pointStyleFor(ISS_NORAD, 'stations', EDITORIAL);
  assert.equal(iss.pixelSize, 7);
  assert.equal(css(iss.color), '#a6d7c2');
  assert.equal(css(iss.outlineColor.withAlpha(1)), '#a6d7c2');
  assert.ok(Math.abs(iss.outlineColor.alpha - 0.25) < 1e-6);
  assert.equal(iss.outlineWidth, 3);
  assert.equal(pointStyleFor(ISS_NORAD, 'stations', LEGACY), POINT_STYLES.iss);
  // Los colores de clase no cambian en ninguna piel.
  for (const group of ['stations', 'cubesat', 'gps-ops', 'geo', 'visual'])
    assert.equal(
      pointStyleFor(1, group, EDITORIAL),
      pointStyleFor(1, group, LEGACY),
    );
});

test('órbita editorial: discontinua, 1,5 px, verde a .7; legacy conserva su look', () => {
  for (const tracked of [false, true]) {
    const look = orbitPathLook(EDITORIAL, { iss: true, tracked });
    assert.equal(look.dashed, true);
    assert.equal(look.width, 1.5);
    assert.equal(css(look.color.withAlpha(1)), '#a6d7c2');
    assert.ok(Math.abs(look.color.alpha - 0.7) < 1e-6);
    assert.ok(look.depthFailColor.alpha < look.color.alpha);
  }
  const legacyIss = orbitPathLook(LEGACY, { iss: true, tracked: false });
  assert.equal(legacyIss.dashed, false);
  assert.equal(legacyIss.width, 2.5);
  assert.equal(css(legacyIss.color.withAlpha(1)), '#ff4444');
  const legacyTracked = orbitPathLook(LEGACY, { iss: false, tracked: true });
  assert.equal(legacyTracked.width, 2);
  assert.ok(
    Cesium.Color.equals(legacyTracked.color.withAlpha(1), Cesium.Color.YELLOW),
  );
});

test('punto y ficha del objetivo fijado: ámbar y Grotesk en editorial', () => {
  assert.equal(css(trackedPointColor(EDITORIAL)), '#e6b46d');
  assert.ok(
    Cesium.Color.equals(trackedPointColor(LEGACY), Cesium.Color.YELLOW),
  );
  assert.deepEqual(trackedCardLook(EDITORIAL), {
    accent: '#e6b46d',
    typeface: 'editorial',
  });
  assert.deepEqual(trackedCardLook(LEGACY), { accent: '#ffd84d' });
});

test('detalles de la ficha: sin jerga de consola en mayúsculas', () => {
  assert.deepEqual(
    editorialCardDetails([
      'STATION · ISS',
      '424 km · NORAD 25544',
      'DOCKED · CREW DRAGON 12 · +6',
      'NAV · GPS',
      'COMMS · STARLINK',
    ]),
    [
      'Estación · ISS',
      '424 km · NORAD 25544',
      'Acoplada · CREW DRAGON 12 · +6',
      'Navegación · GPS',
      'Comunicaciones · STARLINK',
    ],
  );
});

test('presupuesto de rótulos (§2.5): 0 en Global, ≤3 en órbita media, ≤8 cerca', () => {
  assert.equal(satelliteLabelBudget(20_900_000), 0);
  assert.equal(satelliteLabelBudget(8_600_000), 0);
  assert.equal(satelliteLabelBudget(6_800_000), 3);
  assert.equal(satelliteLabelBudget(1_000_000), 3);
  assert.equal(satelliteLabelBudget(999_999), 8);
  assert.equal(satelliteLabelBudget(Number.NaN), 0);
});

test('rótulo ambiental de la ISS en editorial: se apaga por encima de 8,6e6 m', () => {
  const look = issLabelLook(EDITORIAL);
  assert.equal(look.accent, '#a6d7c2');
  assert.equal(look.typeface, 'editorial');
  assert.ok(look.altitudeFadeEnd <= 8_600_000);
  assert.ok(look.altitudeFadeStart < look.altitudeFadeEnd);
  assert.deepEqual(issLabelLook(LEGACY), { accent: '#ff4444' });
});

test('sin corchetes: los satélites salen de la detección con rótulos por intención', () => {
  assert.equal(satelliteDetectionEnabled(EDITORIAL), false);
  assert.equal(satelliteDetectionEnabled(LEGACY), true);
  assert.equal(
    satelliteDetectionEnabled(
      resolveSatellitePresentation({ style: 'editorial', labels: 'legacy' }),
    ),
    true,
  );
});
