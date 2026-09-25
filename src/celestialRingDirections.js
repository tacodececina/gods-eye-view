import * as Cesium from 'cesium';

/**
 * Direcciones del anillo celeste a partir del estado celeste COMÚN (P5 T7):
 * el anillo no recalcula efemérides, lee el mismo estado que la Luna 3D para
 * el mismo `frameState.time`. Sin marco no hay nada que dibujar; una Luna
 * ausente oculta solo su marcador.
 * @returns {{status: 'ok'|'unavailable', moon: string, moonSource: string|null}}
 */
export function readRingDirections(state, sunOut, moonOut) {
  if (state?.sun !== 'ok')
    return { status: 'unavailable', moon: 'unavailable', moonSource: null };
  Cesium.Cartesian3.normalize(state.sunFixedM, sunOut);
  if (state.moon !== 'ok')
    return {
      status: 'ok',
      moon: state.moon ?? 'unavailable',
      moonSource: null,
    };
  Cesium.Cartesian3.normalize(state.moonFixedM, moonOut);
  return { status: 'ok', moon: 'ok', moonSource: state.source };
}
