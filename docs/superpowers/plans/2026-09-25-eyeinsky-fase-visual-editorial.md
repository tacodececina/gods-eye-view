# EYEINSKY Fase Visual «Editorial Clean»: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar `subagent-driven-development` o `executing-plans` y seguir el plan tarea por tarea. Los pasos llevan casillas (`- [ ]`). Hay un solo escritor, en el worktree `C:/Users/Alex/orca/eyeinsky-vis` (rama `eyeinsky/visual-editorial`, base `main` 3efab5b con P0–P5 integradas). Los revisores solo leen.

**Objetivo.** Que EYEINSKY «atrape» y deje de verse feo. Se sustituye la piel y la jerarquía del shell por la dirección **Editorial Clean** que eligió Alex (`docs/design/eyeinsky/mockups/editorial-clean.html`) y se arregla el globo: terminador en diagonal, luces nocturnas, halo, cielo sobrio y satélites que no se confundan con estrellas. Todo ello sin romper los contratos funcionales de P0–P5, sin datos falsos y sin perder accesibilidad ni rendimiento.

**Arquitectura.**

- **Reestilizar, no renombrar.** Los ids, `data-eye-*` y clases que consultan arneses y tests se conservan.
- **Piel nueva por capas.** Se añade una hoja `eyeinsky-editorial.css` bajo `body[data-eye-skin="editorial"]`, que gana a `eyeinsky.css` por especificidad y orden, no por `!important`. `?skin=legacy` la desactiva para comparar y para revertir.
- **Revelación.** Un único estado de presentación (`body[data-eye-reveal]`) decide qué se ve en reposo, tras la primera interacción y con objetivo fijado.
- **Globo.** Cambia por piezas, cada una detrás de su flag, con un parser único `readGlobeFlags`.
- **Estructura.** `mountEyeinsky()` (1 380 líneas) se trocea en módulos sin cambiar el comportamiento **antes** de tocar la piel.

**Stack.** ESM JavaScript, Cesium 1.138 (`@cesium/engine`), Vite 6, `node:test`, Puppeteer con los arneses `scripts/eyeinsky-*.mjs`. Sin framework, sin CDN de fuentes y sin dependencias nuevas.

**Insumos:**

- `docs/design/eyeinsky/DESIGN-SYSTEM-EDITORIAL.md`: tokens, tipografía, componentes y los desvíos ⚠ sobre la maqueta.
- `docs/design/eyeinsky/mockups/editorial-clean.html` y sus `.png`.
- La auditoría del shell y la auditoría del globo del 2026-09-25 (solo lectura, 3efab5b). Sus hallazgos se citan como **[S-n]** (shell) y **[G-n]** (globo) según el orden de filas de cada auditoría.
- Formato heredado de `docs/superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`.

## Restricciones globales

- **Solo la fase visual.** Quedan fuera: P6 (Luna explorable), P7, Bhote Koshi, deployment y cualquier feed nuevo, salvo el proxy de imagen VIIRS (T2), que es infraestructura de escena y no una capa de datos.
- **Sin datos falsos:**
  - «en vivo» solo describe el reloj de escena y solo cuando `shouldAnimate && multiplier === 1 && deriva < 5 s`;
  - VIIRS se rotula «compuesto 2012 (o el año verificado), no en vivo»;
  - sin denominador no hay porcentaje;
  - los fixtures se etiquetan como tales;
  - se elimina toda lectura estática que parezca instrumento (`.eye-field-reticle` «N / 000°», CAMPO desactualizado, sparkline sin significado).
- **Contratos:** la §1 enumera lo que no se toca. Un contrato solo se reescribe en RED cuando el elemento cambia de verdad y Alex lo ha decidido (§0). Nunca se relaja un criterio: 44 px, 14 px, AA, foco, reduced-motion, créditos pulsables, `skyBox.show`, conteos de catálogo.
- **`window.__eyeinsky`** (22 arneses) y **`window.__godsEyeView`** mantienen API idéntica.
- **Accesibilidad:**
  - objetivos táctiles ≥ 44 px;
  - texto ≥ 14 px en viewports ≤ 430 px y ≥ 12 px en escritorio. Donde `p012 smallText` exige 13 px en escritorio, manda 13 px;
  - contraste AA medido **sobre el globo real** en captura, no sobre negro;
  - `:focus-visible` ámbar de 2 px;
  - `prefers-reduced-motion` → `setView` directo y transiciones a 0 ms;
  - zoom al 200 % (p31-11).
- **Rendimiento:** solo comparaciones con el método de `C:/Users/Alex/orca/eyeinsky-p4/output/eyeinsky-p4/t7/perf-repeat` (mismo equipo GPD, 1366×768 a DPR 1, escena A, n = 3 intercalado, 45 s, compuerta térmica ≤ 78 °C). **No se afirman FPS.** El coste GPU (backdrop-filter, segunda textura, atmósfera en el suelo) se declara como límite no medido.
- **Activos:** fuentes (Instrument Serif Regular e Italic, IBM Plex Mono Medium), el SkyBox propio y la capa VIIRS llevan fuente, licencia, procedencia y SHA-256 en:
  - `docs/eyeinsky/planning/asset-manifest.json`;
  - `docs/eyeinsky/planning/sources-ledger.json`;
  - `docs/eyeinsky/visual/ASSET-LEDGER.md`;
  - `DATA_SOURCES.md`.
- **Secretos:** solo por nombre de variable. Nunca se imprime ni se versiona `.env`.
- **Proceso:**
  - RED→GREEN por paso;
  - el formato mecánico va en un commit propio;
  - la evidencia va a `output/eyeinsky-vis/<tarea>/` (no versionado), y los scripts rechazan un directorio que ya tenga `result.json`;
  - servidor canónico `http://127.0.0.1:4204/`: comprobar con `curl` y no matarlo; si hace falta un servidor propio del worktree, usar otro puerto (p. ej. `4206`) y documentarlo;
  - publicar ≠ desplegar: el staging y la producción solo se tocan con una orden separada de Alex.
- **Gates obligatorios por tarea:** `npm run build` → `npm run doctor` → `npm run format:check` → `npm run check:boundaries` → `npm test` (0 fallos) → arneses afectados contra un servidor vivo.
- **No empezar la implementación sin la respuesta de Alex a §0** (como mínimo D1 y D4, que bloquean T3 y T2).

---

## 0. Decisiones de producto para Alex

> **Resueltas el 2026-09-25 por Alex:** D1 = A (sin dock en reposo); D2 = sí (oculta en reposo, accesible desde Instrumentos); D3 = sí (USGS bajo demanda, solo presentación); D4 = cielo real desde catálogo con `skyBox.show === true`; pose la elige Alex con capturas de T2; D5 = «Reloj en vivo» / «Simulación ×N» / «En pausa · motivo». Defaults aceptados sin objeción.

Solo estas cambian el trabajo. Para cada una se da una recomendación y lo que se rompe si no se sigue.

**D1. ¿La ficha «Vista · Tierra» deja de existir en reposo?** (bloquea T3)

- Hoy `#eye-mission-dock` está abierto desde el arranque con `context earth:view`. Pinta estado y fuente falsos («La fuente no informa la hora», «Fuente no declarada por el proveedor»; [S-14]) y repite altura, rumbo y mapa [S-15].
- **Recomendado (A):** sin objetivo no hay dock. La lectura de cámara vive solo en la telemetría del pie, y el dock aparece al fijar un objetivo (sismo, satélite, contacto, Luna). Exige reescribir en RED tres contratos:
  - `p3-01-view-dossier-open-without-focus-theft` pasa a «sin dock en reposo y foco sin robar»;
  - `p3-01-view-dossier-has-real-map-and-camera` pasa a «la telemetría muestra Mapa, Altura y coordenadas `d.d° / d.d°` tras `#eye-home`»;
  - `p31-01` pasa de anclaje abajo-izquierda (`gapBottom`/`gapLeft` ≤ 48) a anclaje del panel contextual derecho al fijar un objetivo.
- **Alternativa (B):** conservar el nodo visible como una sola barra mínima («Tierra · Cámara libre»). No rompe arneses, pero contradice «un momento, un mensaje» y deja dos lecturas de cámara.

**D2. ¿Desaparece la barra «Datos avanzados de vista» del reposo?** (T3)

- **Recomendado:** sí. El marcado queda intacto: `<details class="eye-hud-details eye-glass-surface">`, el summary y `#eye-hud-host` siguen existiendo, porque `eyeinskyV4Markup.test.mjs` los fija. Se oculta por CSS en reposo y se abre desde Instrumentos → «Datos avanzados» (`#eye-instrument-data`).
- Dentro se quitan la ALT duplicada, lat/lon y la jerga de reconocimiento (NIIRS, GSD, COLL, ONA) fuera de cabina. En `body.cockpit-mode` no cambia nada.
- Si Alex quiere conservar la jerga, se queda, pero en blanco cálido y sin barra permanente.

**D3. ¿El panel USGS se abre bajo demanda?** (T3)

- **Recomendado:** sí. Se elimina `.eye-signal-glance` del reposo y se elimina la sparkline `#eye-source-trend`, porque cuenta filas por refresco y no tiene denominador.
- El estado de la fuente (`#eye-source-state`, `role=status`, que lee `states`) se mueve al panel Señales y a la fila de capa «Sismos USGS · N».
- Pregunta secundaria: ¿se retrasa también la **consulta** USGS hasta la primera interacción (principio 2) o solo su presentación? Recomendado: solo la presentación, porque la consulta ya existe y retrasarla cambia `states` y `smoke`.

**D4. Cielo y pose de inicio.** (bloquea T2)

