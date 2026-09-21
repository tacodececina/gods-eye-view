import { startApplicationChrome } from '../app/startupChrome.js';
import { initKeySetup } from '../keySetup.js';
export function startStandaloneChrome(options) {
  return startApplicationChrome({
    initializeWelcome: null,
    initializeSettings: import.meta.env?.VITE_LOCAL_PROVIDER_RUNTIME
      ? initKeySetup
      : null,
    ...options,
  });
}
