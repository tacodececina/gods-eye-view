const LICENSE_RESTRICTED = new Set(['telegeography-submarine-cables']);
const guide = (icon, description, coverage, access) =>
  Object.freeze({ icon, description, coverage, access });

/** Honest product copy for every current runtime layer; state remains DataManager-owned. */
export const EYE_LAYER_GUIDE = Object.freeze({
  'bhote-koshi-2026': guide(
    '≈',
    'Contexto de la inundación Bhote Koshi 2026 y medios asociados.',
    'Corredor del evento en Nepal; conjunto acotado, no vigilancia global.',
    'Vantor + GeoPera. Se abre desde su recorrido de contexto.',
  ),
  flights: guide(
    '✈',
    'Posiciones ADS-B de aeronaves civiles que la fuente logra observar.',
    'Cobertura global desigual; latencia, huecos y límites del proveedor.',
    'OpenSky Network; fuente pública, no registro aeronáutico oficial.',
  ),
  military: guide(
    '△',
    'Contactos ADS-B clasificados como militares por la fuente comunitaria.',
    'Sólo aeronaves que emiten y son recibidas; clasificación no autoritativa.',
    'adsb.lol; datos públicos comunitarios con disponibilidad variable.',
  ),
  earthquakes: guide(
    '◇',
    'Eventos sísmicos recientes con magnitud y profundidad.',
    'M2.5+ mundial en las últimas 24 horas dentro de esta experiencia.',
    'U.S. Geological Survey; valores preliminares sujetos a revisión.',
  ),
  'alpr-cameras': guide(
    '▣',
    'Ubicaciones comunitarias de cámaras asociadas a lectura de matrículas.',
    'Sólo puntos cartografiados; no entrega placas ni transmisión universal.',
    'OpenStreetMap, ODbL; presencia y clasificación pueden estar incompletas.',
  ),
  satellites: guide(
    '◎',
    'Órbitas propagadas a partir de elementos orbitales públicos.',
    'Grupos CelesTrak seleccionados; posiciones estimadas, no imagen en vivo.',
    'CelesTrak + SGP4; la precisión decae con la antigüedad del elemento.',
  ),
  'rocket-launches': guide(
    '↟',
    'Misiones espaciales cercanas y sitios de lanzamiento publicados.',
    'Ventana de 30 días; seguimiento sólo cuando existe TLE utilizable.',
    'Launch Library 2; fechas y estados pueden cambiar.',
  ),
  traffic: guide(
    '≋',
    'Red vial de referencia y flujo cuando existe proveedor operativo.',
    'Sector visible; no representa cada calle ni garantiza tráfico en vivo.',
    'OpenStreetMap para geometría; el estado de flujo se informa aparte.',
  ),
  cctv: guide(
    '◫',
    'Catálogo de cámaras públicas y vistas de contexto disponibles.',
    'Cobertura por ciudad y proveedor; una ficha no garantiza vídeo reproducible.',
    'Catálogos públicos + fallback Street View; reproducción sólo por acción.',
  ),
  radio: guide(
    '◉',
    'Directorio de emisoras públicas para escucha iniciada por la persona.',
    'Cobertura declarada por cada emisora; enlaces pueden dejar de responder.',
    'Radio Browser; no se inicia audio automáticamente.',
  ),
  transit: guide(
    '⇄',
    'Vehículos y alertas de agencias con feed compatible.',
    'Sólo agencias GTFS-RT registradas; frecuencia y exactitud dependen de ellas.',
    'GTFS-RT público con atribución y condiciones de cada agencia.',
  ),
  bikeshare: guide(
    '○',
    'Estaciones y disponibilidad de bicicleta compartida.',
    'Sistemas GBFS compatibles; inventario depende del operador.',
    'GBFS público; consulta operativa, no reserva una bicicleta.',
  ),
  directions: guide(
    '⌁',
    'Calcula una ruta solicitada sobre la red vial abierta.',
    'Entre puntos elegidos; no sustituye señalización o cierres.',
    'Enrutamiento OSM; requiere una solicitud explícita.',
  ),
  'ais-live-vessels': guide(
    '▽',
    'Contactos marítimos AIS recibidos durante la sesión.',
    'Cobertura según receptores y conexión; algunos barcos no transmiten.',
    'AISStream; depende de la configuración del runtime.',
  ),
  'military-installations': guide(
    '⌖',
    'Instalaciones cartografiadas y búsqueda contextual cercana.',
    'Puntos públicos OSM; resultados opcionales de Places por zona.',
    'OpenStreetMap + Google Places opcional; no afirma estado operativo.',
  ),
  'military-awareness': guide(
    '◉',
    'Contexto combinado de proximidad para recorridos de contactos.',
    'Depende de capas públicas activas; no es inteligencia propia.',
    'Composición interna de fuentes abiertas con sus límites.',
  ),
  'local-datacenters': guide(
    '▣',
    'Centros de datos cartografiados en la referencia local.',
    'Instantánea mundial OSM; puede estar incompleta o desactualizada.',
    'OpenStreetMap, ODbL; copia local con atribución.',
  ),
  'local-dams': guide(
    '▰',
    'Presas de la referencia pública incorporada al runtime.',
    'Conjunto centrado en registros USACE; no es inventario mundial completo.',
    'U.S. Army Corps of Engineers; copia local de referencia.',
  ),
  'telegeography-submarine-cables': guide(
    '〰',
    'Trazados y amarres de cables submarinos de referencia.',
    'Directorio mundial TeleGeography; las rutas son aproximadas.',
    'Copia local CC BY-NC-SA 3.0: utilizable aquí con atribución; uso comercial requiere licencia de TeleGeography.',
  ),
  'local-firms': guide(
    '△',
    'Detecciones satelitales de calor activo de NASA FIRMS.',
    'Cobertura y demora dependen del sensor; un punto no confirma un incendio.',
    'NASA FIRMS requiere la clave configurada en el runtime.',
  ),
});

