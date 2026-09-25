/**
 * Superficies de la Luna en el Mission Dock (P5 T8): el grupo de acciones
 * (con su motivo visible cuando no se pueden ejecutar) y la retícula de
 * tamaño fijo con su leyenda «RETÍCULA ≠ TAMAÑO». Solo pintan lo que decide
 * `eyeinskyMoonDockModel.js`; las órdenes van a `onAction`.
 */
import { RETICLE_LEGEND } from './eyeinskyMoonDockModel.js';

function node(doc, tag, className = '', text = '') {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/**
 * @param {{host: HTMLElement, onAction: (id: string) => void}} options
 */
export function mountEyeMoonActions({ host, onAction }) {
  if (!host) throw new TypeError('mountEyeMoonActions requiere un host');
  const doc = host.ownerDocument;
  const root = node(doc, 'div', 'eye-moon-actions');
  root.dataset.eyeMoonActions = '';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Acciones de la Luna');
  root.hidden = true;
  const buttons = node(doc, 'div', 'eye-moon-buttons');
  const reason = node(doc, 'p', 'eye-moon-reason');
  reason.id = 'eye-moon-reason';
  reason.hidden = true;
  const notice = node(doc, 'p', 'eye-moon-notice');
  notice.setAttribute('role', 'status');
  notice.dataset.eyeMoonNotice = '';
  root.append(buttons, reason, notice);
  host.replaceChildren(root);
  const click = (event) => {
    const button = event.target.closest?.('[data-eye-moon-action]');
    if (button && !button.disabled) onAction?.(button.dataset.eyeMoonAction);
  };
  root.addEventListener('click', click);
  let signature = '';
  const byId = new Map();
  return {
    update(actions, visible) {
      root.hidden = !visible;
      const next = JSON.stringify(actions);
      if (next === signature) return;
      signature = next;
      const disabled = actions.find(
        (item) => !item.enabled && item.id !== 'return-to-earth',
      );
      reason.textContent = disabled ? `No disponible: ${disabled.hint}` : '';
      reason.hidden = !disabled;
      syncButtons({ doc, buttons, byId, actions, reasonId: reason.id });
    },
    setNotice(text) {
      notice.textContent = text || '';
    },
    destroy() {
      root.removeEventListener('click', click);
      root.remove();
    },
  };
}

/**
 * Actualiza EN SU SITIO los botones (indexados por acción): recrearlos tiraba
 * el foco de teclado a <body> (WCAG 2.4.3). Solo se reordena si cambia el
 * conjunto; si el botón con foco se deshabilita, el foco pasa a otro vivo.
 */
function syncButtons({ doc, buttons, byId, actions, reasonId }) {
  const focused = doc.activeElement;
  const hadFocus = buttons.contains?.(focused) === true;
  const ordered = actions.map((item) => {
    const button = byId.get(item.id) ?? createActionButton(doc, item.id);
    byId.set(item.id, button);
    paintActionButton(button, item, reasonId);
    return button;
  });
  const same =
    ordered.length === buttons.children.length &&
    ordered.every((button, index) => buttons.children[index] === button);
  if (!same) buttons.replaceChildren(...ordered);
  for (const id of [...byId.keys()])
    if (!actions.some((item) => item.id === id)) byId.delete(id);
  // Chrome suelta el foco de un botón deshabilitado en el siguiente fotograma.
  const lost =
    !buttons.contains(doc.activeElement) || doc.activeElement.disabled;
  if (hadFocus && lost)
    ordered.find((button) => !button.disabled)?.focus({ preventScroll: true });
}

function createActionButton(doc, id) {
  const button = node(doc, 'button', 'eye-moon-action');
  button.type = 'button';
  button.dataset.eyeMoonAction = id;
  return button;
}

function paintActionButton(button, item, reasonId) {
  const doc = button.ownerDocument;
  button.replaceChildren(
    node(doc, 'span', 'eye-label-long', item.label),
    node(doc, 'span', 'eye-label-short', item.short),
  );
  button.disabled = !item.enabled;
  button.title = item.hint;
  button.setAttribute('aria-label', `${item.label}. ${item.hint}`);
  if (item.id === 'moon-scale')
    button.setAttribute('aria-pressed', String(item.pressed));
  if (item.enabled) button.removeAttribute('aria-describedby');
  else button.setAttribute('aria-describedby', reasonId);
}

/**
 * Retícula FIJA en px sobre la Luna (o flecha de borde si está fuera de
 * cuadro). El aro y su leyenda son decorativos (el panel OBJETIVO dice lo
 * mismo en texto); la flecha de borde se nombra: «Luna fuera de cuadro,
 * hacia la izquierda/derecha».
 * @param {Document} [doc]
 */
export function mountEyeMoonReticle(doc = globalThis.document) {
  if (!doc?.createElement) return { update() {}, destroy() {} };
  const root = node(doc, 'div', 'eye-moon-reticle');
  root.dataset.eyeMoonReticle = '';
  root.hidden = true;
  const ring = node(doc, 'span', 'eye-moon-reticle-ring');
  ring.setAttribute('aria-hidden', 'true');
  const arrow = node(doc, 'span', 'eye-moon-reticle-arrow', '▲');
  arrow.setAttribute('role', 'img');
  const legend = node(doc, 'span', 'eye-moon-reticle-legend', RETICLE_LEGEND);
  legend.setAttribute('aria-hidden', 'true');
  root.append(ring, arrow, legend);
  doc.body.append(root);
  let last = '';
  return {
    update(reticle) {
      const key = reticle
        ? `${reticle.mode}:${reticle.x}:${reticle.y}:${reticle.angleDeg}:${reticle.legendAlign}`
        : 'off';
      if (key === last) return;
      last = key;
      root.hidden = !reticle || reticle.mode === 'hidden';
      if (root.hidden) return;
      root.dataset.mode = reticle.mode;
      root.dataset.align = reticle.legendAlign ?? 'center';
      root.style.transform = `translate(${reticle.x}px, ${reticle.y}px)`;
      arrow.style.transform = `translate(-50%, -50%) rotate(${reticle.angleDeg}deg)`;
      if (reticle.label) arrow.setAttribute('aria-label', reticle.label);
      else arrow.removeAttribute('aria-label');
    },
    destroy() {
      root.remove();
    },
  };
}
