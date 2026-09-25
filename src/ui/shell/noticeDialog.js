/** Aviso efímero (#eye-notice) y diálogo modal (#eye-dialog) del shell. */
import { $, node } from './shellDom.js';

const NOTICE_MS = 7000;

/**
 * @param {object} deps
 * @param {import('../uiLifetime.js').UiLifetime} deps.lifetime Dueño de timers.
 * @returns {(message: string, options?: object) => void} Publicador del aviso.
 */
export function createNotice({ lifetime }) {
  let noticeTimer = null;
  return (message, { actionLabel, action, focusAfter } = {}) => {
    const host = $('eye-notice');
    host.replaceChildren(node('span', message));
    if (actionLabel && action) {
      const button = node('button', actionLabel);
      button.addEventListener(
        'click',
        async () => {
          button.disabled = true;
          await action();
          host.hidden = true;
          focusAfter?.focus?.({ preventScroll: true });
        },
        { once: true },
      );
      host.append(button);
    }
    host.hidden = false;
    lifetime.cancelTimeout(noticeTimer);
    noticeTimer = lifetime.timeout(
      () => ($('eye-notice').hidden = true),
      NOTICE_MS,
    );
  };
}

function fillDialogBody({ text, input, label, content }) {
  $('eye-dialog-body').replaceChildren();
  if (text) $('eye-dialog-body').append(node('p', text));
  let field;
  if (input !== undefined) {
    const wrapper = node('label', label);
    field = node('input');
    field.value = input;
    field.maxLength = 80;
    wrapper.append(field);
    $('eye-dialog-body').append(wrapper);
  }
  content?.($('eye-dialog-body'));
  return field;
}

/**
 * Monta el ciclo de vida del diálogo y devuelve la función que lo abre.
 * @param {object} deps
 * @param {import('../uiLifetime.js').UiLifetime} deps.lifetime Dueño de listeners.
 * @param {(dispose: () => void) => void} deps.defer Registro de limpieza.
 * @returns {(title: string, options?: object) => Promise<object>} Abridor.
 */
export function mountDialog({ lifetime, defer }) {
  let dialogResolve = null;
  function dialog(
    title,
    { text = '', input, label = 'Texto', confirm = null, content } = {},
  ) {
    if (dialogResolve) {
      dialogResolve({ confirmed: false });
      dialogResolve = null;
    }
    const el = $('eye-dialog'),
      trigger = document.activeElement;
    el.close();
    $('eye-dialog-title').textContent = title;
    const field = fillDialogBody({ text, input, label, content });
    $('eye-dialog-confirm').hidden = !confirm;
    $('eye-dialog-confirm').textContent = confirm || '';
    $('eye-dialog-cancel').textContent = confirm ? 'Cancelar' : 'Cerrar';
    el.returnValue = '';
    el.showModal();
    (field || $('eye-dialog-cancel')).focus();
    return new Promise((resolve) => {
      dialogResolve = (result) => {
        const target =
          trigger?.isConnected && trigger.getClientRects().length
            ? trigger
            : $('eye-command-open');
        target.focus({ preventScroll: true });
        resolve(result);
      };
      el._eyeField = field;
    });
  }
  lifetime.listen($('eye-dialog'), 'close', () => {
    const resolve = dialogResolve;
    dialogResolve = null;
    resolve?.({
      confirmed: $('eye-dialog').returnValue === 'confirm',
      value: $('eye-dialog')._eyeField?.value,
    });
  });
  defer(() => {
    dialogResolve?.({ confirmed: false });
    $('eye-dialog').close();
    $('eye-commands').close();
  });
  return dialog;
}
