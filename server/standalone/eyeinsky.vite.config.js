import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { apiNotFoundPlugin } from './api-not-found.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Functional loopback runtime for development; production builds stay static. */
export default defineConfig(({ command, mode }) => {
  const localRuntime = command === 'serve';
  if (localRuntime) {
    const loaded = loadEnv(mode, root, '');
    for (const [key, value] of Object.entries(loaded)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  const base = createBrowserViteConfig({
    host: '127.0.0.1',
    port: 4197,
    plugins: [
      ...(localRuntime ? localProviderPlugins() : []),
      apiNotFoundPlugin(),
    ],
    googleApiKey: localRuntime ? process.env.GOOGLE_MAPS_API_KEY : undefined,
    cesiumToken: localRuntime ? process.env.CESIUM_ION_TOKEN : undefined,
  });
  return {
    ...base,
    envDir: false,
    define: {
      ...base.define,
      'import.meta.env.VITE_LOCAL_PROVIDER_RUNTIME':
        JSON.stringify(localRuntime),
    },
    optimizeDeps: {
      ...base.optimizeDeps,
      include: [...(base.optimizeDeps?.include || []), 'egm96-universal'],
    },
    server: { ...base.server, strictPort: true },
    preview: { host: '127.0.0.1', port: 4198, strictPort: true },
  };
});