export const EYE_COMING_SOON = Object.freeze([
  Object.freeze({
    id: 'satellites-3d',
    name: 'Satélites 3D bajo demanda',
    icon: '◌',
    source: 'P4',
    availability: 'coming-soon',
    state: 'coming-soon',
    description: 'Modelos orbitales detallados bajo demanda.',
    coverage: 'No implementado en P0–P2.',
    access: 'Fase P4; este control no activa una simulación.',
  }),
  Object.freeze({
    id: 'earth-moon-system',
    name: 'Sistema Tierra–Luna',
    icon: '◐',
    source: 'P5',
    availability: 'coming-soon',
    state: 'coming-soon',
    description: 'Navegación científica del sistema Tierra–Luna.',
    coverage: 'No implementado en P0–P2.',
    access: 'Fase P5; el spike científico permanece separado.',
  }),
  Object.freeze({
    id: 'lunar-exploration',
    name: 'Exploración lunar',
    icon: '◒',
    source: 'P6',
    availability: 'coming-soon',
    state: 'coming-soon',
    description: 'Relieve y recorridos de superficie lunar.',
    coverage: 'No implementado en P0–P2.',
    access: 'Fase P6; sin renderer ni dataset lunar activo.',
  }),
]);

export function catalogAvailability(layer = {}) {
  if (LICENSE_RESTRICTED.has(layer.id)) return 'license-restricted';
  if (layer.requiresKeyId || layer.stats?.keyRequired) return 'config-required';
  return 'available';
}

function catalogState(layer = {}) {
  const lifecycle = String(layer.lifecycleState || 'disabled');
  const stats = layer.stats || {};
  if (stats.error || stats.lastError || stats.unavailable) return 'error';
  if (
    lifecycle === 'enabling' ||
    lifecycle === 'disabling' ||
    stats.loading ||
    stats.refreshing
  )
    return 'loading';
  return layer.enabled ? 'ready' : 'off';
}