- **Cielo recomendado:** un `SkyBox` propio y sobrio, generado desde un catálogo estelar real de dominio público (Yale BSC, magnitud ≤ 5), con `skyBox.show === true`. Conserva el check `layout.scene.skyBox` de p012 y es cielo verdadero.
- La maqueta (y `DESIGN-SYSTEM-EDITORIAL.md` §8) usa `skyBox: false` más un canvas con 70 puntos aleatorios. Eso es decorado y obligaría a relajar p012. **No recomendado.**
- **Pose recomendada:** `pitch −90°` con `heading` calculado para que el terminador salga a 25–35° de la vertical. El globo queda centrado y la altura Global conserva ≥ 17 000 km (`home-stable`, `reduced-motion-final-state`).
- `DESIGN-SYSTEM-EDITORIAL.md` §8 propone `pitch −70°, heading −20°`, una inclinación real: descentra el disco y deja el limbo recortado en móvil. Se implementan las dos detrás de `?homePose=solar|tilt|legacy` y Alex elige con capturas de T2 (Paso 7).

**D5. Copy del reloj «● EN VIVO».**

- **Recomendado:** «Reloj en vivo». La etiqueta describe el reloj, no los datos, y el punto verde mineral se conserva. «◆ SIMULACIÓN» y «❚❚ PAUSA» pasan a «Simulación ×N» (ámbar) y «En pausa · motivo».
- Exige reescribir en RED los literales de `src/ui/eyeinskyTimeStrip.test.mjs`. Si Alex prefiere no tocar el copy, solo cambian piel y color.

**Por defecto, salvo objeción de Alex (no bloquean):**

- la retícula lat/lon arranca apagada (`#eye-grid aria-pressed="false"`);
- la retícula fija central `.eye-field-reticle` se elimina;
- la ISS deja el rojo `#ff4444` y pasa a verde mineral, y a ámbar solo cuando está fijada;
- `#global-loading-label` pasa al español sin «live» («Consultando N fuentes…»);
- `#key-setup-chip` «POWER UP» pasa a «Configurar proveedores» (solo en dev);
- los tratamientos CRT, NVG, FLIR y cel se agrupan en Vistas → «Tratamientos visuales», plegado.

---

## 1. Contratos que la fase debe preservar

**Identidad DOM (sin cambio de id, clase ni atributo):**

- Nav: `.eye-function-dock` con `[data-eye-view="explore|display|instruments|more"]` y `aria-pressed`. `.eye-function-dock strong` está en `p012 smallText`.
- Marca y utilidades: `.eye-orbit-brand` (Home), `.eye-search`, `#eye-search-host`, `#location-search` (el nodo se mueve, no se clona: `p012 layout.duplicates`), `.eye-utility-cluster`, `#eye-command-open`, `#eye-help`, `#eye-commands`, `#eye-command-search`, `#eye-command-list`, `[data-eye-action]`.
- Capas activas: `#eye-active-layers`, `[data-eye-active-count]`, `[data-eye-active-add]` (destino de foco tras apagar la última capa), `[data-eye-active-list]`, `[data-eye-active-id]`, `[data-eye-active-disable]` (≥ 44 px, p31-03), `[data-eye-active-suspended]`.
- Controles de cámara: `nav.eye-instruments` con el orden `#eye-zoom-in`, `#eye-zoom-out`, `#eye-home`, `#eye-north`, `#eye-grid` (`cockpitMarkup.test.mjs`) y `<strong>Acercar|Alejar|Global|Norte|Retícula|Limpia</strong>` dentro de cada botón (`eyeinskyV4Markup.test.mjs`); además `#eye-clean` y `#eye-clean-exit`.
- Telemetría: `.eye-telemetry`, `#eye-map-label` (states), `#eye-share` (journey). `#eye-camera-*` no tiene consumidores de arnés.
- HUD avanzado: `<details class="eye-hud-details eye-glass-surface">`, `<summary>Datos avanzados de vista</summary>`, `#eye-hud-host`, los literales `move('intel-hud','eye-hud-host')`, `advancedTelemetryWasOpen` y `resetCameraNorth(viewer)` en `src/ui/eyeinskyShell.js` (`eyeinskyV4Markup.test.mjs` lee el archivo como texto) y las reglas `body.cockpit-mode #intel-hud`.
- Workspace: `#eye-workspace`, `#eye-panel-title`, `#eye-panel-kicker`, `#eye-panel-close`, `[data-eye-panel]` (9 vistas), `#eye-signal-list button[data-signal-id]`, `#eye-refresh`, `#eye-feed-status`, `#eye-filter-mag|-hours|-sector`, `#eye-connect`, `#eye-operation-*` (con los `<label>` de `hudA11y.test.mjs`), `#eye-instrument-dossier[data-eye-dossier-open]`, `#eye-catalog .eye-catalog-row` (**24**), `dataManager.getAll().length` (**21**).
- Mission Dock:
  - raíz `#eye-mission-dock` con sus `data-visible|-context-key|-context-kind|-context-layer|-expanded|-camera-status` y la variable `--eye-dock-band` (la leen `dockBias.js`, `trackingFraming.js` y `eyeinskyEarthMoon.js`);
  - cabecera y riel: `.eye-dock-header`, `.eye-dock-rail`, `.eye-dock-kicker`, `.eye-dock-title`/`#eye-mission-dock-title`, `.eye-dock-status`, `.eye-dock-camera`, `.eye-dock-keyvalues`;
  - controles: `.eye-dock-compass` (≥ 44 px, con «rumbo» y «norte» en la etiqueta, p3-12), `[data-eye-dock-action]`, `#eye-mission-dock-close`, `#eye-dock-action-reason`;
  - pestañas: `.eye-dock-tabs`, `#eye-dock-tab-{objetivo,medios,ops}[data-eye-dock-pane]`, `#eye-dock-panel-*`;
  - expediente, medios y actividad: `.eye-dossier`, `#eye-dossier-title`, `.eye-dossier-fields`, `.eye-dossier-coords`, `.eye-sat-chips`, `[data-eye-media-*]`, `.eye-media-credit`, `[data-eye-activity-*]`, `.eye-ops-*`.
- Tiempo y Luna: `[data-eye-time-strip|-text|-announce|-cmd|-toggle|-field|-chip|-notice|-notes]`, `#eye-time-seek`, `#eye-time-controls`, `[data-eye-moon-actions|-action|-notice|-reticle]`, `.eye-moon-reticle-ring|-arrow|-legend`, `[data-eye-earth-label]`.
- Avisos y vista limpia: `#eye-notice`, `#eye-dialog`, `#eye-dialog-confirm|-cancel`, `#toast`, `#world-overlay-status`, `#clean-view-toggle`, `#clean-view-exit` (p3-10 exige las dos rutas).
- Créditos: `#cesium-credits` (el primer `a`/`img` visible recibe el clic en su centro, `p012 creditHit`), `.cesium-credit-expand-link` y los créditos dinámicos de `src/data/dataCredits.js`.

**Escena:**

- `scene.skyBox.show === true` y `scene.backgroundColor` = `rgb(0,0,0)` (p012 `layout`);
- `home.camera.alt ≥ 17 000 000` a 1440×900 (p012 `home-stable`, `reduced-motion-final-state`);
- `resetCameraNorth` deja `heading = 0`;
- la Luna P5 comparte la `SunLight` por defecto;
- `sceneClockRender.js` es el único bucle de repintado ligado al reloj.

**Orden de eventos:** la extracción no cambia el orden de montaje ni de teardown (p012 `motion-reentry`, p31-12b sin listeners tras destruir, p3-14).

**Arneses rotos en la base** (`eyeinsky-focus`, `-journey`, `-mobile`, `-states`), que fallan por selectores obsoletos (`.eye-header`, entre otros):

- no cuentan como regresión;
- en T6 se reparan sus selectores obsoletos, sin relajar criterios, porque medirán el móvil y la retícula de esta fase;
- los asserts que esta fase invierte (`journey` L332: `aria-pressed` de `#eye-grid`) se corrigen en RED.

### 1.1 Contratos que se renegocian (solo con D1–D5 respondidas)

| Contrato                                                                     | Hoy                                                                             | Tras la fase                                                                                                                        | Tarea | Decisión                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| p3-01 (`scripts/eyeinsky-p3.mjs` L96)                                        | Dock visible al inicio con `earth:view`                                         | Sin dock en reposo; foco en `body` o en el primer control; `data-visible="false"`                                                   | T3    | D1-A                                                  |
| p3-01b (L942)                                                                | MAPA ACTIVO/ALTURA y coordenadas en `.eye-dossier-fields`/`.eye-dossier-coords` | Mismos datos en `.eye-telemetry` (`#eye-map-label`, `#eye-camera-altitude`, `#eye-camera-position` con `d.d° / d.d°`)               | T3    | D1-A                                                  |
| p31-01 (`scripts/eyeinsky-p31.mjs` L119-131)                                 | Anclaje abajo-izquierda ≤ 48 px, `expanded=false`                               | Al fijar un objetivo: panel a la derecha (`gapRight` ≤ gutter + 64 + 8, `gapBottom` ≤ 136) en escritorio; hoja inferior en ≤ 650 px | T3/T5 | D1-A                                                  |
| p5 dock y polish (`scripts/lib/eyeinsky-p5-dock*.mjs`, `-polish-checks.mjs`) | Tiempo buscado en `.eye-dock-header`/`.eye-dock-rail`                           | Tiempo en el pie global `[data-eye-time-host]`; mismo criterio de 44 px y 14 px                                                     | T3    | Movimiento real (el reloj ya no depende del objetivo) |
| `eyeinskyTimeStrip.test.mjs`                                                 | «● EN VIVO», «◆ SIMULACIÓN», «❚❚ PAUSA», chip «SIM 07-OCT 03:12»                | «Reloj en vivo», «Simulación ×N», «En pausa · motivo»; chip sin cambio de formato numérico                                          | T3    | D5                                                    |
| `eyeinsky-journey.mjs` L332                                                  | Clic en `#eye-grid` → `'false'`                                                 | Clic → `'true'`                                                                                                                     | T2    | Por defecto                                           |
| `eyeinsky-immersive.mjs` L169/187/296                                        | Pulsa `[data-eye-layer]` (código muerto)                                        | Usa `[data-eye-catalog-toggle]`                                                                                                     | T0b   | Borrado de código muerto                              |
| `eyeinskyScenePolicy.test.mjs`                                               | Halo 7/9                                                                        | Halo ≈ 22/14; un solo dueño                                                                                                         | T2    | Por defecto                                           |

