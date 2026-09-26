/**
 * Capa de luces nocturnas (fase visual T2, §2.4): una ImageryLayer por el
 * proxy propio que solo se ve en el lado nocturno, rotulada como compuesto
 * 2012 «no en vivo», y una salud que la retira tras 6 fallos sin éxito.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NIGHT_LIGHTS,
  NIGHT_LIGHTS_CREDIT,
  NIGHT_LIGHTS_CREDIT_SHORT,
  createNightLightsLayer,
  nightLightsHealth,
} from './nightLights.js';

/** Cesium mínimo que registra lo que se construye. */
function fakeCesium() {
  class Credit {
    constructor(html, showOnScreen) {
      Object.assign(this, { html, showOnScreen });
    }
  }
  class WebMercatorTilingScheme {}
  class UrlTemplateImageryProvider {
    constructor(options) {
      this.options = options;
      this.errorEvent = { addEventListener: () => () => {} };
    }
  }
  class ImageryLayer {
    constructor(provider, options) {
      Object.assign(this, { provider, ...options });
    }
  }
  return {
    Credit,
    WebMercatorTilingScheme,
    UrlTemplateImageryProvider,
    ImageryLayer,
  };
}

test('la capa va por el proxy propio con z ≤ 8 y WebMercator', () => {
  const layer = createNightLightsLayer({ Cesium: fakeCesium() });
  const { options } = layer.provider;
  assert.equal(options.url, '/api/gibs/night/{z}/{y}/{x}.jpg');
  assert.equal(options.maximumLevel, 8);
  assert.ok(options.tilingScheme);
  assert.equal(NIGHT_LIGHTS.layer, 'VIIRS_CityLights_2012');
});

test('solo de noche: dayAlpha 0, nightAlpha 1 y un realce moderado', () => {
  const layer = createNightLightsLayer({ Cesium: fakeCesium() });
  assert.equal(layer.dayAlpha, 0);
  assert.equal(layer.nightAlpha, 1);
  // El sombreado día/noche deja el lado nocturno a 0,3 (GlobeFS): el realce
  // compensa hasta ~1 sin quemar las ciudades.
  assert.ok(layer.brightness >= 2.6 && layer.brightness <= 3.4);
  assert.ok(layer.contrast >= 1 && layer.contrast <= 1.4);
  assert.ok(layer.gamma > 0.7 && layer.gamma <= 1);
  assert.ok(layer.saturation >= 0.5 && layer.saturation <= 1);
});

test('el crédito dice fuente, año verificado y «no en vivo»', () => {
  const layer = createNightLightsLayer({ Cesium: fakeCesium() });
  assert.ok(layer.provider.options.credit.html.includes(NIGHT_LIGHTS_CREDIT));
  assert.equal(
    layer.provider.options.credit.showOnScreen,
    true,
    'visible en la línea de créditos mientras sus teselas se ven',
  );
  assert.match(NIGHT_LIGHTS_CREDIT, /NASA GIBS/);
  assert.match(NIGHT_LIGHTS_CREDIT, /VIIRS 2012/);
  assert.match(NIGHT_LIGHTS_CREDIT, /compuesto, no en vivo/);
});

test('crédito corto para teléfono: cabe en una línea y conserva «no en vivo»', () => {
  assert.ok(NIGHT_LIGHTS_CREDIT_SHORT.length <= 36);
  assert.match(NIGHT_LIGHTS_CREDIT_SHORT, /NASA GIBS/);
  assert.match(NIGHT_LIGHTS_CREDIT_SHORT, /VIIRS 2012/);
  assert.match(NIGHT_LIGHTS_CREDIT_SHORT, /no en vivo/);
  const layer = createNightLightsLayer({ Cesium: fakeCesium() });
  const { html } = layer.provider.options.credit;
  // Las dos versiones van en el mismo crédito; la hoja elige por anchura
  // (≤ 650 px: corta). Nunca se oculta la atribución, solo se abrevia.
  assert.ok(
    html.includes(
      `<span class="eye-credit-long">${NIGHT_LIGHTS_CREDIT}</span>`,
    ),
  );
  assert.ok(
    html.includes(
      `<span class="eye-credit-short">${NIGHT_LIGHTS_CREDIT_SHORT}</span>`,
    ),
  );
});

test('salud: ok → degraded con errores sueltos → absent a los 6 sin éxito', () => {
  const health = nightLightsHealth({ maxErrors: 6 });
  assert.equal(health.state(), 'ok');
  health.recordError();
  assert.equal(health.state(), 'degraded');
  for (let i = 0; i < 5; i += 1) health.recordError();
  assert.equal(health.state(), 'absent');
  const recovered = nightLightsHealth({ maxErrors: 6 });
  recovered.recordLoad();
  for (let i = 0; i < 10; i += 1) recovered.recordError();
  assert.equal(
    recovered.state(),
    'degraded',
    'con teselas buenas no se retira',
  );
});
