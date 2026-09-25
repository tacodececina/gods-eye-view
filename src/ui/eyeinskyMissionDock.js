/**
 * Superficie del Mission Dock (EYEINSKY P3.1).
 *
 * Barra contextual inferior que sustituye al expediente lateral. Pinta lo que
 * `eyeinskyMissionDockModel.js` compone; no decide selección, no mueve la cámara
 * y no pide datos: cada acción se delega al shell, que ya es el dueño de cámara,
 * operaciones y capas.
 *
 * Todo el texto entra por `textContent`; en esta ruta no hay `innerHTML`, así
 * que un nombre de lugar con `<` es un nombre, nunca markup.
 *
 * Accesibilidad:
 *   - los paneles son una pestañera real (`tablist`/`tab`/`tabpanel`) con
 *     navegación por flechas, Inicio y Fin,
 *   - una acción imposible se pinta `disabled` con su motivo en `title` y en el
 *     nombre accesible, en vez de desaparecer sin explicación; el de
 *     INSPECCIONAR además se lee como texto bajo el riel (`aria-describedby`),
 *     porque un `title` no lo alcanzan ni el tacto ni muchos lectores,
 *   - el estado de cámara es un `status`: cambia solo y hay que poder oírlo,
 *   - Escape repliega el dock y devuelve el foco a quien lo desplegó.
 */
import { activityAgeLabel } from './eyeinskyActivity.js';

/** Cómo se dice cada estado de frescura, sin eufemismos. */
export const MISSION_DOCK_STATUS_LABELS = Object.freeze({
  ready: 'Observación reciente',
  stale: 'Observación antigua',
  missing: 'Ya no se observa',
  unreported: 'La fuente no informa la hora',
  // P4: posición calculada con SGP4 desde elementos publicados, no observada.
  predicted: 'Posición calculada (SGP4)',
  // P4-20: SGP4 no dio posición; no se muestra la última pose como válida.
  'propagation-failed': 'Propagación falló (SGP4): sin posición',
  // P5: la Luna sale de una efeméride calculada (DE441), no de una observación.
  computed: 'Posición calculada (efeméride, no observada)',
});
const STATUS_LABELS = MISSION_DOCK_STATUS_LABELS;

/**
 * @param {Document} doc Documento.
 * @param {string} tag Etiqueta.
 * @param {string} [text] Texto.
 * @param {string} [className] Clase.
 * @returns {HTMLElement} Nodo.
 */
