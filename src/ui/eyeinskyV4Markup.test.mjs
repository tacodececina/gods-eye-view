import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(
  new URL('./templates/eyeinsky.html', import.meta.url),
  'utf8',
);
const shell = readFileSync(
  new URL('./eyeinskyShell.js', import.meta.url),
  'utf8',
);

test('camera instruments expose short visible Spanish names without fake 3D controls', () => {
  for (const [id, label] of [
    ['eye-zoom-in', 'Acercar'],
    ['eye-zoom-out', 'Alejar'],
    ['eye-home', 'Global'],
    ['eye-north', 'Norte'],
    ['eye-grid', 'Retícula'],
    ['eye-clean', 'Limpia'],
  ]) {
    const button = html.match(
      new RegExp(`<button[^>]*id="${id}"[\\s\\S]*?<\\/button>`),
    )?.[0];
    assert.ok(button, `${id} exists`);
    assert.match(button, new RegExp(`<strong>${label}<\\/strong>`));
  }
  assert.doesNotMatch(html, /id="eye-tilt"/);
  assert.match(shell, /resetCameraNorth\(viewer\)/);
});

test('legacy telemetry has a labelled disclosure host instead of viewport corners', () => {
  assert.match(
    html,
    /<details[^>]*class="eye-hud-details eye-glass-surface"[^>]*>/,
  );
  assert.match(html, /<summary>Datos avanzados de vista<\/summary>/);
  assert.match(html, /id="eye-hud-host"/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
  assert.match(shell, /move\('intel-hud', 'eye-hud-host'\)/);
  assert.match(shell, /advancedTelemetryWasOpen/);
  assert.match(shell, /advancedTelemetry\.open = advancedTelemetryWasOpen/);
});
