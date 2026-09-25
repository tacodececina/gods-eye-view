/**
 * Recorrido canónico P4 · P4-20, segunda mitad: si SGP4 falla para el
 * satélite seguido, la app dice «propagación falló» (expediente, chips,
 * acción) y no deja ni modelo ni punto en la última pose.
 *
 * Fixture 123458 (grupo cubesat, rotulado «P4 FIXTURE»): elementos vigentes
 * con arrastre extremo que SGP4 deja de propagar unos segundos después de
 * servirse (eyeinsky-p4-network.mjs decayingCubesatFixture). Página propia:
 * el reloj del fallo arranca al servir cubesat.
 */
import { screenshot, sleep } from './eyeinsky-p4-run.mjs';
import {
  clickAction,
  modelEvents,
  openApp,
  probe,
  trackById,
  waitForDock,
  waitModelReady,
} from './eyeinsky-p4-page.mjs';
import {
  DECAY_FIXTURE_NORAD,
  installInterception,
} from './eyeinsky-p4-network.mjs';

/** Antelación del fallo: carga, seguir, INSPECCIONAR y modelo listo. */
const DECAY_LEAD_MS = 75_000;
const FAIL_GRACE_MS = 20_000;
const FAILED_TEXT = /propagación falló/i;

/** Posición del punto seguido tal como la evalúa Cesium ahora. */
const trackedDot = (page) =>
  page.evaluate(() => {
    const viewer = window.__godsEyeView.viewer;
    const entity = viewer.trackedEntity;
    const now = viewer.clock.currentTime;
    return {
      following: Boolean(entity),
      position: Boolean(entity?.position?.getValue(now)),
      label: entity?.gevLabelModel?.details ?? null,
      trackedInfo: window.__godsEyeView.dataManager.layers
        .get('satellites')
        .module.getTrackedInfo(),
    };
  });

const summary = (state, dot) => ({
  selected: state.selected,
  contextStatus: state.contextStatus,
  altitude: state.properties?.altitude ?? null,
  statusLine: state.statusLine,
  chips: state.chips,
  inspect: state.inspect,
  reason: state.reason,
  framing: state.framing,
  stats: { active: state.stats.active, ids: state.stats.ids },
  dot,
});

async function waitForFailure(ctx, page) {
  const remaining = ctx.rules.decayFailAtMs - Date.now();
  await page
    .waitForFunction(
      (key) =>
        window.__gevContextStore?.entities?.get(key)?.status ===
        'propagation-failed',
      { timeout: Math.max(0, remaining) + FAIL_GRACE_MS, polling: 250 },
      String(DECAY_FIXTURE_NORAD),
    )
    .catch(() => null);
  await sleep(800);
}

async function beforeFailure(page) {
  await trackById(page, DECAY_FIXTURE_NORAD);
  await waitForDock(page, DECAY_FIXTURE_NORAD);
  await clickAction(page, 'inspect');
  const modelReady = await waitModelReady(page, DECAY_FIXTURE_NORAD);
  return {
    modelReady,
    state: summary(await probe(page), await trackedDot(page)),
  };
}

function failedOk(after, orbit, events) {
  const evicted = events.some(
    (e) =>
      e.type === 'model-evicted' &&
      e.noradId === DECAY_FIXTURE_NORAD &&
      e.reason === 'propagation-failed',
  );
  return {
    evicted,
    ok:
      after.selected === DECAY_FIXTURE_NORAD &&
      after.contextStatus === 'propagation-failed' &&
      after.altitude === '' &&
      FAILED_TEXT.test(after.statusLine ?? '') &&
      after.chips.includes('SIN MODELO — propagación falló') &&
      !after.stats.ids.includes(DECAY_FIXTURE_NORAD) &&
      after.dot.following &&
      !after.dot.position &&
      after.dot.trackedInfo === null &&
      (after.dot.label ?? []).some((line) => FAILED_TEXT.test(line)) &&
      orbit.framing === 'orbit' &&
      orbit.inspect?.disabled === true &&
      FAILED_TEXT.test(orbit.reason ?? ''),
  };
}

/** P4-20: SGP4 falla → «propagación falló», sin modelo ni pose congelada. */
export async function propagationFailure(ctx, baseUrl) {
  ctx.rules.decayLeadMs = DECAY_LEAD_MS;
  const page = await openApp(
    ctx.browser,
    ctx.result,
    baseUrl,
    { width: 1280, height: 800 },
    {
      beforeGoto: (p) => installInterception(p, ctx.rules),
      requireNorad: DECAY_FIXTURE_NORAD,
    },
  );
  try {
    const before = await beforeFailure(page);
    await waitForFailure(ctx, page);
    const after = summary(await probe(page), await trackedDot(page));
    await screenshot(ctx.result, ctx.out, page, 'p4-20-propagation-failed.png');
    if (after.framing === 'inspect') await clickAction(page, 'inspect');
    await sleep(1200);
    const orbit = summary(await probe(page), await trackedDot(page));
    const verdict = failedOk(after, orbit, await modelEvents(page));
    ctx.result.snapshots.propagationFailed = { before, after, orbit, verdict };
    ctx.check(
      'sgp4-falla-propagacion-fallo-sin-modelo-ni-pose',
      before.state.contextStatus === 'predicted' &&
        before.state.dot.position &&
        (!before.modelReady || verdict.evicted) &&
        verdict.ok,
      { modelReadyBefore: before.modelReady, ...verdict, after, orbit },
      'P4-20',
    );
  } finally {
    ctx.rules.decayLeadMs = null;
    await page.close();
  }
}
