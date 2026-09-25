/**
 * Banda rotulada del modo didáctico (P5 T6): visible solo con la Luna
 * encendida en escala didáctica. `aria-live="polite"` anuncia el cambio.
 */
export function createScaleBand(documentRef = globalThis.document) {
  if (!documentRef?.createElement) return { show() {}, hide() {}, remove() {} };
  const band = documentRef.createElement('div');
  band.dataset.eyeMoonScaleBand = '';
  band.className = 'eye-moon-scale-band';
  band.setAttribute('role', 'status');
  band.setAttribute('aria-live', 'polite');
  band.hidden = true;
  documentRef.body.append(band);
  return {
    show(text) {
      band.textContent = text;
      band.hidden = false;
    },
    hide() {
      band.hidden = true;
    },
    remove() {
      band.remove();
    },
  };
}
