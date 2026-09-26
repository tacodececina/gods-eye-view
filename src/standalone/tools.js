import { createAssetDirectorySource } from '../director/packs/source.js';
import { createApplicationTools } from '../app/tools.js';
import { startStandaloneChrome } from './startupChrome.js';
import { mountEyeinsky } from '../ui/eyeinskyShell.js';
import {
  readGlobeFlags,
  scopeAppearanceForSkin,
} from '../ui/eyeinskyGlobeFlags.js';
export function createStandaloneTools(options) {
  const tools = createApplicationTools({
    startChrome: startStandaloneChrome,
    scopeAppearance: scopeAppearanceForSkin(
      readGlobeFlags(location.search).skin,
    ),
    sceneDataPacks: {
      sources: {
        assets: createAssetDirectorySource({
          baseUrl: new URL('/scene-assets/', window.location.href).href,
        }),
      },
    },
    ...options,
  });
  const eyeinsky = mountEyeinsky({ ...options, tools });
  return { ...tools, eyeinsky };
}