---

## 2. Interfaces fijadas

### 2.1 Flags de escena y piel (`src/ui/eyeinskyGlobeFlags.js`, puro)

```js
export const GLOBE_FLAG_DEFAULTS = Object.freeze({
  skin: 'editorial', // 'editorial' | 'legacy'
  globe: 'legacy', // interruptor maestro: 'editorial' | 'legacy'
  lighting: null, // null = hereda de globe; '0' | '1'
  nightLights: null, // '0' | '1'
  stars: null, // 'sober' | 'tycho'
  homePose: null, // 'solar' | 'tilt' | 'legacy'
  intro: null, // '0' | '1'
  satStyle: null, // 'editorial' | 'legacy'
  satLabels: null, // 'intent' | 'legacy'
});

export function readGlobeFlags(search = '', defaults = GLOBE_FLAG_DEFAULTS) {
  // → objeto congelado y resuelto (sin null): globe=editorial activa
  // lighting=1, nightLights=1, stars=sober, homePose=solar, intro=1,
  // satStyle=editorial, satLabels=intent. Valores desconocidos → default.
  // Nunca lanza; ignora claves ajenas.
}
```

Promoción: los valores por defecto de `globe` pasan a `editorial` en T6 solo con las §4 V-xx del globo en verde y el perf-repeat dentro de presupuesto.

### 2.2 Estado de revelación (`src/ui/eyeinskyReveal.js`)

```js
// Estados: 'intro' → 'rest' → 'explore' ; 'target' ortogonal (hay objetivo fijado).
export function nextRevealState(state, event) {
  // Puro. event: 'intro-done' | 'first-interaction' | 'target-set' |
  // 'target-cleared' | 'panel-open' | 'panel-close' | 'clean-on' | 'clean-off'
  // → { phase, target, panel } congelado. 'first-interaction' solo sale de 'rest'.
}
export function mountEyeReveal({ doc, viewer, reducedMotion }) {
  // Publica body[data-eye-reveal="intro|rest|explore"], body[data-eye-target="0|1"],
  // body[data-eye-intro="running|done"]. Escucha pointerdown/wheel/keydown sobre
  // el canvas y los controles, y los eventos del dock. Devuelve { dispatch, destroy }.
}
```

Regla de exclusividad: abrir `#eye-mission-dock` cierra `#eye-workspace` y viceversa; en móvil solo existe una hoja.

### 2.3 Pose de inicio (`src/ui/eyeinskyHomePose.js`, puro)

```js
export function solarHomePose({ sunEcef, viewport, fovy, mode = 'solar' }) {
  // → { lon, lat, alt, heading, pitch }
  // solar: lon = lonSubsolar + 60°, lat = 20°, pitch = −90°,
  //        heading tal que la normal del terminador proyectada forme 25–35°
  //        con la vertical de pantalla; alt = fitHeight(fill .74 escritorio / .90 móvil)
  //        y alt ≥ 17 000 000 si viewport ≥ 1024 px de ancho.
  // tilt:  igual + pitch −70°, heading −20° (propuesta del sistema de diseño).
  // legacy: {lon −92, lat 18, alt 18e6|26e6, heading 0, pitch −90}.
}
export function fitHeight({ viewport, fovy, fill, radius = 6_378_137 }) {
  /* … */
}
```

El sol sale de `celestialFor(viewer).sunFixedAt(clock.currentTime)` (`src/layers/moon/celestialService.js`), así que la pose sigue al reloj P5, no a `Date`.

### 2.4 Capa nocturna (`src/maps/nightLights.js` + `server/providers/space/gibs.js`)

```js
// Cliente, puro salvo el proveedor inyectado.
export function createNightLightsLayer({ Cesium, urlTemplate, maxLevel = 8 }) {
  // → ImageryLayer con dayAlpha 0, nightAlpha 1, brightness ≈ 2.2, gamma ≈ .85,
  //   contrast ≈ 1.2, saturation ≈ .6; credit «Luces nocturnas: NASA GIBS · VIIRS
  //   <año> (compuesto, no en vivo)».
}
export function nightLightsHealth({ maxErrors = 6 }) {
  // Contador de errorEvent → 'ok' | 'degraded' | 'absent'. En 'absent' se retira la
  // capa y se publica la ausencia (texto discreto en créditos), sin sustituto.
}
```

Proxy `GET /api/gibs/night/{z}/{y}/{x}.jpg`:

- lista blanca: una sola capa GIBS y una sola `TileMatrixSet`, `0 ≤ z ≤ 8` con x/y enteros en rango;
- caché LRU por proceso (p. ej. 512 teselas), single-flight por clave, `Cache-Control` público;
- ante un fallo de origen, `serve-stale` o un 502 honesto;
- sin cabeceras del origen que filtren datos.

Se registra junto a `celestrakProxy` en `server/providers/space.js` y `server/providers/local.js`. La capa GIBS concreta (`VIIRS_CityLights_2012` frente a `VIIRS_Black_Marble`) se fija en T2 Paso 1 con GetCapabilities; no se da por supuesta.

### 2.5 Presupuesto de rótulos de satélite (`src/layers/satellites/policy.js`)

```js
export function satelliteLabelBudget(heightM) {
  // > EYE_SCENE_FAR_ENTER_M (8.6e6): 0 · 1e6–6.8e6: ≤3 (ISS/estaciones) · <1e6: ≤8
}
```

---

## 3. Estructura de archivos

**Crear**

- `scripts/eyeinsky-visual.mjs`: arnés estético y de jerarquía (T0). Recibe la URL y el directorio de salida por argv, como los arneses de fase.
- `scripts/lib/eyeinsky-visual-checks.mjs`: funciones puras de medición (contraste WCAG, tamaños, solapes, superficies visibles, ángulo del terminador en captura, luminancia de halo y cielo).
- `scripts/eyeinsky-visual-checks.test.mjs`: tests `node:test` de las funciones puras con fixtures sintéticos.
- `src/ui/styles/eyeinsky-editorial.css`: tokens §10 del sistema de diseño y una regla por componente y por breakpoint, bajo `body[data-eye-skin="editorial"]`. Si supera las 800 líneas, se parte en `eyeinsky-editorial-{tokens,shell,panel,time,mobile}.css`.
- `src/ui/eyeinskyGlobeFlags.js` y `.test.mjs` (§2.1).
- `src/ui/eyeinskyReveal.js` y `.test.mjs` (§2.2).
- `src/ui/eyeinskyHomePose.js` y `.test.mjs` (§2.3).
- `src/ui/eyeinskyStory.js` y `.test.mjs`: titular de entrada `.eye-story` (`aria-live="polite"`), alimentado por el reloj y el contexto del dock.
- `src/ui/eyeinskyContextLabels.js` y `.test.mjs`: fuente única de `KIND_KICKERS` y `STATUS_LABELS` [S-14], con estado `camera` («Lectura de la cámara · ahora») por si D1-B.
- `src/ui/eyeinskySignalsPanel.js`, `eyeinskyCommands.js`, `eyeinskyGraticule.js`, `eyeinskyVisualViewport.js` y `eyeinskyDockBridge.js`: extracción de `mountEyeinsky` (T0b).
- `src/ui/eyeinskyGlobeLighting.js` y `.test.mjs`: iluminación, fundidos y halo con un solo dueño (T2).
- `src/maps/nightLights.js` y `.test.mjs`; `server/providers/space/gibs.js`; `src/tooling/gibsProvider.test.mjs`.
- `scripts/eyeinsky-starfield.mjs` y `.test.mjs`: genera offline las 6 caras del SkyBox desde el catálogo, de forma determinista y con hash.
- `public/sky/sober/{px,nx,py,ny,pz,nz}.png` (< 1,5 MB en total).
- `public/identity/fonts/InstrumentSerif-Regular.ttf`, `InstrumentSerif-Italic.ttf`, `IBMPlexMono-Medium.ttf` y `instrumentserif-OFL.txt`.
- `docs/eyeinsky/visual/ASSET-LEDGER.md` y `docs/eyeinsky/visual/REVIEW.md` (hoja de capturas para Alex).
- `output/eyeinsky-vis/perf/measure-globe.mjs`: copia adaptada de `measure-repeat.mjs` (no versionado).

**Modificar**

- `src/ui/templates/eyeinsky.html`:
  - añade `.eye-story`, `.eye-foot` con `[data-eye-time-host]` y `.eye-vignette`;
  - elimina `.eye-field-reticle`, la sparkline `#eye-source-trend`/`#eye-source-trend-label` y el badge `#eye-active-layer-count` [S-2];
  - pone `#eye-grid aria-pressed="false"`.
