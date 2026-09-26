/**
 * Tipografía Editorial en el lienzo de rótulos (fase visual T4): una entrada
 * con `typeface: 'editorial'` mide y pinta en Space Grotesk (nunca mono) y
 * el rótulo compacto lleva placa --ei-bg a .8. Sin el campo, todo igual.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measureOverlayEntry,
  paintLabel,
  paintTracked,
  placementVariants,
} from './worldOverlayDraw.js';
import {
  WORLD_OVERLAY_EDITORIAL_TYPE,
  WORLD_OVERLAY_STYLE,
} from './worldOverlayTokens.js';

function fontRecorder() {
  const texts = [];
  const fills = [];
  return {
    texts,
    fills,
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
    measureText(text) {
      return { width: String(text).length * 7 };
    },
    save() {},
    restore() {},
    beginPath() {},
    roundRect() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {
      fills.push(this.fillStyle);
    },
    stroke() {},
    fillRect() {},
    fillText(text) {
      texts.push({ text, font: this.font });
    },
  };
}

const place = (layout) =>
  placementVariants({
    anchorX: 200,
    anchorY: 180,
    width: layout.w,
    height: layout.h,
    viewportWidth: 600,
    viewportHeight: 400,
    verticalOnly: true,
  })[0];

test('fuentes editoriales: Grotesk para títulos y rótulos, nunca mono', () => {
  for (const font of Object.values(WORLD_OVERLAY_EDITORIAL_TYPE.fonts)) {
    assert.match(font, /Space Grotesk/);
    assert.doesNotMatch(font, /Mono|monospace/);
  }
  assert.match(WORLD_OVERLAY_EDITORIAL_TYPE.fonts.label, /^500 13px/);
  assert.equal(WORLD_OVERLAY_EDITORIAL_TYPE.labelPlate, 'rgba(7, 17, 16, 0.8)');
});

test('ficha fijada editorial: título y detalles en Grotesk', () => {
  const ctx = fontRecorder();
  const entry = {
    variant: 'tracked',
    typeface: 'editorial',
    title: 'ISS (ZARYA)',
    details: ['Estación · ISS', '424 km · NORAD 25544'],
    accent: '#e6b46d',
  };
  entry._overlayLayout = measureOverlayEntry(ctx, entry, {});
  paintTracked(ctx, entry, place(entry._overlayLayout), 1);
  assert.equal(ctx.texts.length, 3);
  for (const { font } of ctx.texts) assert.match(font, /Space Grotesk/);
});

test('rótulo compacto editorial: Grotesk sobre placa --ei-bg .8', () => {
  const ctx = fontRecorder();
  const entry = {
    variant: 'label',
    typeface: 'editorial',
    title: 'ISS',
    accent: '#a6d7c2',
  };
  entry._overlayLayout = measureOverlayEntry(ctx, entry, {});
  paintLabel(ctx, entry, place(entry._overlayLayout), 1);
  assert.match(ctx.texts[0].font, /^500 13px "Space Grotesk"/);
  assert.ok(ctx.fills.includes('rgba(7, 17, 16, 0.8)'));
});

test('sin typeface la tipografía mono de siempre no cambia', () => {
  const ctx = fontRecorder();
  const entry = { variant: 'tracked', title: 'UAL123', details: ['FL350'] };
  entry._overlayLayout = measureOverlayEntry(ctx, entry, {});
  paintTracked(ctx, entry, place(entry._overlayLayout), 1);
  assert.equal(ctx.texts[0].font, WORLD_OVERLAY_STYLE.fontTrackedTitle);
  assert.equal(ctx.texts[1].font, WORLD_OVERLAY_STYLE.fontTrackedDetail);
});
