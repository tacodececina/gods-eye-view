/**
 * Cámara del shell: planes de vuelo por la autoridad de navegación, sectores
 * y los instrumentos Global/Home, Norte y zoom.
 */
import { planTargetCameraTransition } from '../../navigationPolicy.js';
import { $ } from './shellDom.js';
import { resolveHomePose } from './homeView.js';

const SECTORS = {
  global: { lat: 18, lon: -92, alt: 18000000 },
  mexico: { lat: 23, lon: -102, alt: 4500000 },
  pacific: { lat: 10, lon: -155, alt: 13000000 },
  europe: { lat: 48, lon: 15, alt: 4500000 },
};
const MOBILE_GLOBAL_WIDTH = 650;
const MOBILE_GLOBAL_ALT = 26000000;
const FINAL_STAGE_SECONDS = 0.62;
const MIN_ALT = 1000;
const MAX_ALT = 70000000;
const ZOOM_FACTORS = [
  ['eye-zoom-in', 0.72],
  ['eye-zoom-out', 1.4],
];

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} camera y sector.
 */
export function createCamera(shell) {
  const { state, styleManager, viewer, reduced } = shell;
  function camera(pose, { targetId = null } = {}) {
    const target = {
      ...pose,
      id: targetId,
      heading: pose.heading ?? 0,
      pitch: pose.pitch ?? -90,
      roll: pose.roll ?? 0,
    };
    const changedTarget = targetId && targetId !== state.lastCameraTargetId;
    const stages = changedTarget
      ? planTargetCameraTransition({
          current: styleManager.getCameraState(),
          target,
          reducedMotion: reduced(),
        })
      : [
          {
            ...target,
            phase: 'final',
            duration: reduced() ? 0 : FINAL_STAGE_SECONDS,
          },
        ];
    const accepted = styleManager._navigation.runCameraPlan('vista', stages);
    if (accepted !== false) state.lastCameraTargetId = targetId;
    viewer.scene.requestRender();
    return accepted;
  }
  function sector(id) {
    const pose = SECTORS[id];
    if (!pose) return;
    // Global = la pose de inicio (solar/tilt/legacy, §2.3), del Sol de escena.
    const target =
      id === 'global' && shell.flags?.homePose !== 'legacy'
        ? resolveHomePose(viewer, shell.flags)
        : {
            ...pose,
            alt:
              id === 'global' && innerWidth < MOBILE_GLOBAL_WIDTH
                ? MOBILE_GLOBAL_ALT
                : pose.alt,
          };
    // Sin «CAMPO»: el nombre del sector era una lectura estática que dejaba
    // de ser cierta al primer gesto (fase visual T3, V-05).
    camera(target, { targetId: `sector:${id}` });
  }
  return { camera, sector };
}

function returnHome(shell, trigger) {
  // Home vuelve a la vista del globo. No apaga capas ni suelta el
  // seguimiento: sólo deja de inspeccionar un objetivo concreto.
  shell.state.selection = null;
  // Home no reabre la ficha de la vista: sin objetivo no hay dock (D1-A).
  shell.state.viewRequested = false;
  shell.publishDossier({
    type: 'select',
    context: shell.currentViewContext(),
    explicit: true,
  });
  shell.openView('explore', trigger);
  shell.sector('global');
  trigger?.focus?.({ preventScroll: true });
}

/**
 * Instrumentos de cámara en el orden del riel: Home, marca, Norte y zoom.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountCameraInstruments(shell) {
  const { lifetime, styleManager } = shell;
  lifetime.listen($('eye-home'), 'click', (event) =>
    returnHome(shell, event.currentTarget),
  );
  lifetime.listen(
    document.querySelector('.eye-orbit-brand'),
    'click',
    (event) => {
      event.preventDefault();
      returnHome(shell, event.currentTarget);
    },
  );
  lifetime.listen($('eye-north'), 'click', () => shell.runNorth());
  // T5: con el carril compacto (zoom 200 % en el teléfono) Norte, Retícula y
  // Limpia viven en «Más»; su botón pulsa EL MISMO control del carril.
  lifetime.listen(document, 'click', (event) => {
    const proxy = event.target.closest?.('[data-eye-instrument-proxy]');
    if (!proxy) return;
    shell.closePanel();
    $(proxy.dataset.eyeInstrumentProxy)?.click();
  });
  for (const [id, factor] of ZOOM_FACTORS)
    lifetime.listen($(id), 'click', () => {
      const p = styleManager.getCameraState();
      shell.camera({
        ...p,
        alt: Math.max(MIN_ALT, Math.min(MAX_ALT, p.alt * factor)),
      });
    });
}