- `src/ui/eyeinskyShell.js`: extracción (T0b), borrado de `toggleDirectLayer`/`[data-eye-layer]`, montaje de reveal, story, flags y pose. Se queda en ≤ 800 líneas y conserva los literales de V4Markup.
- `src/ui/eyeinskyMissionDock.js` y `src/ui/eyeinskyMissionDockModel.js`: sin ficha de vista (D1-A), sin «CÁMARA / LIBRE» sin seguimiento, sin la acción Norte en el riel (la brújula ya ejecuta `north`), identidad no duplicada al expandir.
- `src/ui/eyeinskyDossierModel.js` (`createViewContext`, `isDossierVisible`) y `src/ui/eyeinskyDossier.js`: rótulos compartidos; sin la línea de fuente para la cámara.
- `src/ui/eyeinskyTimeStrip.js` y `src/ui/eyeinskyEarthMoon.js` (`hosts.time`): el reloj pasa al pie global.
- `src/ui/eyeinskyHud.js`: rumbo sin inclinación, altura con el datum declarado y sin CAMPO.
- `src/hud.js`: HUD avanzado sin jerga fuera de cabina (D2).
- `src/ui/eyeinskyActiveLayers.js`: fila en línea con un swatch semántico.
- `src/ui/eyeinskyLanguage.js`, `src/loadingFeedback.js`, `src/ui/templates/scene-chrome.html` y `provider-settings.html`: copy en español y sin «live».
- `src/ui/eyeinskyScenePolicy.js`: único dueño del halo; lee la capa base en cada `apply`; incorpora la capa nocturna y el SkyBox propio.
- `src/app/viewer.js`: se quitan las escrituras de `skyAtmosphere` (un solo dueño).
- `src/standalone/controls.js` (`initialView`): delega en `eyeinskyHomePose`.
- `src/layers/satellites/policy.js`, `ingestion.js`, `catalog.js`, `labels.js` e `interaction.js`: estilo de punto, ISS sin rojo, presupuesto de rótulos y hover.
- `src/ui/styles/eyeinsky.css`: solo borrados de reglas muertas (`.eye-field-reticle`, sparkline), en un commit propio. No se añaden reglas nuevas.
- `src/ui/styles/eyeinsky-earth-moon.css`: tono vivo `#8fe0b0` → `var(--ei-live)`; mono solo en números.
- `src/ui/styles/controls.css` y `command-dock-*.css`: se neutralizan el verde neón y el cian dentro de `body[data-eye-skin="editorial"]`.
- `style.css`: importa `eyeinsky-editorial.css` en último lugar.
- `scripts/eyeinsky-p3.mjs`, `eyeinsky-p31.mjs`, `scripts/lib/eyeinsky-p5-*.mjs`, `eyeinsky-journey.mjs`, `eyeinsky-immersive.mjs`, `eyeinsky-p012.mjs` (espera `data-eye-intro="done"`), `eyeinsky-focus.mjs`, `-mobile.mjs` y `-states.mjs`: selectores y contratos de §1.1.
- `scripts/package-boundaries.json`: declarar los módulos nuevos.
- Documentación y activos: `DATA_SOURCES.md`, `docs/eyeinsky/planning/asset-manifest.json`, `sources-ledger.json`, `deploy/nginx/security-headers.conf` (sin cambio si la capa va por el proxy: `'self'`).
- Al aceptar la fase: `docs/eyeinsky/FASES.md` y `EYEINSKY-SESSION.md`.

---

### Tarea T0: Línea base visual y arnés `eyeinsky-visual`

**Objetivo:** congelar cómo se ve hoy y convertir los principios de diseño en checks medibles que **fallen** sobre 3efab5b (RED de la fase entera).

**Archivos:** crear `scripts/eyeinsky-visual.mjs`, `scripts/lib/eyeinsky-visual-checks.mjs` y `scripts/eyeinsky-visual-checks.test.mjs`.

**Jornadas:** 1,5.

- [ ] **Paso 1: línea base de gates y de estado**
  - Registrar `git rev-parse HEAD`, `git status --porcelain`, las versiones de Node y npm y el renderer de Chrome en `output/eyeinsky-vis/t0/baseline/`.
  - Ejecutar los 5 gates estáticos y los arneses p012, p3, p31, p4, p5, camera-adverse y p012-cockpit contra el servidor. Guardar sus `result.json`.
  - Registrar el estado conocido de focus, journey, mobile y states (rojo en la base).
- [ ] **Paso 2: capturas de referencia**
  - Viewports: 1440×900, 1366×768, 1024×768, 430×932, 390×844 y 360×740.
  - En cada uno, cuatro estados: reposo a los 4 s, tras un clic en la Tierra, con objetivo fijado (sismo fixture etiquetado e ISS por `trackById`) y con un panel Señales abierto.
  - Cada captura se repite con `?skin=legacy` en cuanto exista, para el antes/después. Van a `output/eyeinsky-vis/t0/shots/`.
- [ ] **Paso 3: escribir los tests RED de las funciones puras**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  visibleSurfaces,
  overlaps,
  terminatorAngleDeg,
} from './lib/eyeinsky-visual-checks.mjs';

test('contrastRatio matches WCAG for paper on bg', () => {
  assert.ok(Math.abs(contrastRatio('#eef1e9', '#071110') - 16.77) < 0.05);
});
test('visibleSurfaces counts only glass surfaces with area > 0 and opacity > .05', () => {
  const rects = [
    { cls: 'eye-glass-surface', w: 10, h: 10, opacity: 1 },
    { cls: 'eye-glass-surface', w: 10, h: 10, opacity: 0 },
  ];
  assert.equal(visibleSurfaces(rects), 1);
});
test('overlaps ignores the canvas and the vignette', () => {
  /* … */
});
test('terminatorAngleDeg fits a line to the day/night luminance edge', () => {
  /* fixture 64×64 sintético a 30° → 30 ± 3 */
});
```

- [ ] **Paso 4: ejecutar en RED:** `node --test scripts/eyeinsky-visual-checks.test.mjs`. Resultado esperado: FAIL porque el módulo no existe.
- [ ] **Paso 5: implementar las funciones puras y el arnés.** Checks por viewport (IDs `vis-*`):
  - `vis-rest-surfaces`: en reposo (`data-eye-reveal="rest"`), ≤ 2 superficies visibles, que son la barra superior (sin caja) y la tira del pie;
  - `vis-one-panel`: nunca hay dos de `#eye-workspace:not([hidden])` y `#eye-mission-dock[data-visible="true"]` visibles a la vez;
  - `vis-text-floor`: texto visible ≥ 14 px en viewports ≤ 430 px y ≥ 12 px en el resto (13 px donde lo exige p012);
  - `vis-targets`: todo control visible ≥ 44×44 px;
  - `vis-contrast`: texto visible con AA (≥ 4,5, o ≥ 3 si ≥ 24 px), con el fondo muestreado **de la captura real** bajo el rectángulo del texto (percentil 90 de luminancia);
  - `vis-no-hscroll`: `scrollWidth ≤ innerWidth`;
  - `vis-no-overlap`: sin solapes entre superficies interactivas;
  - `vis-no-dup-readings`: altura, rumbo y mapa aparecen una sola vez en reposo (conteo por `data-eye-reading`, atributo nuevo solo informativo);
  - `vis-no-costume`: 0 nodos visibles con `.eye-field-reticle`, «TOP SECRET», «REC», «NIIRS» o «LIVE» fuera de cabina;
  - `vis-mono-numbers`: los nodos con `font-family` mono contienen dígitos o símbolos de unidad;
  - `vis-globe-terminator`: ángulo del terminador en pantalla entre 25° y 35° en Global;
  - `vis-globe-night`: luminancia media nocturna < 25 % de la diurna;
  - `vis-halo`: anillo de 3–12 px fuera del limbo, > 2× el fondo en el lado diurno y < 1,2× en el nocturno;
  - `vis-sky`: percentil 99 del cielo < 0,45;
  - `vis-sat-vs-star`: diámetro aparente del satélite ≥ 2× el de la estrella más brillante.

  Los checks del globo solo se evalúan con `?globe=editorial`; en legacy se registran sin puntuar.

- [ ] **Paso 6: pasar el arnés sobre la base y guardar el RED esperado** en `output/eyeinsky-vis/t0/visual-red/`. Resultado esperado: fallan `vis-rest-surfaces` (9 superficies), `vis-no-dup-readings`, `vis-no-costume`, `vis-text-floor` (créditos de 9 px, `#global-loading-label`) y todos los del globo.
- [ ] **Paso 7: commit:** `test(eyeinsky): add visual editorial baseline harness`.

---

### Tarea T0b: Extracción estructural sin cambio de comportamiento

**Objetivo:** que `mountEyeinsky()` deje de ser una función de ~1 380 líneas antes de tocar la piel [S-24]. **No cambia ningún píxel ni evento.**

**Archivos:** crear los 5 módulos de §3 (`eyeinskySignalsPanel.js`, `eyeinskyCommands.js`, `eyeinskyGraticule.js`, `eyeinskyVisualViewport.js`, `eyeinskyDockBridge.js`) y `eyeinskyContextLabels.js`; modificar `src/ui/eyeinskyShell.js`, `eyeinskyDossier.js`, `eyeinskyMissionDock.js`, `eyeinskyMissionDockModel.js`, `scripts/package-boundaries.json` y `scripts/eyeinsky-immersive.mjs`.

**Jornadas:** 2.

- [ ] **Paso 1: RED de rótulos compartidos.** `eyeinskyContextLabels.test.mjs` exige que `eyeinskyDossier.js` y `eyeinskyMissionDockModel.js` **importen** `KIND_KICKERS` y `STATUS_LABELS` desde el módulo nuevo (test por texto con `readFile`, como hace V4Markup) y que los valores sean idénticos a los actuales. Falla porque el módulo no existe.
- [ ] **Paso 2: GREEN.** Mover las tablas, sin cambiar un solo literal.
- [ ] **Paso 3: RED del código muerto.** Test que exige 0 apariciones de `[data-eye-layer]` y `toggleDirectLayer` en `src/`, y que `eyeinsky-immersive.mjs` use `[data-eye-catalog-toggle]`. Falla.
- [ ] **Paso 4: GREEN.** Borrar el código muerto y actualizar immersive (L169, L187 y L296).
- [ ] **Paso 5: extraer los módulos uno por uno, con un commit por módulo.**
  - `eyeinskySignalsPanel.js` recibe `paintFeed`, `refresh`, `filters`, `inspect` y `earthquakeContext`.
  - `eyeinskyCommands.js` recibe acciones, ayuda, compartir y Ctrl+K.
  - `eyeinskyGraticule.js` recibe la retícula Cesium.
  - `eyeinskyVisualViewport.js` y `eyeinskyDockBridge.js` reciben `applyDossier`, `publish*`, la suspensión y `earthMoonShell`.
  - Cada módulo expone `mount*(deps) → { destroy }` y el shell los compone en el **mismo orden**.
  - Los literales de V4Markup se quedan en `eyeinskyShell.js`.
