/** Deterministic decorative decode; semantic labels remain in adjacent stable text. */
export function createDecorativeDecoder(
  element,
  {
    reducedMotion = () => false,
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (id) => clearTimeout(id),
  } = {},
) {
  let generation = 0;
  let timer = null;
  let target = element?.textContent || '';
  let destroyed = false;
  element?.setAttribute?.('aria-hidden', 'true');

  const binaryFrame = (text, frame) =>
    [...text]
      .map((character, index) => {
        if (/\s/.test(character)) return character;
        return index <= frame * Math.ceil(text.length / 4)
          ? character
          : (character.codePointAt(0) + index + frame) % 2
            ? '1'
            : '0';
      })
      .join('');

  const reveal = (text) => {
    if (destroyed || !element) return false;
    target = String(text || '');
    const own = ++generation;
    if (timer !== null) cancel(timer);
    if (reducedMotion()) {
      element.textContent = target;
      timer = null;
      return true;
    }
    let frame = 0;
    const tick = () => {
      if (destroyed || own !== generation) return;
      if (frame >= 4) {
        element.textContent = target;
        timer = null;
        return;
      }
      element.textContent = binaryFrame(target, frame);
      frame += 1;
      timer = schedule(tick, 34);
    };
    tick();
    return true;
  };

  return {
    reveal,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      if (timer !== null) cancel(timer);
      timer = null;
      if (element) element.textContent = target;
    },
  };
}
