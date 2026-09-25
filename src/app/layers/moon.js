import { createMoonLayer } from '../../layers/moon/index.js';
import {
  registerDynamicCredit,
  unregisterDynamicCredit,
} from '../../data/dataCredits.js';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../../renderGovernor.js';

/**
 * Construct the P5 Moon layer (DE441 ephemeris, no live data) with the
 * application render governor and public asset base.
 */
export function createApplicationMoon({
  resolveAsset = (url) =>
    `${import.meta.env?.BASE_URL || '/'}${url.replace(/^\//, '')}`,
} = {}) {
  return createMoonLayer({
    render: {
      hold: holdContinuousRender,
      release: releaseContinuousRender,
      request: governorRequestRender,
    },
    resolveAsset,
    credits: {
      register: registerDynamicCredit,
      unregister: unregisterDynamicCredit,
    },
  });
}
