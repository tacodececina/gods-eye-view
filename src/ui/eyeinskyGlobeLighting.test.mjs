/**
 * Iluminación del globo con el Sol del reloj de escena (fase visual T2): un
 * solo dueño que enciende la luz solar, la atmósfera de suelo y los fundidos
 * a escala de ciudad, y que restaura exactamente lo que encontró.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBE_LIGHTING,
  createGlobeLighting,
} from './eyeinskyGlobeLighting.js';

const stubGlobe = () => ({
  enableLighting: false,
  dynamicAtmosphereLighting: true,
  dynamicAtmosphereLightingFromSun: false,
  showGroundAtmosphere: true,
  lightingFadeOutDistance: 1e7,
  lightingFadeInDistance: 2e7,
  nightFadeOutDistance: 1e7,
  nightFadeInDistance: 5e7,
});

test('apply(true) enciende la luz solar; luz plena desde 3 500 km y noche sin borrar las luces', () => {
  const globe = stubGlobe();
  const lighting = createGlobeLighting({ globe });
  lighting.apply(true);
  assert.equal(globe.enableLighting, true);
  assert.equal(globe.dynamicAtmosphereLighting, true);
  assert.equal(globe.dynamicAtmosphereLightingFromSun, true);
  assert.equal(globe.showGroundAtmosphere, true);
  assert.equal(globe.lightingFadeOutDistance, 1.2e6);
  assert.equal(globe.lightingFadeInDistance, 3.5e6);
  // Medido (T2): con la oscuridad nocturna de la atmósfera de suelo activa a
  // la altura Global, GlobeFS sustituye el lado nocturno por el color de la
  // atmósfera y borra las luces de ciudad. Se aleja más allá de la entrada
  // (95 000 km) para que la noche se vea con sus luces.
  assert.ok(globe.nightFadeOutDistance > 95_000_000);
  assert.ok(globe.nightFadeInDistance > globe.nightFadeOutDistance);
  assert.ok(Object.isFrozen(GLOBE_LIGHTING));
});

test('restore() deja exactamente los valores previos; apply(false) no toca nada', () => {
  const globe = stubGlobe();
  const before = { ...globe };
  const lighting = createGlobeLighting({ globe });
  lighting.apply(true);
  lighting.restore();
  assert.deepEqual(globe, before);
  const untouched = stubGlobe();
  const off = createGlobeLighting({ globe: untouched });
  off.apply(false);
  assert.deepEqual(untouched, stubGlobe());
  off.restore();
  assert.deepEqual(untouched, stubGlobe());
});

test('sin globo no lanza y apply es idempotente', () => {
  assert.doesNotThrow(() => createGlobeLighting({ globe: null }).apply(true));
  const globe = stubGlobe();
  const before = { ...globe };
  const lighting = createGlobeLighting({ globe });
  lighting.apply(true);
  lighting.apply(true);
  lighting.restore();
  assert.deepEqual(globe, before, 'el segundo apply no pisa lo guardado');
});
