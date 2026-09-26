/**
 * Monta el estado de revelación, la medida del pie y el titular de entrada
 * (fase visual T3) en el contexto del shell. El titular sigue al reloj de
 * escena (vivo, simulación o pausa) y, con objetivo, al objetivo (lo publica
 * applyDossier).
 */
import { getViewerSceneClock } from '../../time/sceneClock.js';
import { mountEyeReveal } from './reveal.js';
import { mountFootMetrics } from './footMetrics.js';
import { mountEyeStory } from './story.js';

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountRevealAndStory(shell) {
  const { viewer, flags, reduced, defer } = shell;
  const reveal = mountEyeReveal({ doc: document, reducedMotion: reduced });
  shell.reveal = reveal;
  defer(() => reveal.destroy());
  // El pie reserva el ancho real de la telemetría (reparación T5).
  const footMetrics = mountFootMetrics({ doc: document });
  defer(() => footMetrics.destroy());
  const host = document.querySelector('.eye-story');
  if (!host) return;
  const sceneClock = getViewerSceneClock(viewer);
  const story = mountEyeStory({
    host,
    getClock: () => sceneClock?.getState?.() ?? null,
    flags,
  });
  shell.story = story;
  const unsubscribe = sceneClock?.subscribe?.(() => story.render());
  defer(() => {
    unsubscribe?.();
    story.destroy();
    shell.story = null;
  });
}