export function deriveEyeCatalog(layers = []) {
  return layers.map((layer) => {
    const detail = EYE_LAYER_GUIDE[layer.id] || {};
    return {
      id: String(layer.id || ''),
      name: String(layer.name || layer.id || 'Fuente'),
      icon: String(layer.icon || detail.icon || '·'),
      source: String(layer.source || 'Fuente registrada'),
      availability: catalogAvailability(layer),
      state: catalogState(layer),
      enabled: Boolean(layer.enabled),
      count: Number.isFinite(Number(layer.stats?.count))
        ? Number(layer.stats.count)
        : null,
      error: String(layer.stats?.error || layer.stats?.lastError || ''),
      description: detail.description || 'Capa registrada por el runtime.',
      coverage: detail.coverage || 'Cobertura informada por la fuente.',
      access: detail.access || 'Consulta las condiciones de la fuente.',
    };
  });
}

const availabilityLabel = {
  available: 'Disponible',
  'config-required': 'Requiere configuración',
  'license-restricted': 'Uso no comercial',
  'coming-soon': 'Próximamente',
};
const stateLabel = {
  off: 'Apagada',
  loading: 'Cargando',
  ready: 'Lista',
  error: 'Error',
  'coming-soon': 'Próximamente',
};
function element(tag, text, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
}
function fact(term, value) {
  const fragment = document.createDocumentFragment();
  fragment.append(element('dt', term), element('dd', value));
  return fragment;
}

/** Render catalog state directly from DataManager; no durable UI copy exists. */
export function mountEyeCatalog({ host, dataManager, onToggle, onConfigure }) {
  if (!host || !dataManager) return { sync() {}, destroy() {} };
  let destroyed = false;
  const paint = () => {
    if (destroyed) return;
    const active = document.activeElement?.dataset?.eyeCatalogToggle;
    host.replaceChildren();
    for (const row of [
      ...deriveEyeCatalog(dataManager.getAll()),
      ...EYE_COMING_SOON,
    ]) {
      const article = element('article', undefined, 'eye-catalog-row');
      Object.assign(article.dataset, {
        eyeCatalogId: row.id,
        state: row.state,
        availability: row.availability,
      });
      const heading = element('div', undefined, 'eye-catalog-heading');
      heading.append(
        element('span', row.icon, 'eye-catalog-icon'),
        element('strong', row.name),
        element(
          'small',
          `${availabilityLabel[row.availability]} · ${stateLabel[row.state]}`,
        ),
      );
      article.append(
        heading,
        element(
          'p',
          row.error || row.description,
          row.error ? 'eye-error' : undefined,
        ),
      );
      const disclosure = element(
        'details',
        undefined,
        'eye-catalog-disclosure',
      );
      disclosure.append(element('summary', 'Cobertura, fuente y condiciones'));
      const facts = element('dl');
      facts.append(
        fact('Cobertura', row.coverage),
        fact(
          'Fuente',
          `${row.source}${row.count == null ? '' : ` · ${row.count} registros`}`,
        ),
        fact('Condiciones', row.access),
      );
      disclosure.append(facts);
      article.append(disclosure);
      const button = element(
        'button',
        row.state === 'coming-soon'
          ? 'Próximamente'
          : row.availability === 'config-required' && !row.enabled
            ? 'Configurar'
            : row.enabled
              ? 'Apagar'
              : row.availability === 'license-restricted'
                ? 'Agregar · NC'
                : 'Agregar',
      );
      button.dataset.eyeCatalogToggle = row.id;
      button.disabled = row.state === 'coming-soon' || row.state === 'loading';
      button.setAttribute('aria-pressed', String(Boolean(row.enabled)));
      article.append(button);
      host.append(article);
    }
    if (active)
      host
        .querySelector(`[data-eye-catalog-toggle="${CSS.escape(active)}"]`)
        ?.focus({ preventScroll: true });
  };
  const click = async (event) => {
    const button = event.target.closest('[data-eye-catalog-toggle]');
    if (!button || button.disabled) return;
    const record = dataManager
      .getAll()
      .find((entry) => entry.id === button.dataset.eyeCatalogToggle);
    if (!record) return;
    if (catalogAvailability(record) === 'config-required' && !record.enabled) {
      onConfigure?.(record, button);
      return;
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    await onToggle?.(record, button);
    paint();
  };
  host.addEventListener('click', click);
  paint();
  return {
    sync: paint,
    focus(id) {
      host
        .querySelector(`[data-eye-catalog-toggle="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      host.removeEventListener('click', click);
      host.replaceChildren();
    },
  };
}