function node(doc, tag, text = '', className = '') {
  const element = doc.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

/**
 * Monta el Mission Dock sobre su contenedor.
 *
 * @param {object} options Montaje.
 * @param {HTMLElement} options.host Sección del dock.
 * @param {(action:{type:string, contextKey:string}) => void} [options.onAction] Acciones.
 * @param {(pane:string) => void} [options.onPane] Cambio de panel.
 * @param {(expanded:boolean) => void} [options.onToggle] Despliegue.
 * @param {() => void} [options.onClose] Cierre explícito.
 * @param {AbortSignal} [options.signal] Señal de desmontaje.
 * @returns {object} Control del dock.
 */
export function mountEyeMissionDock({
  host,
  onAction,
  onPane,
  onToggle,
  onClose,
  signal,
} = {}) {
  if (!host) throw new TypeError('mountEyeMissionDock requiere un host');
  const doc = host.ownerDocument;
  let destroyed = false;
  let lastSignature = null;
  let expandTrigger = null;
  let currentView = null;

  // P5 T8: cabecera fija del dock. La tira TIEMPO y las acciones de la Luna
  // las pinta eyeinskyEarthMoon; el dock solo les da sitio estable (no se
  // repinta con cada objetivo).
  const header = node(doc, 'div', '', 'eye-dock-header');
  const timeHost = node(doc, 'div', '', 'eye-dock-time');
  const moonHost = node(doc, 'div', '', 'eye-dock-moon');
  header.append(timeHost, moonHost);

  const rail = node(doc, 'div', '', 'eye-dock-rail');

  const identity = node(doc, 'div', '', 'eye-dock-identity');
  const kicker = node(doc, 'span', '', 'eye-kicker eye-dock-kicker');
  const title = node(doc, 'h2', '', 'eye-dock-title');
  title.id = 'eye-mission-dock-title';
  const statusLine = node(doc, 'p', '', 'eye-dock-status');
  identity.append(kicker, title, statusLine);

  // Estado de cámara: cambia por una acción física (rueda, arrastre) que no
  // pasa por ningún control, así que se anuncia.
  const cameraLine = node(doc, 'p', '', 'eye-dock-camera');
  cameraLine.setAttribute('role', 'status');
  const cameraBadge = node(doc, 'b', '', 'eye-dock-camera-badge');
  const cameraDetail = node(doc, 'span', '', 'eye-dock-camera-detail');
  cameraLine.append(cameraBadge, cameraDetail);

  const keyValues = node(doc, 'dl', '', 'eye-dock-keyvalues');

  // La brújula es un control, no un dibujo: se pulsa, se tabula y ejecuta la
  // acción Norte del shell.
  const compass = node(doc, 'button', '', 'eye-dock-compass');
  compass.type = 'button';
  compass.dataset.eyeDockAction = 'north';
  const compassNeedle = node(doc, 'span', '▲', 'eye-dock-needle');
  compassNeedle.setAttribute('aria-hidden', 'true');
  const compassText = node(doc, 'span', '', 'eye-dock-heading-text');
  compass.append(compassNeedle, compassText);

  const actions = node(doc, 'div', '', 'eye-dock-actions');
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', 'Acciones sobre el objetivo');

  // Motivo visible de la acción deshabilitada (P4 T7): texto real, no tooltip.
  const actionReason = node(doc, 'p', '', 'eye-dock-action-reason');
  actionReason.id = 'eye-dock-action-reason';
  actionReason.hidden = true;

  const close = node(doc, 'button', '×', 'eye-dock-close');
  close.type = 'button';
  close.id = 'eye-mission-dock-close';
  close.setAttribute('aria-label', 'Cerrar el panel de misión');

  rail.append(
    identity,
    cameraLine,
    keyValues,
    compass,
    actions,
    close,
    actionReason,
  );

  const tabs = node(doc, 'div', '', 'eye-dock-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Paneles del objetivo');

  const body = node(doc, 'div', '', 'eye-dock-body');
  const panels = new Map();
  for (const id of ['objetivo', 'medios', 'ops']) {
    const panel = node(doc, 'div', '', `eye-dock-panel eye-dock-panel-${id}`);
    panel.id = `eye-dock-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `eye-dock-tab-${id}`);
    panel.tabIndex = 0;
    panel.hidden = true;
    panels.set(id, panel);
    body.append(panel);
  }

  host.replaceChildren(header, rail, tabs, body);

  // El dock publica la FRANJA que ocupa desde el borde inferior de la ventana,
  // no sólo su altura: también está separado del borde, y quien se aparta por
  // encima necesita el total. Con la altura sola la telemetría quedaba 5 px
  // dentro del dock (medido en p31-02). Un margen fijo tampoco vale: la franja
  // cambia al desplegar.
  const publishBand = () => {
    const view = doc.defaultView;
    const band =
      host.hidden || !view
        ? 0
        : Math.max(
            0,
            Math.round(view.innerHeight - host.getBoundingClientRect().top),
          );
    doc.documentElement.style.setProperty('--eye-dock-band', `${band}px`);
  };
  const sizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(publishBand)
      : null;
  sizeObserver?.observe(host);
  publishBand();

  const emit = (type) =>
    onAction?.({ type, contextKey: currentView?.contextKey || '' });

  const handleHostClick = (event) => {
    const closeButton = event.target.closest?.('.eye-dock-close');
    if (closeButton && host.contains(closeButton)) {
      onClose?.();
      return;
    }
    const tab = event.target.closest?.('[data-eye-dock-pane]');
    if (tab && host.contains(tab)) {
      onPane?.(tab.dataset.eyeDockPane);
      return;
    }
    const button = event.target.closest?.('[data-eye-dock-action]');
    if (!button || !host.contains(button) || button.disabled) return;
    const type = button.dataset.eyeDockAction;
    // MÁS es el único control que el dock resuelve por su cuenta: despliega o
    // repliega su propio cuerpo. El resto son del shell.
    if (type === 'more') {
      expandTrigger = button;
      onToggle?.(!currentView?.expanded);
      return;
    }
    emit(type);
  };
  host.addEventListener('click', handleHostClick);

  // Pestañera real: flechas recorren, Inicio y Fin saltan a los extremos.
  const handleTabsKeydown = (event) => {
    const order = currentView?.panes?.map(({ id }) => id) ?? [];
    if (order.length === 0) return;
    const index = order.indexOf(currentView.pane);
    let next = null;
    if (event.key === 'ArrowRight') next = order[(index + 1) % order.length];
    else if (event.key === 'ArrowLeft')
      next = order[(index - 1 + order.length) % order.length];
    else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order.at(-1);
    if (next === null) return;
    event.preventDefault();
    onPane?.(next);
  };
  tabs.addEventListener('keydown', handleTabsKeydown);

  const handleHostKeydown = (event) => {
    if (event.key !== 'Escape' || !currentView?.expanded) return;
    event.stopPropagation();
    onToggle?.(false);
    // El foco vuelve a quien desplegó, no al principio del documento.
    const target =
      expandTrigger?.isConnected && expandTrigger.getClientRects().length
        ? expandTrigger
        : close;
    target.focus?.({ preventScroll: true });
  };
  host.addEventListener('keydown', handleHostKeydown);

  /**
   * Firma barata de lo visible: evita repintar (y por tanto mover el foco)
   * cuando un refresh no cambió nada de lo que se ve.
   * @param {object} view Vista del dock.
   * @returns {string} Firma.
   */
  const signatureOf = (view) =>
    JSON.stringify([
      view.visible,
      view.expanded,
      view.contextKey,
      view.layerId,
      view.generation,
      view.title,
      view.status,
      view.observedAt,
      view.localUpdatedAt,
      view.keyValues,
      view.pane,
      view.panes,
      view.camera,
      view.actions,
      view.actionReason,
    ]);

  const renderTabs = (view) => {
    // Repintar la pestañera destruye el nodo enfocado y el foco cae al body, de
    // modo que la siguiente tecla (Escape) ya no llega al dock (medido en
    // p31-06). Se recuerda si el foco estaba aquí para devolverlo a la pestaña
    // que quedó seleccionada — nunca se roba si estaba en otro sitio.
    const hadFocus = tabs.contains(doc.activeElement);
    tabs.replaceChildren();
    for (const pane of view.panes) {
      const selected = pane.id === view.pane;
      const tab = node(doc, 'button', '', 'eye-dock-tab');
      tab.type = 'button';
      tab.id = `eye-dock-tab-${pane.id}`;
      tab.dataset.eyeDockPane = pane.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('aria-controls', `eye-dock-panel-${pane.id}`);
      // Sólo la pestaña activa está en el orden de tabulación; las flechas
      // recorren el resto, como manda el patrón.
      tab.tabIndex = selected ? 0 : -1;
      tab.append(node(doc, 'span', pane.label, 'eye-dock-tab-label'));
      if (pane.badge) {
        const badge = node(
          doc,
          'i',
          String(pane.badge.count),
          'eye-dock-tab-badge',
        );
        badge.dataset.badgeKind = pane.badge.kind;
        // La insignia es un número sin palabra: su significado va al nombre
        // accesible de la pestaña, no a un color.
        tab.setAttribute(
          'aria-label',
          pane.badge.kind === 'loading'
            ? `${pane.label}, ${pane.badge.count} en curso`
            : `${pane.label}, ${pane.badge.count} con fallo`,
        );
        tab.append(badge);
      } else tab.removeAttribute('aria-label');
      tabs.append(tab);
    }
    if (hadFocus)
      tabs
        .querySelector('[aria-selected="true"]')
        ?.focus?.({ preventScroll: true });
    for (const [id, panel] of panels)
      panel.hidden = !(view.expanded && id === view.pane);
  };

  const renderActions = (view) => {
    actions.replaceChildren();
    for (const item of view.actions) {
      const button = node(doc, 'button', item.label, 'eye-dock-action');
      button.type = 'button';
      button.dataset.eyeDockAction = item.id;
      button.disabled = !item.enabled;
      button.title = item.hint;
      const described = view.actionReason?.actionId === item.id;
      // Un botón deshabilitado no se lee solo: el motivo entra en su nombre,
      // o en su descripción cuando además se pinta como texto bajo el riel.
      if (described) {
        button.setAttribute('aria-label', item.label);
        button.setAttribute('aria-describedby', actionReason.id);
      } else button.setAttribute('aria-label', `${item.label}. ${item.hint}`);
      if (item.id === 'follow')
        button.setAttribute('aria-pressed', String(item.pressed));
      if (item.id === 'more') {
        button.setAttribute('aria-expanded', String(view.expanded));
        button.setAttribute('aria-controls', `eye-dock-panel-${view.pane}`);
        button.textContent = view.expanded ? 'Menos' : 'Más';
      }
      actions.append(button);
    }
    actionReason.textContent = view.actionReason?.text ?? '';
    actionReason.hidden = !view.actionReason;
  };

  const control = {
    /**
     * @param {object} view Vista compuesta del dock.
     * @returns {void}
     */
    update(view) {
      if (destroyed || !view) return;
      const signature = signatureOf(view);
      if (signature === lastSignature) return;
      lastSignature = signature;
      currentView = view;

      // La visibilidad la abre y cierra el shell con su motor de movimiento
      // (`setSurface`), que es quien sabe animar la entrada y la salida. Aquí
      // sólo se publica el hecho para que las pruebas y el CSS lo lean.
      host.dataset.visible = String(view.visible);
      host.dataset.contextKey = view.contextKey || '';
      host.dataset.contextKind = view.contextKind || '';
      host.dataset.contextLayer = view.layerId || '';
      host.dataset.expanded = String(view.expanded);
      host.dataset.cameraStatus = view.camera.id;

      kicker.textContent = view.kicker;
      title.textContent = view.title ?? '';

      const age =
        view.observedAt !== null
          ? activityAgeLabel(view.observedAt)
          : view.localUpdatedAt !== null
            ? `registrado ${activityAgeLabel(view.localUpdatedAt)}`
            : null;
      const statusText = STATUS_LABELS[view.status] || STATUS_LABELS.unreported;
      statusLine.textContent = age ? `${statusText} · ${age}` : statusText;
      statusLine.dataset.status = view.status || 'unreported';

      cameraBadge.textContent = view.camera.label;
      cameraDetail.textContent = view.camera.detail;

      keyValues.replaceChildren();
      for (const field of view.keyValues) {
        const item = node(doc, 'div', '', 'eye-dock-keyvalue');
        item.append(node(doc, 'dt', field.label));
        item.append(
          node(
            doc,
            'dd',
            field.unit ? `${field.value} ${field.unit}` : field.value,
          ),
        );
        keyValues.append(item);
      }
      keyValues.hidden = view.keyValues.length === 0;

      renderActions(view);
      renderTabs(view);
      publishBand();
    },
    /**
     * Brújula viva: refleja el rumbo real de la cámara y ofrece su alternativa
     * textual. Sin rumbo medido no se dibuja una aguja inventada.
     * @param {number|null} headingDeg Rumbo en grados.
     * @returns {void}
     */
    setHeading(headingDeg) {
      if (destroyed) return;
      if (!Number.isFinite(headingDeg)) {
        compass.hidden = true;
        compass.removeAttribute('aria-label');
        compassText.textContent = '';
        return;
      }
      const degrees = ((headingDeg % 360) + 360) % 360;
      const rounded = Math.round(degrees);
      compass.hidden = false;
      compassNeedle.style.transform = `rotate(${degrees.toFixed(1)}deg)`;
      compass.setAttribute(
        'aria-label',
        `Rumbo ${rounded} grados. Orientar al norte`,
      );
      compass.title = `Rumbo ${rounded}° · orientar al norte`;
      compassText.textContent = `${rounded}°`;
      compass.dataset.heading = String(rounded);
    },
    /** @returns {HTMLElement} Sitio de la tira TIEMPO (P5 T8). */
    getTimeHost: () => timeHost,
    /** @returns {HTMLElement} Sitio de las acciones de la Luna (P5 T8). */
    getMoonHost: () => moonHost,
    /** @returns {HTMLElement} Cuerpo del panel OBJETIVO. */
    getObjetivoHost: () => panels.get('objetivo'),
    /** @returns {HTMLElement} Cuerpo del panel MEDIOS. */
    getMediaHost: () => panels.get('medios'),
    /** @returns {HTMLElement} Cuerpo del panel OPS. */
    getOpsHost: () => panels.get('ops'),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sizeObserver?.disconnect();
      host.removeEventListener('click', handleHostClick);
      tabs.removeEventListener('keydown', handleTabsKeydown);
      host.removeEventListener('keydown', handleHostKeydown);
      signal?.removeEventListener('abort', handleAbort);
      doc.documentElement.style.removeProperty('--eye-dock-band');
      host.replaceChildren();
    },
  };

  const handleAbort = () => control.destroy();
  signal?.addEventListener('abort', handleAbort, { once: true });
  return control;
}
