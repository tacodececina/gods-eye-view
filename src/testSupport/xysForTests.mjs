import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as Cesium from 'cesium';

/**
 * SOLO TESTS. Precarga real de IAU2006 XYS en Node: sustituye el transporte
 * de Resource por lecturas de los JSON que trae @cesium/engine (Node no tiene
 * XMLHttpRequest). El cálculo es el de Cesium. Devuelve la restauración.
 */
export function installNodeXys() {
  const require = createRequire(import.meta.url);
  const dir = path.join(
    path.dirname(require.resolve('@cesium/engine/package.json')),
    'Source/Assets/IAU2006_XYS',
  );
  const originalLoad = Cesium.Resource._Implementations.loadWithXhr;
  const originalXys = Cesium.Transforms.iau2006XysData;
  Cesium.Resource._Implementations.loadWithXhr = (url, ...rest) => {
    const deferred = rest[4];
    const chunk = /IAU2006_XYS_(\d+)\.json/.exec(url);
    if (!chunk) return deferred.reject(new Error(`URL inesperada ${url}`));
    deferred.resolve(
      readFileSync(path.join(dir, `IAU2006_XYS_${chunk[1]}.json`), 'utf8'),
    );
  };
  Cesium.Transforms.iau2006XysData = new Cesium.Iau2006XysData({
    xysFileUrlTemplate: 'https://xys.invalid/IAU2006_XYS_{0}.json',
  });
  return () => {
    Cesium.Resource._Implementations.loadWithXhr = originalLoad;
    Cesium.Transforms.iau2006XysData = originalXys;
  };
}

/** SOLO TESTS. Tabla DE441 del repo, cargada y verificada sin red. */
export async function loadRepoMoonTable() {
  const { loadMoonEphemeris } = await import('../layers/moon/ephemeris.js');
  const bin = readFileSync(
    new URL('../../public/data/moon-de441-2021-2040.bin', import.meta.url),
  );
  const bytes = bin.buffer.slice(
    bin.byteOffset,
    bin.byteOffset + bin.byteLength,
  );
  return loadMoonEphemeris('fixture', {
    fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }),
  });
}
