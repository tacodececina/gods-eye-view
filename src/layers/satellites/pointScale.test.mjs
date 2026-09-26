/**
 * Satélites ≠ estrellas (fase visual T2 g, solo el tamaño base): a la
 * distancia Global el punto de cada clase mide ≥ 4 px, el doble de una
 * estrella del SkyBox sobrio (≤ 2 px). Una sola escala por distancia para la
 * ingestión y el catálogo; los colores de clase no cambian.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import {
  POINT_STYLES,
  SAT_POINT_SCALE,
  satPointScaleByDistance,
} from './policy.js';

const scaleAt = (scalar, distance) => {
  const t = Cesium.Math.clamp(
    (distance - scalar.near) / (scalar.far - scalar.near),
    0,
    1,
  );
  return scalar.nearValue + (scalar.farValue - scalar.nearValue) * t;
};

test('a la distancia Global (≈ 20 900 km) cada clase mide ≥ 4 px', () => {
  const scalar = satPointScaleByDistance();
  assert.ok(scalar instanceof Cesium.NearFarScalar);
  for (const distance of [20_500_000, 25_000_000, 27_000_000])
    for (const [group, style] of Object.entries(POINT_STYLES)) {
      if (group === 'dense') continue; // Starlink denso: tenue por diseño.
      const px = style.pixelSize * scaleAt(scalar, distance);
      assert.ok(px >= 4, `${group} a ${distance} m: ${px.toFixed(2)} px`);
    }
  assert.ok(Object.isFrozen(SAT_POINT_SCALE));
});

test('ingestión y catálogo usan la misma escala compartida', () => {
  for (const file of ['./ingestion.js', './catalog.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /satPointScaleByDistance\(\)/, file);
    assert.doesNotMatch(source, /NearFarScalar\(1e6, 1\.5, 2e7, 0\.6\)/, file);
  }
});
