/**
 * P4-20 (segunda mitad) — si SGP4 falla para el satélite seguido, la capa
 * dice «propagación falló»: no hay modelo, no se congela la última pose como
 * si fuera válida, y el expediente, los chips y la acción INSPECCIONAR lo
 * rotulan. Al volver a propagar, todo vuelve a `predicted`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  ISS,
  SATREC,
  contextRecord,
  flush,
  frame,
  satellitesLayer,
  scene,
} from '../testSupport/satelliteTrackingScene.mjs';
import { _satelliteModelStatsForTest } from './satellites.js';
import { contextFromRecord } from '../ui/eyeinskyDossierModel.js';
import {
  resolveInspectAction,
  resolveSatelliteChips,
  resolveSatelliteRail,
} from '../ui/eyeinskySatelliteChips.js';

/** SGP4 rejects an eccentricity ≥ 1: propagate() returns no position. */
const BROKEN_ECCENTRICITY = 1.5;

async function trackWithReadyModel() {
  // A private copy: breaking it must not touch the shared fixture satrec.
  const satrec = { ...SATREC };
  const s = scene({ issElements: { satrec } });
  await flush();
  satellitesLayer.trackById(ISS, { origin: 'user' });
  const entity = s.viewer.trackedEntity;
  frame(s);
  await s.loads.at(-1).resolve();
  frame(s);
  assert.equal(contextRecord()?.properties?.modelStatus, 'listo');
  assert.equal(_satelliteModelStatsForTest().active, 1, 'precondition');
  return { ...s, entity, satrec };
}

const dockContext = () =>
  contextFromRecord(contextRecord(), { kind: 'tracked' });

test('SGP4 failure on the tracked satellite: «propagación falló», no model, no frozen pose', async () => {
  const s = await trackWithReadyModel();
  try {
    const eccentricity = s.satrec.ecco;
    s.satrec.ecco = BROKEN_ECCENTRICITY;
    for (let i = 0; i < 4; i += 1) frame(s);

    const record = contextRecord();
    assert.equal(record?.id, String(ISS), 'the subject is kept');
    assert.equal(record.status, 'propagation-failed');
    assert.equal(record.latitude, null, 'no stale latitude');
    assert.equal(record.longitude, null, 'no stale longitude');
    assert.equal(record.properties.altitude, '', 'no stale altitude');
    assert.equal(satellitesLayer.getParams().selectedSatTrackingId, ISS);

    assert.equal(
      s.entity.position.getValue(Cesium.JulianDate.now()),
      undefined,
      'the tracked dot does not fall back to the last pose',
    );
    assert.ok(
      s.entity.gevLabelModel.details.some((line) =>
        /propagación falló/i.test(line),
      ),
      'the tracked card says it',
    );

    const stats = _satelliteModelStatsForTest();
    assert.equal(stats.active, 0, 'the model left');
    assert.equal(stats.pending, 0);
    assert.ok(!stats.ids.includes(ISS));

    const context = dockContext();
    assert.equal(context.status, 'propagation-failed');
    const chips = resolveSatelliteChips(context).map((chip) => chip.text);
    assert.ok(chips.includes('SIN MODELO — propagación falló'), chips);
    // No pose, no drawn model: neither scale nor attitude is claimed.
    assert.ok(!chips.includes('ESCALA REAL'), chips);
    assert.ok(!chips.some((text) => text.startsWith('ACT.')), chips);
    const rail = resolveSatelliteRail(context);
    assert.equal(
      rail.find((item) => item.label === 'MODELO')?.value,
      'SIN MODELO',
    );
    const action = resolveInspectAction(context);
    assert.equal(action.enabled, false);
    assert.match(action.hint, /propagación falló/i);
    assert.equal(
      satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true }),
      false,
      'the layer refuses inspect like the dock',
    );

    // Recovery: a good sample again is `predicted`, with a position.
    s.satrec.ecco = eccentricity;
    s.satrec.error = 0;
    frame(s);
    const recovered = contextRecord();
    assert.equal(recovered.status, 'predicted');
    assert.ok(Number.isFinite(recovered.latitude));
    assert.notEqual(recovered.properties.altitude, '');
    assert.ok(s.entity.position.getValue(Cesium.JulianDate.now()));
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('SGP4 failure keeps the model out on later reconciles', async () => {
  const s = await trackWithReadyModel();
  try {
    s.satrec.ecco = BROKEN_ECCENTRICITY;
    frame(s);
    for (let i = 0; i < 6; i += 1) frame(s, { ms: 0 }, 400);
    assert.equal(s.loads.length, 1, 'no new load while propagation fails');
    assert.equal(_satelliteModelStatsForTest().active, 0);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});