- [ ] **Paso 6: gates completos más p012, p3, p31, p5 e immersive.** Resultado esperado: los `result.json` coinciden check por check con la base de T0. `wc -l src/ui/eyeinskyShell.js` ≤ 800.
- [ ] **Paso 7: commits** `refactor(eyeinsky): extract …` (uno por módulo).

---

### Tarea T1: Tokens, tipografía y piel sin cambio de estructura

**Objetivo:** aplicar el sistema Editorial (color, tipografía, vidrio, radios, estados) sobre los nodos existentes, sin cambiar ids, jerarquía ni visibilidad. Es solo piel. Quitar bordes duros, cajas anidadas, glifos decorativos y mono en etiquetas.

**Archivos:** crear `src/ui/styles/eyeinsky-editorial.css`, las fuentes y su ledger; modificar `style.css`, `src/ui/eyeinskyShell.js` (atributo `data-eye-skin` desde `readGlobeFlags`), `src/ui/eyeinskyGlobeFlags.js`, `eyeinsky-earth-moon.css`, `controls.css` y `command-dock-*.css`.

**Jornadas:** 3.

- [ ] **Paso 1: curar las fuentes.**
  - Descargar Instrument Serif (Regular e Italic) e IBM Plex Mono Medium desde sus repositorios OFL en una revisión fijada.
  - Medir los bytes y el SHA-256 y registrar las filas en `asset-manifest.json`, `sources-ledger.json` y `docs/eyeinsky/visual/ASSET-LEDGER.md`.
  - Añadir `@font-face` locales con `font-display: swap` y fallback `'Times New Roman', serif`. Sin CDN.
- [ ] **Paso 2: RED de flags.** `eyeinskyGlobeFlags.test.mjs`:
  - `readGlobeFlags('')` da `skin: 'editorial'` y `globe: 'legacy'`;
  - `?globe=editorial` resuelve todas las piezas y `?globe=editorial&stars=tycho` sobreescribe una;
  - un valor basura cae al valor por defecto;
  - el objeto está congelado.
- [ ] **Paso 3: GREEN** de `readGlobeFlags` y de `document.body.dataset.eyeSkin`.
- [ ] **Paso 4: RED de piel.** Añadir a `eyeinsky-visual` los checks `vis-skin-tokens`:
  - `getComputedStyle(body).getPropertyValue('--ei-paper') === '#eef1e9'`;
  - `.eye-function-dock` sin `background-image` ni borde con alpha > .2;
  - las etiquetas (`dt`, kickers, pestañas) en `Space Grotesk`, `#eye-mission-dock-title` y `#eye-panel-title` en `Instrument Serif`;
  - 0 colores `#00d4ff`, `rgba(0,255,80…)`, `rgba(54,220,255…)` o `#8fe0b0` calculados en nodos visibles.

  Además, `keyboardFocusStyles.test.mjs` exige `outline: 2px solid var(--ei-amber)` con offset de 3 px bajo `body[data-eye-skin="editorial"]`. Todos fallan.

- [ ] **Paso 5: GREEN.** Escribir `eyeinsky-editorial.css` por componentes (§6 del sistema de diseño, puntos 1–14), cada selector con prefijo `body[data-eye-skin="editorial"]`.
  - Reglas:
    - **sin `!important`**, salvo que haga falta ganar a una regla `!important` existente; en ese caso va con un comentario que la cite por línea;
    - una sola declaración por componente y breakpoint;
    - el vidrio se anula con el modificador `.eye-bare` sin quitar `.eye-glass-surface`, porque los arneses la consultan;
    - `#eye-notice` se consolida en una sola regla con ≥ 14 px en móvil y acción ≥ 44 px [S-21];
    - los créditos `#cesium-credits` van a ≥ 12 px en escritorio y 14 px en móvil, con contraste AA y el clic siempre accesible [S-19].
  - En `eyeinsky-earth-moon.css`, `#8fe0b0` pasa a `var(--ei-live)`; la tira usa mono solo en `[data-eye-time-text]` para la hora.
- [ ] **Paso 6: corregir la maqueta donde no cumple.** Kickers, `dt` y pestañas en Grotesk; labels de 10–12,5 px suben a 12/14 px; los botones de tiempo pasan de 40 a 44 px; `dt` de telemetría de 10 a 12 px; créditos de 10 a 12/14 px.
- [ ] **Paso 7: gates más p012 (`layout-*`, `smallText`), p3, p31, p5, cockpit y `eyeinsky-visual`.**
  - Resultado esperado: `vis-skin-tokens`, `vis-text-floor` y `vis-targets` en verde.
  - `?skin=legacy` reproduce las capturas de T0 (diferencia de píxeles < 1 % fuera del canvas).
- [ ] **Paso 8: commits** `feat(eyeinsky): editorial tokens and type` y `style(eyeinsky): format` por separado.

---

### Tarea T2: Globo, luz, noche, halo, cielo, pose, entrada y retícula

**Objetivo:** que la Tierra sea lo único que brilla [G-1…G-6, G-9]. Las piezas de bajo riesgo van directas; el resto va detrás de `?globe=editorial`.

**Archivos:** crear `eyeinskyGlobeLighting.js`, `eyeinskyHomePose.js`, `src/maps/nightLights.js`, `server/providers/space/gibs.js`, `scripts/eyeinsky-starfield.mjs`, `public/sky/sober/*` y sus tests; modificar `src/app/viewer.js`, `eyeinskyScenePolicy.js`, `src/standalone/controls.js`, `eyeinskyShell.js` (`sectors.global`), `eyeinskyGraticule.js`, `src/ui/templates/eyeinsky.html`, `scripts/eyeinsky-journey.mjs`, `scripts/eyeinsky-p012.mjs`, `server/providers/space.js` y `local.js`.

**Jornadas:** 4.

- [ ] **Paso 1: preflight de GIBS (sin código).**
  - Leer GetCapabilities de GIBS (EPSG:3857) y fijar el identificador de la capa (`VIIRS_CityLights_2012` o `VIIRS_Black_Marble`), el año real, el formato, `TileMatrixSet` y el nivel máximo.
  - Registrar las condiciones de uso y el agradecimiento pedido por ESDIS en `DATA_SOURCES.md` y los ledgers.
  - El año que figure en el crédito es el verificado, no el de la maqueta.
- [ ] **Paso 2 (directo): halo con un solo dueño y retícula apagada.**
  - RED:
    - `eyeinskyScenePolicy.test.mjs` exige `far.atmosphereLightIntensity` en [20, 24], `near` en [12, 16] y `brightnessShift = 0`;
    - `viewer.test.mjs` exige que `createApplicationViewer` no escriba `skyAtmosphere`;
    - un test del shell exige `#eye-grid aria-pressed="false"` en la plantilla y 0 entidades `eyeinsky-graticule` tras montar (construcción perezosa al primer clic).
  - GREEN: aplicar los cambios. `eyeinsky-journey.mjs` L332 espera `'true'` tras el clic.
  - Que `eyeinsky-p4-walk-extra.mjs` L213 no dependa del conteo de polilíneas de la retícula.
- [ ] **Paso 3: iluminación con el Sol del reloj P5 (flag `lighting`).**
  - RED en `eyeinskyGlobeLighting.test.mjs` con un stub de globo:
    - `apply(true)` pone `enableLighting`, `dynamicAtmosphereLighting`, `dynamicAtmosphereLightingFromSun` y `showGroundAtmosphere` a true;
    - fundidos de luz y noche a `1.2e6` y `3.5e6`;
    - `restore()` deja exactamente los valores previos;
    - `apply(false)` no toca nada.
  - `viewer.test.mjs` amplía su stub `globe`.
  - GREEN sin nuevo bucle de render (lo pide `sceneClockRender.js`).
- [ ] **Paso 4: capa nocturna por proxy propio (flag `nightLights`).**
  - RED en `src/tooling/gibsProvider.test.mjs`:
    - rechaza `z > 8`, coordenadas fuera de rango, capas no listadas y path traversal;
    - la clave de caché es `z/y/x`, con single-flight;
    - un fallo de origen da stale o 502 sin cabeceras del origen;
    - lleva `Cache-Control`.
  - RED en `nightLights.test.mjs`: alphas y ajustes; `credit` contiene «no en vivo»; tras 6 `errorEvent` la salud es `absent` y la capa se retira.
  - RED en `eyeinskyScenePolicy.test.mjs`: la capa nocturna va **por encima** de la base tras un `imageryLayers.add(layer, 0)` simulado del MapStackController; la política lee `imageryLayers.get(0)` en cada `apply` y no la captura al montar [G-2]; `nightAlpha` de la base en [0.08, 0.15].
  - GREEN. La capa no pasa por `dataManager`, así que se mantienen **21** capas de ejecución y **24** filas de catálogo.
  - Crédito visible en `#cesium-credits`.
- [ ] **Paso 5: SkyBox sobrio (flag `stars`).**
  - RED en `scripts/eyeinsky-starfield.test.mjs`: con el mismo catálogo, la salida tiene el mismo hash; ninguna estrella supera 2 px ni una luminancia de .45; son 6 caras de 1 024 px y suman < 1,5 MB.
  - GREEN: generar desde Yale BSC (dominio público; verificar y citar la fuente exacta) y registrar el hash.
  - En la política, sustituir la instancia `scene.skyBox`, guardar la original y restaurarla en `destroy`, destruyendo la propia. `skyBox.show` sigue en `true` y `backgroundColor` negro.
