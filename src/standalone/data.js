import { createApplicationData } from '../app/data.js';
import { getStandaloneCatalog } from './catalog.js';
export function createStandaloneData(options) {
  return createApplicationData({
    suspendWhenHidden: true,
    isHidden: () => document.hidden,
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
}
