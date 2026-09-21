/**
 * Manifiesto de medios admitidos para el expediente (EYEINSKY P3).
 *
 * Copia declarativa de `output/eyeinsky-p3/t0/assets/asset-manifest.json`, que
 * el supervisor midió sobre los archivos reales (bytes, dimensiones y SHA-256).
 * Aquí NO se generan imágenes ni se amplía el permiso:
 *
 *   - las dos fotografías son de archivo de la NASA y su permiso son las NASA
 *     Media Usage Guidelines: uso factual/editorial CON crédito. Eso no es CC0
 *     ni una licencia comercial universal, y así queda escrito en `license` y
 *     `permissionScope`;
 *   - `contextKey` las ata a `earth:view`. Una foto de la Tierra no puede
 *     ofrecerse como imagen de un vuelo, un sismo o una cámara;
 *   - `fidelity: 'contextual'` y `archive: true` declaran que ilustran, no que
 *     documenten el instante que muestra el globo.
 *
 * Procedencia y términos revisados: `docs/eyeinsky/p3/ASSET-LEDGER.md`.
 */

/** @type {ReadonlyArray<Readonly<object>>} Activos admitidos, congelados. */
export const EYE_MEDIA_MANIFEST = Object.freeze([
  Object.freeze({
    id: 'earth-apollo17',
    title: 'Tierra desde Apollo 17',
    author: 'NASA / tripulación de Apollo 17',
    credit: 'NASA',
    sourceUrl:
      'https://www.nasa.gov/image-article/blue-marble-image-of-earth-from-apollo-17/',
    alt: 'Fotografía de archivo de la Tierra desde Apollo 17; África y el polo sur visibles.',
    contextKey: 'earth:view',
    fidelity: 'contextual',
    archive: true,
    src: '/eyeinsky/media/p3/earth-apollo17.webp',
    license:
      'NASA Media Usage Guidelines — uso factual/editorial con crédito; sin patrocinio',
    licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    permissionScope:
      'Información contextual en el expediente. No anuncio, merchandise, logotipo, persona identificable o promoción. No licencia comercial universal.',
    width: 1041,
    height: 1042,
    bytes: 165418,
    sha256: 'c826b987a985c0fe599848b47cf08527cdd875b0943b40c38736d6975fb87202',
  }),
  Object.freeze({
    id: 'earth-apollo8',
    title: 'Earthrise · Apollo 8',
    author: 'NASA / Bill Anders',
    credit: 'NASA / Bill Anders',
    sourceUrl: 'https://www.nasa.gov/image-article/apollo-8-earthrise/',
    alt: 'Fotografía de archivo de la Tierra sobre el horizonte lunar, tomada desde Apollo 8.',
    contextKey: 'earth:view',
    fidelity: 'contextual',
    archive: true,
    src: '/eyeinsky/media/p3/earth-apollo8.webp',
    license:
      'NASA Media Usage Guidelines — uso factual/editorial con crédito; sin patrocinio',
    licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    permissionScope:
      'Información contextual en el expediente. No anuncio, merchandise, logotipo, persona identificable o promoción. No licencia comercial universal.',
    width: 1041,
    height: 1000,
    bytes: 43338,
    sha256: '62ff2a4f58525ad6a61f2865854cebf63c661823d1502d58824cb1fc8f13d098',
  }),
]);

/**
 * Activos admitidos para una identidad de contexto.
 * @param {string} contextKey Identidad del expediente.
 * @returns {ReadonlyArray<Readonly<object>>} Activos atados a ese contexto.
 */
export function mediaForContext(contextKey) {
  return Object.freeze(
    EYE_MEDIA_MANIFEST.filter((asset) => asset.contextKey === contextKey),
  );
}

/**
 * @param {string} id Identidad del activo.
 * @returns {Readonly<object>|null} Activo, o null si no está en el manifiesto.
 */
export function mediaById(id) {
  return EYE_MEDIA_MANIFEST.find((asset) => asset.id === id) ?? null;
}
