/**
 * Cerrar el panel contextual (×) suelta el objetivo (reparación T5).
 *
 * × es una decisión de la persona: la capa dueña deja de seguirlo por su
 * verbo público (`stopTracking`, el mismo que usan la cabina y la voz), el
 * viewer queda sin entidad enganchada y, si la cámara la seguía, vuelve a
 * Global en lugar de quedarse pegada donde estaba el objetivo.
 */

/**
 * @param {{context?: {kind?: string, layerId?: string},
 *   layers?: Map<string, {module?: object}>,
 *   viewer?: {trackedEntity?: unknown},
 *   goGlobal?: () => void}} [input]
 * @returns {boolean} Si la cámara seguía al objetivo (y vuelve a Global).
 */
export function releaseDockTarget({ context, layers, viewer, goGlobal } = {}) {
  const following = Boolean(viewer?.trackedEntity);
  if (context?.kind === 'tracked' && context.layerId)
    layers?.get?.(context.layerId)?.module?.stopTracking?.({ origin: 'user' });
  if (viewer?.trackedEntity) viewer.trackedEntity = undefined;
  if (following) goGlobal?.();
  return following;
}