- [ ] **Paso 6: pose solar y entrada (flags `homePose` e `intro`).**
  - RED en `eyeinskyHomePose.test.mjs`:
    - con el Sol de 4 fechas (equinoccios y solsticios de 2026), el ángulo proyectado del terminador cae en [25°, 35°];
    - a 1440×900, `alt ≥ 17 000 000`;
    - `legacy` reproduce `{-92, 18, 18e6, 0, -90}`, y 26e6 si el ancho es < 650;
    - `tilt` da `pitch −70`.
  - GREEN:
    - `initialView` y `sectors.global` delegan en la pose;
    - la entrada hace `setView` a 95 000 km y después `runCameraPlan('vista', …)` de 2,6 s con `CUBIC_OUT`, cancelable por `configureEyeCameraInteraction`;
    - con reduced-motion, `setView` directo; `body[data-eye-intro]` pasa a `done` en ambos casos;
    - `resetCameraNorth` sigue dejando el heading en 0.
  - `scripts/eyeinsky-p012.mjs` (`readyPage`) espera `data-eye-intro="done"` en vez de dar por supuesto que 700 ms bastan. El criterio no se relaja: `home-stable` y `reduced-motion-final-state` siguen exigiendo ≥ 17 000 km, y en reduced-motion `_currentFlight` debe ser nulo a los 40 ms.
- [ ] **Paso 7: capturas de decisión D4.** Con `?globe=editorial` y `homePose` en `solar` y en `tilt`, a 1440×900 y 390×844, en 3 horas UTC (00, 08, 16) mediante seek del reloj P5. Van a `docs/eyeinsky/visual/REVIEW.md` como enlaces a `output/eyeinsky-vis/t2/decision/`. **Alex elige** antes de promover.
- [ ] **Paso 8 (opcional, mayor riesgo): globo lejano con Google 3D (`farGlobe`)** [G-2]. Solo si Alex quiere el globo iluminado también con clave de Google:
  - `MapStackController.setFarGlobe(bool)` con la histéresis `nextSceneRegime` (8 600 / 6 800 km);
  - precarga de Esri antes de ocultar el tileset;
  - emisión de `gev:map-stack-changed`.
  - Validar con p3, p31, p4 y camera-adverse **con clave y sin clave** (CCTV y ALPR). Si no hay tiempo, queda documentado como límite: con clave de Google, la vista lejana sigue sin terminador.
- [ ] **Paso 9: gates más p012, p5 (misma SunLight en la Luna), p4, camera-adverse y `eyeinsky-visual` (`vis-globe-*`, `vis-halo`, `vis-sky`)**, con flags en legacy **y** en editorial. Resultado esperado: legacy idéntico a T0 y editorial con los checks del globo en verde.
- [ ] **Paso 10: commits** separados por pieza: `feat(eyeinsky): …` para halo y retícula, iluminación, capa nocturna y proxy, cielo, pose y entrada.

---

### Tarea T3: Jerarquía y revelación, un momento y un mensaje

**Objetivo:** al entrar solo se ven el globo y una frase; en reposo, la barra superior y la tira del pie; con la primera interacción aparecen capas, controles y telemetría; al fijar un objetivo se despliega el panel contextual único. Se eliminan las redundancias [S-1…S-18].

**Archivos:** crear `eyeinskyReveal.js`, `eyeinskyStory.js` y sus tests; modificar `src/ui/templates/eyeinsky.html`, `eyeinskyShell.js`, `eyeinskyMissionDock.js`, `eyeinskyMissionDockModel.js`, `eyeinskyDossierModel.js`, `eyeinskyDossier.js`, `eyeinskyTimeStrip.js`, `eyeinskyEarthMoon.js`, `eyeinskyHud.js`, `src/hud.js`, `eyeinskyActiveLayers.js`, `eyeinskySignalsPanel.js`, `eyeinskyLanguage.js`, `src/loadingFeedback.js`, `eyeinsky-editorial.css` y los arneses de §1.1.

**Jornadas:** 5.

- [ ] **Paso 1: RED del estado de revelación.** `eyeinskyReveal.test.mjs`:
  - `intro→rest` solo con `intro-done`;
  - `first-interaction` solo sale de `rest`;
  - `target-set` pone `target=1` y `panel='mission'`;
  - `panel-open('signals')` con objetivo cierra la misión (exclusividad);
  - `clean-on`/`clean-off` restauran exactamente;
  - el estado está congelado.
- [ ] **Paso 2: GREEN.** Implementar `mountEyeReveal`. Selectores CSS por `body[data-eye-reveal]`/`[data-eye-target]`:
  - en reposo se ocultan `.eye-instruments`, `.eye-telemetry` y `#eye-active-layers` vacío con `opacity:0; visibility:hidden` (**no `hidden`**, para que los destinos de foco y los hit-tests sigan existiendo tras la interacción);
  - `.reveal` con `--ei-t-reveal`.
  - `#eye-active-layers` **nunca** se oculta mientras haya una acción de deshacer o un foco pendiente (p012 `aladdin-off-focus-undo` y `rapid-undo-preserves-restored-layer-focus`).
- [ ] **Paso 3: RED del titular.** `eyeinskyStory.test.mjs`:
  - con el reloj en vivo, kicker «Tierra · luz solar de este instante» y titular «El planeta, / _ahora._»;
  - con el reloj en simulación o en pausa, el kicker nombra la fecha simulada y el titular **no** dice «ahora» (honestidad);
  - con objetivo, el titular toma `.eye-dock-title` y el kicker `.eye-dock-kicker`;
  - `aria-live="polite"`, con un solo anuncio por cambio.
- [ ] **Paso 4: GREEN** de `.eye-story` (abajo-izquierda, `width:min(520px,38vw)`, `bottom:128px`), con la transición `.swap`.
- [ ] **Paso 5: renegociar el dock en RED (D1).** Solo con D1 respondida.
  - Con D1-A, reescribir primero los tres checks de §1.1 (p3-01, p3-01b y p31-01) y la parte correspondiente de `eyeinskyMissionDockModel.test.mjs`: sin objetivo, `buildMissionDockView` devuelve `visible:false`; con objetivo, no hay «CÁMARA / LIBRE» salvo si se sigue algo y no hay acción `north` en el riel.
  - Ejecutarlos contra el código actual (esperado: FAIL) y después implementar.
  - `createViewContext` sigue existiendo (Instrumentos → «Expediente», `#eye-instrument-dossier`, p3-05). Recibe el status `camera` de `eyeinskyContextLabels` y no pinta línea de fuente.
  - Al expandir, `.eye-dossier-title` y `.eye-dossier-status` se ocultan dentro del dock (siguen en el DOM) para no duplicar la identidad [S-13].
  - Los campos extra (NORAD, COSPAR, fuente, `.eye-sat-chips`) solo se muestran expandidos.
  - Con D1-B: barra mínima con `.eye-dock-kicker` y `.eye-dock-title` a la vista, y el resto del riel oculto hasta el objetivo; p3-01 y p31-01 no se tocan.
- [ ] **Paso 6: reloj al pie global.**
  - RED en un test DOM: `[data-eye-time-strip]` vive en `.eye-foot [data-eye-time-host]` y sigue visible con el dock cerrado; los botones del reloj miden ≥ 44 px.
  - Actualizar `scripts/lib/eyeinsky-p5-dock*.mjs` y `-polish-checks.mjs` para que busquen en `[data-eye-time-host]` (una sola constante `TIME_SCOPE`) con los **mismos** umbrales.
  - `headerTextProbe` y `readHeaderTargets` siguen midiendo `.eye-dock-header` para las acciones de la Luna, que se quedan en el dock cuando el objetivo es la Luna.
  - Con D5: literales nuevos en `eyeinskyTimeStrip.test.mjs`, primero RED y después GREEN. `eyeinskyEarthMoonType.test.mjs` (13/14 px) no cambia.
  - `eyeinskyDockFocus.test.mjs` (AHORA→PAUSA y Esc en FECHA) sigue verde.
- [ ] **Paso 7: capas y señales en línea.**
  - RED en `eyeinskyActiveLayers.test.mjs`: sin capas no se pinta `[data-eye-active-empty]` en reposo; con capas, la cabecera es «Capas en escena · N» con `[data-eye-active-add]` «+ Agregar», y cada fila lleva un swatch con color semántico por familia (sismos ámbar, satélites paper).
  - RED en `eyeinsky-states.mjs`: `#eye-source-state` existe dentro de `[data-eye-panel="signals"]`.
  - GREEN (con D3):
    - se elimina `.eye-signal-glance` del reposo;
    - se borran la sparkline y el badge `#eye-active-layer-count`;
    - el conteo USGS queda solo en `#eye-filter-count` y en la fila de capa [S-6];
    - `#eye-total` y `#eye-source-detail` se retiran si ningún test los fija; si alguno los fija, se mueven al panel.
- [ ] **Paso 8: telemetría discreta y una sola fuente por dato.**
  - RED en un test de `eyeinskyHud`: `#eye-camera-heading` muestra solo el rumbo; la etiqueta de altura declara el datum («Altura (elipsoide)») o se unifica en MSL con el helper de `src/hud.js` (`hudAltitudeDatum.test.mjs` sigue verde); `#eye-sector-name` desaparece del marcado; `#eye-north` no rota (sin `--eye-heading-turn`).
  - GREEN. `.eye-telemetry` pasa al pie como `<dl>` de 4 valores; con ≤ 1100 px solo 2 y en móvil se oculta.
  - `#eye-share` se mueve a Más y a la paleta de acciones, y journey se actualiza para buscarlo allí (el elemento cambia de sitio de verdad).
- [ ] **Paso 9: barra superior, buscador y utilidades.**
  - `.eye-function-dock` como nav de texto con `aria-current`.
  - `.eye-search` como pill con `⌘K`, que absorbe `#eye-command-open` como botón interno (el id no cambia).
  - `#eye-help` pasa a icon-btn.
  - `.eye-utility-cluster` se conserva como contenedor dentro de la barra; immersive (L565, L766, L787) solo cambia sus expectativas de geometría si mide posición, nunca las de tamaño.
  - `.eye-orbit-brand` sin cápsula y sin «RED ORBITAL».
- [ ] **Paso 10: HUD avanzado (D2) y copy.**
  - RED: fuera de cabina, `#intel-hud` no contiene NIIRS, GSD, COLL, ONA ni ALT, y `.eye-hud-details` no es visible en reposo; `#global-loading-label` sale en español y sin «LIVE» (revisar primero si `loadingFeedback.test.mjs` fija el literal inglés; si lo fija, reescribir en RED); `#key-setup-chip` dice «Configurar proveedores».
  - GREEN. `cockpitMarkup.test.mjs` (L946, L1009, L1126) sigue verde.
