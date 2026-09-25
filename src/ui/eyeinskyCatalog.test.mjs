import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogAvailability,
  deriveEyeCatalog,
  EYE_COMING_SOON,
} from './eyeinskyCatalog.js';

test('catalog derives lifecycle and availability from manager records', () => {
  const rows = deriveEyeCatalog([
    {
      id: 'open',
      name: 'Open',
      enabled: false,
      lifecycleState: 'disabled',
      stats: {},
    },
    {
      id: 'keyed',
      name: 'Keyed',
      enabled: false,
      requiresKeyId: 'provider',
      lifecycleState: 'disabled',
      stats: {},
    },
    {
      id: 'busy',
      name: 'Busy',
      enabled: true,
      lifecycleState: 'enabling',
      stats: { loading: true },
    },
    {
      id: 'broken',
      name: 'Broken',
      enabled: true,
      lifecycleState: 'enabled',
      stats: { error: 'offline' },
    },
  ]);
  assert.equal(rows.find((row) => row.id === 'open').availability, 'available');
  assert.equal(
    rows.find((row) => row.id === 'keyed').availability,
    'config-required',
  );
  assert.equal(rows.find((row) => row.id === 'busy').state, 'loading');
  assert.equal(rows.find((row) => row.id === 'broken').state, 'error');
  assert.ok(EYE_COMING_SOON.every((row) => row.state === 'coming-soon'));
});

test('runtime sources without a declared key remain available', () => {
  assert.equal(catalogAvailability({ id: 'satellites' }), 'available');
  assert.equal(
    catalogAvailability({ id: 'local-firms', requiresKeyId: 'firms' }),
    'config-required',
  );
  assert.equal(
    catalogAvailability({ id: 'telegeography-submarine-cables' }),
    'license-restricted',
  );
});

test('P5: con Misiones espaciales activo, «Agregar» Luna sale deshabilitado CON su motivo', async () => {
  const { catalogToggleView } = await import('./eyeinskyCatalog.js');
  const moon = {
    id: 'moon',
    name: 'Luna (efeméride DE441)',
    enabled: false,
    lifecycleState: 'disabled',
    stats: {},
  };
  const [blocked] = deriveEyeCatalog([moon], { contextMode: 'space-missions' });
  assert.equal(blocked.blockedReason, 'No disponible en Misiones espaciales');
  assert.deepEqual(catalogToggleView(blocked), {
    text: 'No disponible',
    disabled: true,
    ariaLabel: 'Agregar Luna (efeméride DE441): No disponible en Misiones espaciales',
  });
  const [free] = deriveEyeCatalog([moon]);
  assert.equal(free.blockedReason, null);
  assert.deepEqual(catalogToggleView(free), {
    text: 'Agregar',
    disabled: false,
    ariaLabel: null,
  });
  const [on] = deriveEyeCatalog([{ ...moon, enabled: true }], {
    contextMode: 'space-missions',
  });
  assert.equal(on.blockedReason, null, 'una capa ya encendida se puede apagar');
});
