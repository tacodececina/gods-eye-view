/**
 * Compartir vista pública, Guía de campo, paleta de acciones (Ctrl+K) y el
 * teclado global del shell (Ctrl+K y Escape).
 */
import { publicView } from '../operations.js';
import { $, node } from './shellDom.js';

const HELP_PARAGRAPHS = [
  'Arrastra el planeta para rotar. Usa la rueda o dos dedos para acercar. Los instrumentos permiten regresar al globo, orientar al norte y mostrar la retícula.',
  'Señales consulta USGS M2.5+ / 24 h. Selecciona un evento para ver fecha, ubicación, profundidad y procedencia. Las magnitudes y ubicaciones pueden revisarse.',
  'Operación guarda la cámara, capas, filtros, selección y notas en este navegador. No vigila cuando la pestaña está cerrada. Borrar datos del navegador elimina las operaciones.',
  'Teclado: Tab recorre controles; Enter activa; Escape cierra paneles y diálogos; Ctrl+K abre acciones. Los modos térmico y nocturno son filtros visuales.',
];
const HELP_LINKS = [
  [
    'Código upstream: Bilawal Sidhu · MIT',
    'https://github.com/bilawalsidhu/gods-eye-view',
  ],
  ['CesiumJS · Apache 2.0', 'https://cesium.com/'],
  [
    'Natural Earth · dominio público',
    'https://www.naturalearthdata.com/about/terms-of-use/',
  ],
  [
    'Datos sísmicos · U.S. Geological Survey',
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
  ],
];

function shareContent(shell, url) {
  return (host) => {
    const label = node('label', 'Enlace público');
    const field = node('textarea');
    field.readOnly = true;
    field.value = url.href;
    field.rows = 4;
    label.append(field);
    host.append(label);
    const button = node('button', 'Copiar enlace');
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url.href);
        button.textContent = 'Enlace copiado';
      } catch {
        field.select();
        shell.notice('Selecciona y copia el enlace con Ctrl+C.');
      }
    };
    host.append(button);
  };
}

function helpContent(host) {
  for (const text of HELP_PARAGRAPHS) host.append(node('p', text));
  for (const [label, url] of HELP_LINKS) {
    const p = node('p'),
      a = node('a', label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    p.append(a);
    host.append(p);
  }
}

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} share y help.
 */
export function createShareHelp(shell) {
  async function share() {
    const payload = publicView(shell.readView());
    const url = new URL(location.href);
    url.search = '';
    url.hash = 'eye=' + encodeURIComponent(JSON.stringify(payload));
    await shell.dialog('Compartir vista pública', {
      text: 'El enlace contiene cámara, capas, filtros e ID del evento. No incluye el nombre de la operación ni sus notas privadas.',
      content: shareContent(shell, url),
    });
  }
  const help = () =>
    shell.dialog('EYEINSKY / Guía de campo', { content: helpContent });
  return { share, help };
}

function commandActions(shell) {
  const { openView } = shell;
  return [
    ['Explorar el globo', () => shell.sector('global')],
    ['Ver señales USGS', () => openView('signals')],
    ['Guardar una operación', () => openView('operations')],
    ['Catálogo de fuentes', () => openView('catalog')],
    ['Apariencia y destinos', () => openView('display')],
    ['Director de escenas', () => openView('director')],
    ['Cámaras y radio', () => openView('sensors')],
    ['Voz y preferencias', () => openView('preferences')],
    ['Compartir vista pública', shell.share],
    ['Apagar todas las capas', () => shell.styleManager.clearSelectedLayers()],
    ['Ayuda y créditos', shell.help],
  ];
}

function handleEscape(shell) {
  const { state, styleManager } = shell;
  if (document.body.classList.contains('ui-clean-view')) {
    styleManager.toggleCleanView(false);
    $('clean-view-toggle')?.focus();
    return;
  }
  if (document.body.classList.contains('eye-clean')) shell.clean(false);
  else if (document.body.dataset.eyeInspecting === 'true') {
    shell.closeInspector();
    if (state.activeView === 'signals') shell.setSurface('eye-workspace', true);
  } else shell.closePanel();
}

/**
 * Compartir, Ayuda, paleta de acciones y teclado global, en ese orden.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountCommands(shell) {
  const { lifetime } = shell;
  lifetime.listen($('eye-share'), 'click', () => void shell.share());
  lifetime.listen($('eye-help'), 'click', () => void shell.help());
  lifetime.listen($('eye-more-help'), 'click', () => void shell.help());
  const actions = commandActions(shell);
  function commands() {
    const q = $('eye-command-search').value.toLocaleLowerCase('es');
    $('eye-command-list').replaceChildren();
    actions.forEach(([label], index) => {
      if (!label.toLocaleLowerCase('es').includes(q)) return;
      const b = node('button', label);
      b.dataset.eyeAction = String(index);
      $('eye-command-list').append(b);
    });
    if (!$('eye-command-list').children.length)
      $('eye-command-list').append(node('p', 'Sin acciones coincidentes.'));
  }
  let commandTrigger;
  function openCommands() {
    commandTrigger = document.activeElement;
    $('eye-command-search').value = '';
    commands();
    $('eye-commands').showModal();
    $('eye-command-search').focus();
  }
  lifetime.listen($('eye-command-open'), 'click', openCommands);
  lifetime.listen($('eye-command-search'), 'input', commands);
  lifetime.listen($('eye-commands'), 'close', () => commandTrigger?.focus?.());
  lifetime.listen($('eye-command-list'), 'click', (event) => {
    const b = event.target.closest('[data-eye-action]');
    if (!b) return;
    $('eye-commands').close();
    void actions[Number(b.dataset.eyeAction)]?.[1]();
  });
  lifetime.listen(document, 'keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommands();
      return;
    }
    if (event.key === 'Escape' && !document.querySelector('dialog[open]'))
      handleEscape(shell);
  });
}