- [ ] **Paso 11: Vistas y workspace.**
  - Se elimina el kicker decodificador «0N /» de `#eye-panel-kicker`: el nodo sigue, con un kicker sans sin número.
  - CRT, NVG, FLIR y cel pasan al `<details>` «Tratamientos visuales»; `#clean-view-toggle` queda dentro (p3-10: las dos rutas).
  - Instrumentos pierde la ruta «Capas activas · Lista de la izquierda».
- [ ] **Paso 12: gates más p012, p3, p31, p4 (page, ux, walk), p5, cockpit, immersive, journey, states, surfaces y `eyeinsky-visual`.** Resultado esperado: `vis-rest-surfaces`, `vis-one-panel`, `vis-no-dup-readings` y `vis-no-costume` en verde, y ningún check P0–P5 relajado.
- [ ] **Paso 13: commits por subpaso** (`feat(eyeinsky): …`); los cambios de arnés van en `test(eyeinsky): …`.

---

### Tarea T4: Marcadores del globo, semántica de color, rótulos por intención y flecha de borde

**Objetivo:** que los satélites se lean como satélites; rótulos solo al pasar el cursor o al fijar; nunca rojo [G-7, G-8]; flecha de borde para el objetivo fuera de cuadro (sistema de diseño §6.12).

**Archivos:** modificar `src/layers/satellites/{policy,ingestion,catalog,labels,interaction,rendering}.js`, `src/ui/eyeinskySignalsPanel.js` (puntos de sismo) y `eyeinskyMoonDock.js`/`eyeinskySystemView.js` (piel de la mira de la Luna y del rótulo TIERRA); crear `src/ui/eyeinskyEdgeArrow.js` y su test.

**Jornadas:** 3.

- [ ] **Paso 1 (directo): la ISS sin rojo.**
  - RED en `satellitesCubesat.test.mjs` o en un test nuevo de `policy`: `POINT_STYLES` no contiene `#ff4444`; la ISS es `#a6d7c2` a 7 px con halo; el `accent` de `labels.js` no es rojo.
  - Los colores de clase de `satelliteClass.test.mjs` **no** cambian.
  - GREEN.
- [ ] **Paso 2: estilo de punto (flag `satStyle`).**
  - RED: en editorial, `pixelSize` de 3–4 px en far, `outlineColor` del color de clase con alpha .25 y `outlineWidth` 3, `translucencyByDistance(2e7,.9,6e7,.5)` y `scaleByDistance(5e5,1.4,2.5e7,.7)`.
  - El punto seguido (`SAT_TRACKED_POINT_PX` 14, `SAT_POINT_HANDOFF_PX`) no cambia; `eyeinsky-p4-page.mjs` L138 lo lee.
  - GREEN. Repetir p4 y p4-ux, porque `_updatePointFocus` depende del escalar.
- [ ] **Paso 3: presupuesto de rótulos y hover (flag `satLabels`).**
  - RED:
    - `satelliteLabelBudget` en los tres tramos;
    - `_syncIssOverlay` no publica el rótulo ambiental con presupuesto 0 y conserva la exclusión mutua con el docked-companion;
    - un `MOUSE_MOVE` limitado a 80 ms publica como mucho 1 rótulo con `cohortLimit:1`;
    - en táctil no hay hover.
  - Antes de tocarlo, `grep -n "ISS" scripts/eyeinsky-p4*.mjs scripts/lib/eyeinsky-p4-*.mjs` para ver si algún arnés espera el rótulo ambiental en Global; si alguno lo espera, se reescribe en RED.
  - GREEN.
- [ ] **Paso 4: sismos.** RED: el tamaño del punto es `4 + (M − 2.5)·3` px con halo de 6 px a .25, en ámbar; el rótulo solo aparece con hover o al fijar. GREEN.
- [ ] **Paso 5: flecha de borde.**
  - RED en `eyeinskyEdgeArrow.test.mjs` (función pura `edgeArrow({screenPos, viewport, inset})`):
    - con el objetivo dentro del cuadro da `null`;
    - fuera, da un ancla en el borde, un ángulo y una distancia formateada en mono;
    - tras el globo (oclusión) da la variante «tras la Tierra».
  - GREEN. La flecha es `aria-hidden`, con su equivalente textual «Fuera de vista · Centrar» en el panel; el clic ejecuta `center`. Sin esquinas de visor ni corchetes.
- [ ] **Paso 6: piel de la mira de la Luna y del rótulo TIERRA:** hairline paper, leyenda sans y ámbar solo con foco. `eyeinskyDockFocus.test.mjs` y p5 siguen verdes.
- [ ] **Paso 7: gates más p4 (completo), p4-ux, p5, p3 y `eyeinsky-visual` (`vis-sat-vs-star`).**
- [ ] **Paso 8: commits por pieza.**

---

### Tarea T5: El móvil se diseña, no se encoge

**Objetivo:** globo a sangre, hoja inferior única, barra de 4 pestañas y reloj a todo el ancho; ≥ 44 px y ≥ 14 px sin excepción (sistema de diseño §7), sobre los cortes reales de la app, 650 y 850.

**Archivos:** `eyeinsky-editorial.css` (o `-mobile.css`), `eyeinskyVisualViewport.js`, `eyeinskyMissionDock.js` (publica `--eye-dock-band` desde la hoja), `src/ui/templates/eyeinsky.html` y los arneses `eyeinsky-mobile.mjs` y `-focus.mjs`.

**Jornadas:** 3.

- [ ] **Paso 1: reparar los selectores obsoletos de `eyeinsky-mobile.mjs` y `eyeinsky-focus.mjs`** (`.eye-header` y otros) contra los nodos reales. Correrlos en la base de T3 y guardar el RED **por motivo de diseño**, no por selector.
- [ ] **Paso 2: RED de móvil en `eyeinsky-visual`**, a 430×932, 390×844 y 360×740:
  - `vis-mobile-nav`: 4 pestañas ≥ 44 px con etiqueta ≥ 14 px, o solo la activa con etiqueta y todas con `aria-label` si «Instrumentos» no cabe a 360 px;
  - `vis-mobile-sheet`: una sola hoja, `max-height ≤ 40vh` en estado medio, asa ≥ 44 px y cierre con botón y Escape;
  - `vis-mobile-globe`: el disco ocupa ≥ 85 % de la franja libre entre el titular y la hoja;
  - `vis-mobile-inputs`: los inputs con `font-size ≥ 16px`;
  - `vis-mobile-credits`: `creditHit` recibe el clic y no lo tapa la barra;
  - `vis-mobile-time`: la tira se desplaza con máscara y sus botones miden ≥ 44 px.
- [ ] **Paso 3: GREEN.**
  - La hoja publica `--eye-dock-band`, así que `dockBias.js` y `trackingFraming.js` siguen centrando el objetivo en la franja libre (p4-ux-probes y `dockBias.test.mjs`).
  - El buscador pasa a icono de 44 px que se expande.
  - Norte, Retícula y Limpia se mueven a Más en vez de esconderse.
  - `viewport-fit=cover` con `env(safe-area-inset-bottom)`.
- [ ] **Paso 4: gates más mobile, focus, p012 (`touch-cdp-globe-390x844`), p3-05 (reabrir el expediente en móvil), p31-12 (5 viewports), p4-ux y p5 (las variantes móviles de `dock-tabs`).**
- [ ] **Paso 5: commits.**

---

### Tarea T6: Regresión completa, rendimiento comparable, promoción de flags y revisión con Alex

**Objetivo:** aceptar la fase solo con evidencia fresca sobre el árbol exacto y con el visto bueno visual de Alex antes de mergear.

**Archivos:** `docs/eyeinsky/visual/REVIEW.md` y `ASSET-LEDGER.md`; tras la aceptación, `docs/eyeinsky/FASES.md` y `EYEINSKY-SESSION.md`; `eyeinskyGlobeFlags.js` (valores por defecto).

**Jornadas:** 3.

- [ ] **Paso 1: gates estáticos:** `npm run build`, `npm run doctor`, `npm run format:check`, `npm run check:boundaries` y `npm test`. Agregar los totales TAP por programa; los totales deben ser distintos de cero y con 0 fallos.
- [ ] **Paso 2: rendimiento** con `output/eyeinsky-vis/perf/measure-globe.mjs`, copia del método perf-repeat de P4 T7 con las mismas funciones de página. Tres celdas:
  - A-legacy: `?skin=legacy&globe=legacy`;
  - A-editorial: `?globe=editorial`;
  - B-editorial-panel: con el panel de misión abierto, para el coste CPU del `backdrop-filter`.

  Método: n = 3 intercalado, 45 s por celda, espera a `globe.tilesLoaded` antes del asentamiento de 8 s, compuerta ≤ 78 °C vía GPD Forge `/telemetry`.

  Criterios:
  - Δp95 de la mediana ≤ +1,0 ms frente a A-legacy;
  - 0 long tasks nuevas;
  - ΔcmdP50 documentado;
  - heap ≤ +5 MB tras 45 s;
  - peticiones y bytes de teselas GIBS registrados.

  El coste GPU queda declarado como **no medido**. Sin FPS.

- [ ] **Paso 3: promover los flags.** Cambiar a `globe: 'editorial'` por defecto solo las piezas cuyos checks y cuyo perf pasen. Una pieza que no pase se queda en legacy, con el motivo en `REVIEW.md`.
- [ ] **Paso 4: arneses en directorios nuevos, en secuencia**, contra el servidor del worktree (puerto documentado): `eyeinsky-visual`, `p012`, `p012-cockpit`, `p3`, `p31`, `p4`, `p4-ux`, `p4-perf`, `p5`, `camera-adverse`, `immersive`, `surfaces`, `smoke`, `mobile`, `focus`, `journey` y `states`.
  - Resultado esperado: exit 0 en todos. Si focus, journey, mobile o states siguen en rojo, cada fallo restante se clasifica como «selector obsoleto preexistente» con la línea exacta, nunca como aceptado.
  - La evidencia viva del proveedor se distingue de la de fixture.
