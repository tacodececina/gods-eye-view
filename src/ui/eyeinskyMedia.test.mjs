import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creditLine,
  isMediaAllowed,
  resolveContextMedia,
} from './eyeinskyMedia.js';
import { EYE_MEDIA_MANIFEST, mediaForContext } from './eyeinskyMediaManifest.js';

test('sin derechos verificables o URL ejecutable no hay imagen', () => {
  assert.equal(isMediaAllowed({ id: 'fixture', src: 'javascript:alert(1)' }), false);
  assert.equal(isMediaAllowed({ id: 'fixture', src: '/eyeinsky/media/p3/a.webp' }), false);
});

test('una ruta remota no se admite aunque traiga licencia', () => {
  const [asset] = EYE_MEDIA_MANIFEST;
  assert.equal(
    isMediaAllowed({ ...asset, src: 'https://cdn.example.com/earth.webp' }),
    false,
  );
  assert.equal(isMediaAllowed({ ...asset, src: '//cdn.example.com/a.webp' }), false);
  assert.equal(isMediaAllowed({ ...asset, src: 'data:image/webp;base64,AA' }), false);
});

test('los dos activos curados del manifiesto sí se admiten', () => {
  assert.equal(EYE_MEDIA_MANIFEST.length, 2);
  for (const asset of EYE_MEDIA_MANIFEST) assert.equal(isMediaAllowed(asset), true);
});

test('falta cualquier dato de procedencia y el activo deja de admitirse', () => {
  const [asset] = EYE_MEDIA_MANIFEST;
  for (const field of [
    'credit',
    'license',
    'sourceUrl',
    'sha256',
    'alt',
    'contextKey',
  ]) {
    const incomplete = { ...asset };
    delete incomplete[field];
    assert.equal(
      isMediaAllowed(incomplete),
      false,
      `sin ${field} no hay permiso verificable`,
    );
  }
});

test('un hash que no parece un SHA-256 medido no basta', () => {
  const [asset] = EYE_MEDIA_MANIFEST;
  assert.equal(isMediaAllowed({ ...asset, sha256: 'por-medir' }), false);
});

test('las fotos de la Tierra son sólo de la vista Tierra', () => {
  assert.equal(mediaForContext('earth:view').length, 2);
  assert.deepEqual(resolveContextMedia('flights:abc123'), []);
  assert.deepEqual(resolveContextMedia('earthquakes:us7000'), []);
  assert.equal(resolveContextMedia('earth:view').length, 2);
});

test('el crédito nombra autor, permiso y condición de archivo', () => {
  const [asset] = EYE_MEDIA_MANIFEST;
  const line = creditLine(asset);
  assert.ok(line.includes('NASA'));
  assert.ok(/archivo/i.test(line), 'una foto de archivo se declara como tal');
  assert.ok(!/CC0|dominio público/i.test(line), 'no se afirma un permiso mayor');
});

// REPAIR-1 · La coincidencia con el manifiesto debe cubrir TODO lo que se
// muestra, no sólo la ruta y el hash: crédito, licencia, origen y contexto son
// las afirmaciones que el permiso respalda.
test('cualquier campo alterado respecto al manifiesto invalida el activo', () => {
  const [asset] = EYE_MEDIA_MANIFEST;
  const mutations = {
    credit: 'Estudio Inventado',
    author: 'Otra persona',
    license: 'CC0 — dominio público',
    licenseUrl: 'https://example.com/licencia',
    sourceUrl: 'https://example.com/foto',
    alt: 'otra descripción',
    contextKey: 'flights:abc123',
    title: 'Otro título',
  };
  for (const [field, value] of Object.entries(mutations)) {
    assert.equal(
      isMediaAllowed({ ...asset, [field]: value }),
      false,
      `un ${field} distinto del manifiesto no puede admitirse`,
    );
  }
});

test('una URL de crédito que no sea HTTPS no se admite', () => {
  const [asset] = EYE_MEDIA_MANIFEST;
  for (const bad of [
    'http://www.nasa.gov/x',
    'javascript:alert(1)',
    '//www.nasa.gov/x',
    'data:text/html,x',
  ]) {
    assert.equal(isMediaAllowed({ ...asset, sourceUrl: bad }), false);
    assert.equal(isMediaAllowed({ ...asset, licenseUrl: bad }), false);
  }
});

test('un activo fuera del manifiesto no se cuela por parecerse', () => {
  const [asset] = EYE_MEDIA_MANIFEST;
  const impostor = { ...asset, id: 'earth-generada', src: '/eyeinsky/media/p3/x.webp' };
  assert.equal(isMediaAllowed(impostor), false);
});
