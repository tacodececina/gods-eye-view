/** Nepal evidence scene adapter; saved evidence shots stay untouched. */
export const nepalScenePresentation = {
  minimumHoldSec() {
    return 0;
  },
  resolveVisual(shot, visual, isMapStackAvailable) {
    const isNepalEvidenceShot = shot?.layers?.['bhote-koshi-2026']?.enabled;
    // A credential is not proof of a loaded tileset. Resolve actual capability at playback time.
    return isNepalEvidenceShot &&
      visual.mapStack === 'photoreal' &&
      !isMapStackAvailable('photoreal')
      ? { ...visual, mapStack: 'esri-imagery' }
      : visual;
  },
  cancelMotion() {},
};