- [ ] **Paso 5: revisión visual para Alex.** `docs/eyeinsky/visual/REVIEW.md` recoge:
  - pares antes/después (T0 frente a la final) en 6 viewports × 4 estados;
  - la maqueta al lado;
  - la lista de desvíos respecto a la maqueta y su porqué (accesibilidad y contratos);
  - los límites honestos.

  Publicar la hoja como página privada solo si Alex lo pide. **No mergear hasta el «sí» explícito de Alex.**

- [ ] **Paso 6: revisión independiente de solo lectura** (code-reviewer y accessibility) con un único ciclo de reparación dirigido; lo cosmético y no bloqueante se difiere.
- [ ] **Paso 7: tras la aceptación,** actualizar `FASES.md` y `EYEINSKY-SESSION.md` con las rutas de evidencia, los flags promovidos y los límites. Commit `docs(eyeinsky): accept visual editorial phase`. El deploy a staging queda sujeto a una orden separada.

**Total estimado: ≈ 24,5 jornadas** (T0 1,5 · T0b 2 · T1 3 · T2 4 · T3 5 · T4 3 · T5 3 · T6 3), más el tiempo de respuesta de Alex en D1–D5.

---

## 4. Matriz de aceptación

- [ ] **V-01:** en reposo (`data-eye-reveal="rest"`) se ven como mucho la barra superior sin caja, el titular y la tira del pie; 0 paneles abiertos (`vis-rest-surfaces`).
- [ ] **V-02:** la primera interacción revela los controles de cámara, la telemetría y las capas (si las hay) con `--ei-t-reveal` ≤ 600 ms; con reduced-motion, 0 ms.
- [ ] **V-03:** nunca hay más de un panel abierto (`#eye-workspace` o `#eye-mission-dock`); en móvil, una sola hoja (`vis-one-panel`).
- [ ] **V-04:** altura, rumbo, mapa y coordenadas tienen una sola lectura visible en cada estado; el datum de altura está declarado (`vis-no-dup-readings`, `hudAltitudeDatum.test.mjs`).
- [ ] **V-05:** 0 lecturas falsas o estáticas: sin `.eye-field-reticle`, sin CAMPO desactualizado, sin sparkline sin denominador y sin «La fuente no informa la hora» en una lectura de cámara.
- [ ] **V-06:** «en vivo» solo en el reloj, con `shouldAnimate && multiplier===1 && deriva<5 s`; VIIRS acreditado como compuesto con su año y «no en vivo»; fixtures etiquetados; 0 «LIVE» en `#global-loading-label`.
- [ ] **V-07:** paleta fija: verde mineral solo para vivo o activo, ámbar para foco, magnitud y simulación, paper para leer; 0 rojo (`#ff4444`), cian o neón calculados en nodos visibles (`vis-skin-tokens`).
- [ ] **V-08:** mono solo en números (`vis-mono-numbers`); titulares en Instrument Serif y etiquetas en Space Grotesk; las fuentes son locales y están en el ledger con SHA-256.
- [ ] **V-09:** todo control visible ≥ 44×44 px; texto ≥ 14 px en ≤ 430 px y ≥ 12/13 px en escritorio (p012 `layout-*` y `vis-text-floor`), con los desvíos de la maqueta corregidos.
- [ ] **V-10:** contraste AA medido sobre el fondo real de la captura en 6 viewports × 4 estados (`vis-contrast`); foco visible ámbar de 2 px (`keyboardFocusStyles.test.mjs`).
- [ ] **V-11:** en Global con `globe=editorial` el terminador sale en diagonal: 25–35° en pantalla, con test unitario en 4 fechas y medición en captura (`vis-globe-terminator`); la posición concuerda con `sunFixedAt` (< 1°); un seek del reloj P5 lo mueve.
- [ ] **V-12:** noche oscura con ciudades visibles: luminancia nocturna media < 25 % de la diurna (`vis-globe-night`); la capa VIIRS pasa por el proxy con lista blanca y caché, sin errores CSP, con < 40 teselas en Global y ausencia discreta ante un fallo.
- [ ] **V-13:** halo con volumen: anillo > 2× el fondo en el lado diurno y < 1,2× en el nocturno (`vis-halo`); `skyAtmosphere` tiene un solo dueño.
- [ ] **V-14:** cielo sobrio y verdadero: `skyBox.show === true`, fondo `rgb(0,0,0)`, percentil 99 < .45 y estrellas ≤ 2 px; generación determinista con hash en el ledger.
- [ ] **V-15:** los satélites se distinguen de las estrellas (diámetro ≥ 2× y contraste ≥ 2:1, `vis-sat-vs-star`); en Global hay 0 rótulos ambientales; los rótulos solo aparecen con hover o al fijar; los colores de clase no cambian.
- [ ] **V-16:** la cámara es la animación: entrada ≤ 3 s (2,6 s), cancelable, `data-eye-intro="done"`; con reduced-motion, `setView` directo y `_currentFlight` nulo a los 40 ms; Global ≥ 17 000 km a 1440×900; Norte deja el heading en 0.
- [ ] **V-17:** la retícula lat/lon arranca apagada, con 0 entidades al arrancar; el toggle sigue funcionando.
- [ ] **V-18:** en móvil, globo a sangre (≥ 85 % de la franja libre), hoja inferior única con `--eye-dock-band`, barra de 4 pestañas, 0 scroll horizontal (`vis-no-hscroll`) y créditos pulsables.
- [ ] **V-19:** los contratos DOM de §1 siguen intactos; solo cambian los de §1.1, con la decisión de Alex registrada y el RED previo guardado en `output/eyeinsky-vis/`.
- [ ] **V-20:** p012, p012-cockpit, p3, p31, p4, p4-ux, p5, camera-adverse, immersive, surfaces y smoke en exit 0; focus, journey, mobile y states reparados o con cada fallo clasificado con la línea exacta.
- [ ] **V-21:** `window.__eyeinsky` y `window.__godsEyeView` tienen la misma API; el orden de montaje y teardown no cambia (p31-12b, p3-14); `eyeinskyShell.js` ≤ 800 líneas.
- [ ] **V-22:** rendimiento comparable al método perf-repeat: Δp95 ≤ +1,0 ms, 0 long tasks nuevas, heap ≤ +5 MB; GPU declarada como no medida; sin FPS.
- [ ] **V-23:** `?skin=legacy&globe=legacy` reproduce la base de T0 (rollback operativo sin revertir commits).
- [ ] **V-24:** build, doctor, format, boundaries y test pasan sobre el árbol exacto aceptado; formato en commit propio.
- [ ] **V-25:** Alex aprueba `docs/eyeinsky/visual/REVIEW.md` antes de mergear; el deploy va con una orden aparte.

## 5. Riesgos y rollback

- **Contratos del dock (D1).** Es el mayor riesgo de arnés: p3, p31, p4 y p5 tocan `[data-eye-dock-action]` y la geometría del dock. Mitigación: con D1-A se reescriben primero los tres checks de §1.1 en RED y se corren p4 y p5 completos tras cada subpaso de T3. Si p4 o p5 se rompen por la ausencia de la ficha de vista, se cae a D1-B (barra mínima) y se consulta a Alex.
- **Tiempo fuera del dock.** Cambia lo que mide `headerTextProbe`. Mitigación: una constante `TIME_SCOPE` en los helpers P5 y los mismos umbrales. Si algún test P5 depende del orden DOM del header, se conserva un nodo vacío con esa clase solo hasta cerrar T3, documentado como deuda.
- **Cascada CSS.** Con 112 `!important` en `eyeinsky.css`, la hoja editorial puede no ganar. Mitigación: prefijo `body[data-eye-skin]` (sube la especificidad) e `!important` solo contra un `!important` citado. Si hace falta más de ~20, T1 incluye borrar las reglas legacy equivalentes en un commit propio, con p012 como red de seguridad.
- **backdrop-filter.** Tiene coste GPU no medible con el método. Mitigación: máximo 3 superficies con blur a la vez (sistema de diseño §4), celda B de perf y una variante `?blur=0` si la CPU del frame se degrada.
- **Latencia y fallos de GIBS.** Mitigación: proxy con caché y stale, ausencia honesta, `?nightLights=0` para CI sin red. En p012, los fallos de teselas GIBS en `requestFailures` se clasifican como ausencia esperada **solo** si la ausencia se ve en créditos.
- **Iluminación a nivel de calle.** Puede oscurecer la zona del usuario de noche. Mitigación: fundidos a 1,2e6 y 3,5e6 m (luz plena a escala de ciudad). Si no basta, `lighting` se limita al régimen far.
- **Google 3D.** Con clave, el globo lejano sigue siendo una malla sin luz. `farGlobe` es opcional y de alto riesgo (CCTV y ALPR escuchan `gev:map-stack-changed`); si no entra, queda como límite declarado.
- **Pose con heading ≠ 0.** Cambia la brújula y `getCameraState().heading`. Norte debe seguir funcionando y camera-adverse registra el pitch.
- **Entrada de 2,6 s.** Los arneses que interactúan a los 700 ms la cruzan en pleno vuelo. Mitigación: esperar `data-eye-intro="done"` y, en CI, `?intro=0`.
- **Licencias.** Instrument Serif (OFL), Yale BSC (dominio público, verificar la edición) y GIBS (sin copyright NASA, con el agradecimiento ESDIS) no se dan por supuestas: se verifican y se registran antes de copiar al repo.
- **Rollback.**
  - Nivel 1: `?skin=legacy&globe=legacy` en ejecución (V-23).
  - Nivel 2: los flags por pieza vuelven a legacy por defecto en `GLOBE_FLAG_DEFAULTS`.
  - Nivel 3: revertir los commits de la tarea, que son atómicos y van uno por pieza.
  - Si la fase rompe P0–P5, se conservan el worktree y la rama, no se mergea y no se resetea `main`.
