# EYEINSKY · Sistema de diseño «Editorial Clean»

Fuente: `docs/design/eyeinsky/mockups/editorial-clean.html` (+ `editorial-clean-{desktop,phone}{,-iss}.png`), dirección elegida por Alex el 2026-09-25. Este documento **extrae** sus valores y **corrige** donde la maqueta choca con los principios o las restricciones (marcado **⚠ desvío**). Sustituye la parte visual de `DESIGN.md`; conserva su identidad (Iris orbital) y sus reglas de datos.

## 1. Principios operativos

1. **La Tierra es lo único que brilla.** La interfaz es vidrio oscuro y tinta; nada emite luz salvo el globo, el punto del reloj en vivo y el objetivo fijado.
2. **Un momento, un mensaje.** Al entrar: globo + titular «El planeta, ahora.». Capas, señales y telemetría aparecen tras la primera interacción (`body.intro` → `.reveal`).
3. **Revelar por intención.** En reposo: barra superior y tira inferior. Fijar objetivo despliega el panel. Rótulos del globo solo en hover o al fijar.
4. **La cámara es la animación.** Cada cambio de estado tiene un vuelo con motivo; la UI solo hace fundidos cortos. `prefers-reduced-motion` → `duration: 0`.
5. **Semántica de color fija** (§2). Nunca rojo de amenaza.
6. **Honestidad visible pero discreta.** DEMO/fixture/diferido siempre con texto; nunca «en vivo» sobre datos sin marca de tiempo.
7. **Instrumento, no disfraz.** Mono solo para números; sin esquinas de visor, sin «REC», sin verde Matrix, sin scanlines.
8. **El móvil se diseña, no se encoge** (§7).

## 2. Color

| Token                                               | Valor                                 | Semántica / uso                                                                                                                           |
| --------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--ei-space`                                        | `#020505`                             | Fondo del espacio (canvas de estrellas, `body`).                                                                                          |
| `--ei-bg`                                           | `#071110`                             | Fondo base de marca; placa de rótulos del globo.                                                                                          |
| `--ei-glass`                                        | `rgba(9,18,17,.62)`                   | Vidrio: panel, tira de reloj.                                                                                                             |
| `--ei-glass-strong`                                 | `rgba(9,18,17,.82)`                   | Popovers, tooltips, toast, buscador abierto en móvil.                                                                                     |
| `--ei-glass-rail`                                   | `rgba(9,18,17,.40)`                   | Carril de cámara (la superficie más ligera).                                                                                              |
| `--ei-hairline`                                     | `rgba(238,241,233,.09)`               | Borde de luz y separadores de lista.                                                                                                      |
| `--ei-hairline-strong`                              | `rgba(238,241,233,.18)`               | Buscador con foco, brújula, borde de hoja móvil.                                                                                          |
| `--ei-hover`                                        | `rgba(238,241,233,.07)`               | Fondo hover de botones sin caja.                                                                                                          |
| `--ei-fill` / `--ei-fill-hover` / `--ei-fill-press` | `.04` / `.09` / `.10` sobre `#eef1e9` | Botones de acción secundarios (`.act`), botón de tiempo activo.                                                                           |
| `--ei-paper`                                        | `#eef1e9`                             | Texto primario (blanco cálido) y fondo del botón primario.                                                                                |
| `--ei-ink`                                          | `#0b1413`                             | Texto sobre `--ei-paper`.                                                                                                                 |
| `--ei-muted`                                        | `#b2c4b9`                             | Texto secundario, lede, nav inactiva.                                                                                                     |
| `--ei-faint`                                        | `#8fa398`                             | Etiquetas, metadatos, placeholders.                                                                                                       |
| `--ei-live`                                         | `#a6d7c2`                             | **Verde mineral = vivo/activo**: pestaña y nav activas, punto del reloj en vivo, objetivo, órbita, toggle encendido, itálica del titular. |
| `--ei-live-ink`                                     | `#062019`                             | Texto sobre `--ei-live`.                                                                                                                  |
| `--ei-amber`                                        | `#e6b46d`                             | **Ámbar = foco y magnitud**: anillo de foco, magnitud sísmica, aguja de brújula, reloj en pausa.                                          |

Contraste medido (WCAG 2.x, sobre `#071110`): paper 16.77 · muted 10.48 · faint 7.17 · live 11.96 · amber 10.13 · ink/paper 16.37 · live-ink/live 10.68 → todo AA. **Sobre vidrio el fondo real es el globo:** texto sobre el hemisferio diurno usa `--ei-glass-strong` o se verifica en captura de arnés; las cifras anteriores no valen sobre océano iluminado.

Prohibido: rojo/naranja de alerta (`--eye-danger #f0a28d` queda solo para errores de formulario, con texto), degradados en la marca, glow en texto, más de un acento por componente.

## 3. Tipografía

Familias de la maqueta (Google Fonts): **Instrument Serif** 400 regular/itálica (titulares), **Space Grotesk** 400/500/600 (UI), **IBM Plex Mono** 400/500 (números). En la app se sirven **locales**, como hoy (`public/identity/fonts`, OFL): faltan `InstrumentSerif-Regular/Italic.ttf` e `IBMPlexMono-Medium.ttf`, con licencia, hash y fila en `docs/eyeinsky/planning/asset-manifest.json` y `sources-ledger.json`. Sin CDN.

| Rol                                 | Familia       | Escritorio               | Móvil | Peso                               | Tracking / interlínea              |
| ----------------------------------- | ------------- | ------------------------ | ----- | ---------------------------------- | ---------------------------------- |
| Titular editorial `.headline`       | Serif         | `clamp(44px,5.6vw,88px)` | 34px  | 400; 2.ª línea itálica `--ei-live` | −.01em / .95; `text-wrap: balance` |
| Título de panel `h2`                | Serif         | 34px                     | 26px  | 400                                | 0 / 1                              |
| Título vacío `h3` · magnitud `.mag` | Serif         | 26px · 28px              | 24px  | 400                                | 0 / 1                              |
| Kicker (mayúsculas)                 | Grotesk ⚠     | 12px                     | 14px  | 500                                | .14em / 1.3                        |
| Etiqueta `dt`, `.label`, pestaña    | Grotesk ⚠     | 12px                     | 14px  | 500                                | .12em, mayúsculas                  |
| Cuerpo / lede                       | Grotesk       | 15px                     | 14px  | 400                                | 0 / 1.45; lede máx. 42ch           |
| UI (nav, botones, capas)            | Grotesk       | 14px (fila de capa 15px) | 14px  | 400; primario 600                  | 0                                  |
| Marca `EYEINSKY`                    | Grotesk       | 13px                     | 14px  | 600                                | .22em                              |
| Dato `dd`, telemetría, hora         | Mono + `tnum` | 16px `dd`; 13–14px       | 14px  | 400                                | 0                                  |
| Unidad `small` junto al dato        | Mono          | 12px                     | 14px  | 400, `--ei-faint`                  | 0                                  |

**⚠ Desvíos respecto a la maqueta:** (a) la maqueta pone kickers, `dt`, pestañas `OBJETIVO/MEDIOS/OPS` y el chip DEMO en mono; «mono solo para números» los pasa a Space Grotesk 500 en mayúsculas. (b) Suelos de tamaño: 12px en escritorio (la maqueta baja a 10–11.5px) y **14px para todo texto en móvil** (la maqueta usa 10–12.5px en kicker, `.sub`, créditos y barra inferior).

## 4. Espaciado, radios, vidrio, sombra

- **Escala 4/8:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Normalización: 22→24 (padding superior y de panel), 14→12/16, 18→16, 28→24, 30→32; base del bloque editorial y del panel 128px (=16×8). Canal lateral `--ei-gutter`: 32px escritorio, 16px móvil.
- **Radios:** 4 chip · 6 `kbd` · 8 tooltip · 10 filas de popover y foco · 12 `.act` · 14 primario/popover · 20 hoja móvil · 22 panel · 999 píldoras (nav, buscador, tira, carril, botones de icono).
- **Vidrio:** panel `blur(24px) saturate(140%)`; popover `blur(20px)`; tira `blur(18px)`; carril `blur(14px)`. Siempre con hairline de 1px. **Máx. 3 superficies con `backdrop-filter` visibles a la vez** (coste GPU, §9).
- **Sombra:** una sola, la del panel: `0 30px 80px -30px rgba(0,0,0,.7)`.
- **Viñeta** (`.vignette`, z 2, sin eventos): izquierda `rgba(2,5,5,.78)→.25→0` (0/30/48%), abajo `.85→0` (26%), arriba `.6→0` (14%). Móvil: arriba `.78→0` (30%), abajo `.92→.4→0` (42/58%). Es lo que da contraste al texto sin cajas.

## 5. Movimiento y estados

| Token           | Valor                      | Uso                                             |
| --------------- | -------------------------- | ----------------------------------------------- |
| `--ei-ease`     | `cubic-bezier(.2,.7,.2,1)` | Toda la UI.                                     |
| `--ei-t`        | 180ms                      | hover, color, fondo, popover, tooltip.          |
| `--ei-t-swap`   | 220ms (salida 200ms)       | cambio de titular `.swap.out` (opacidad + 6px). |
| `--ei-t-hide`   | 240ms                      | vista limpia `.hideable`.                       |
| `--ei-t-reveal` | 600ms                      | primera aparición `.reveal` (+10px).            |
| Pulso           | 2.4s, anillo 0→8px         | solo `.clock.live .dot`.                        |

Cámara (Cesium `flyTo`): entrada 2.6s `CUBIC_OUT` desde 95 000 km; volver a global 1.4–1.6s `QUADRATIC_IN_OUT`; fijar objetivo 1.6s; centrar 1.2s; norte 0.6s. La UI de entrada termina a 1.5s, antes que la cámara. Reduced-motion: `setView` directo y `transition-duration: 0ms` global (coherente con `tokens.json → reducedMotionCameraSeconds: 0`).

Estados: **hover** fondo `--ei-hover` + texto a paper · **focus-visible** `2px solid --ei-amber`, offset 3px, radio 10px (nunca `outline: none` sin sustituto) · **active** `scale(.97)` en `.act`, `.985` en primario · **seleccionado** `aria-pressed|aria-selected="true"` → texto paper + marca verde (subrayado 2px o fondo `--ei-live`) · **disabled** opacidad .4, cursor por defecto, sin hover. Todo estado lleva texto además de color («Apagar/Encender», «Reloj en vivo/En pausa/Diferido»).

## 6. Componentes (anatomía → nodo real de la app)

**Reestilizar, no renombrar.** Los ids y `data-eye-*` de cada flecha los consultan `scripts/eyeinsky-{p012,p3,p31,p4,p5,mobile,focus,journey,states}.mjs` y `src/cockpitMarkup.test.mjs`. `.eye-glass-surface` también la consultan arneses: si un nodo deja de ser vidrio se anula con un modificador (p. ej. `.eye-bare`), sin quitar la clase.

1. **Barra superior sin caja** — padding 24/32, gap 24, sin fondo (contraste = viñeta). Marca (símbolo 26px + `EYEINSKY`), nav de texto (píldoras 44px; activo = subrayado 1px `--ei-live` a 8px de la base, `aria-current="page"`), espaciador, buscador, ayuda. → `.eye-orbit-brand`, `.eye-function-dock [data-eye-view="explore|display|instruments|more"]`, `.eye-utility-cluster #eye-command-open #eye-help`.
2. **Buscador** — píldora `min(340px,30vw)` × 44px, fondo `rgba(238,241,233,.05)` + hairline; `:focus-within` → hairline-strong y `.08`. Icono 16px faint, input 14px, `⌘K` mono 12px. Acepta nombre o «lat, lon». Móvil: botón 44px que se abre a todo el ancho sobre `--ei-glass-strong`. → `.eye-search #eye-search-host #eye-command-search`.
3. **Titular de entrada** — bloque abajo-izquierda (`left: gutter; bottom: 128px; width: min(520px,38vw)`), `aria-live="polite"`. Kicker con punto 6px verde («Tierra · luz solar de este instante»), titular serif en dos líneas («El planeta,» / _«ahora.»_), lede muted. Con objetivo: kicker «Objetivo · satélite tripulado», titular = nombre (última palabra en itálica), lede con procedencia. Transición `.swap`. → nodo nuevo `.eye-story`; los datos salen del dock (`.eye-dock-kicker`, `.eye-dock-title`), que se conservan.
4. **Panel contextual único** — 380px, `right: gutter + 64px; bottom: 128px`, radio 22, vidrio + sombra. Dos contenidos exclusivos: _Señales_ (sin objetivo) y _Misión_ (con objetivo). Misión: pestañas `OBJETIVO · MEDIOS · OPS` (44px, activa = paper + barra 2px verde, ←/→ con teclado, `role="tab"`) y cerrar 44px; línea de estado (chip + procedencia); `dl` 2 columnas, gap 16/20 (dt etiqueta, dd mono 16px, unidad `small`); bloque cámara (brújula 44px con aguja ámbar + «Cámara libre / Siguiendo»); acciones 4 × 44px (`Seguir` toggle, `Centrar`, `Norte`, `Más`, que despliega campos `.extra`); **Inspeccionar** primario: 48px, ink sobre paper, 600, flecha que avanza 3px en hover. Vacíos: serif 26px + frase que dice cuándo habrá datos. → `#eye-mission-dock` (`.eye-dock-tabs .eye-dock-tab #eye-dock-tab-ops`, `.eye-dock-keyvalues`, `.eye-dock-camera .eye-dock-compass .eye-dock-camera-badge .eye-dock-camera-detail`, `[data-eye-dock-action="follow|north|more|inspect"]`, `#eye-mission-dock-close`) y `#eye-workspace [data-eye-panel] #eye-panel-close`.
5. **Capas en línea (sin caja)** — bajo el lede, `border-top` hairline, máx. 420px. Cabecera: «Capas en escena · N» + `+ Agregar` (texto verde). Fila 48px: swatch 8px (color de la capa), nombre 15px + recuento mono faint, chip, botón de texto «Apagar/Encender» (`aria-pressed`). Apagada: nombre y swatch a .45. `+ Agregar` abre popover 280px `--ei-glass-strong`. En móvil vive en «Explorar». → `#eye-active-layers #eye-active-layer-count [data-eye-active-add] [data-eye-active-disable]`.
6. **Panel de señales** — kicker «Señales · USGS» + chip, titular serif «N sismos», sub «M2.5+ · últimas 24 h», lista en rejilla `52px 1fr auto`: magnitud serif ámbar 28px, lugar 14px, «hace N h» mono faint; nota de procedencia 13px. Fecha del evento y última consulta, siempre separadas. → `.eye-signal-glance #eye-source-state #eye-total #eye-source-detail`, `#eye-signal-list #eye-feed-status #eye-refresh #eye-filter-mag #eye-filter-hours`.
7. **Tira de reloj** — píldora de vidrio, padding 4, alto 40 (móvil 44). Reloj: punto 7px (verde con pulso = en vivo · ámbar = pausa · sin pulso = diferido), modo 12px mayúsculas, hora mono 14px (con fecha si no es en vivo); separador 1×22px; `Pausa/Reanudar`, `Avance ×1/×60/×600/×3600`, `Ahora` (disabled en vivo), `Fecha`. «Reloj en vivo» solo si `shouldAnimate && multiplier === 1 && deriva < 5 s`; describe el reloj, no los datos. → reloj del director (`src/director/`); `src/ui/templates/eyeinsky.html` no tiene id de reloj: el que se cree se añade a los arneses en la misma fase.
8. **Telemetría inferior discreta** — `dl` en línea a la derecha del pie, gap 24: dt 12px faint mayúsculas, dd mono 13px paper. Coordenadas, Altura, Rumbo, Mapa; ≤1100px solo las dos primeras; oculta en móvil. Solo valores de la cámara real. → `.eye-telemetry #eye-camera-position #eye-camera-altitude #eye-camera-heading #eye-map-label #eye-sector-name #eye-share`.
9. **Controles de cámara verticales** — carril píldora a la derecha, centrado en vertical, padding 4, gap 2, `--ei-glass-rail`. Botones 44px: Acercar, Alejar, Global, Norte, Retícula (toggle verde), Vista limpia. Tooltip a la izquierda en hover/focus (13px, `--ei-glass-strong`, radio 8). Vista limpia oculta `.hideable` y muestra «Mostrar interfaz»; Escape revierte. Móvil: 3 botones, sin tooltips. → `.eye-instruments #eye-zoom-in #eye-zoom-out #eye-home #eye-north #eye-grid #eye-clean #eye-clean-exit`.
10. **Atribuciones** — línea `right: gutter; bottom: 4px`, 12px faint; créditos Cesium incrustados (logo 12px, opacidad .7) + texto de fuentes; móvil: versión corta. Nunca se ocultan créditos de Cesium/NASA/Esri. → `#cesium-credits`, gestionado por `src/ui/panelLayoutController.js`.
11. **Chips DEMO/estado** — 12px, tracking .1em, radio 4, padding 1/6, Grotesk mayúsculas. `DEMO`/`FIXTURE`: neutro (texto muted, borde hairline-strong) **⚠ la maqueta lo pinta ámbar; el ámbar queda para foco y magnitud**. `DIFERIDO`: neutro. `SIN DATOS`: faint, borde discontinuo. `EN VIVO`: verde, solo con marca temporal dentro del umbral de la fuente. Siempre texto, nunca solo un punto.
12. **Retícula y flecha de borde** — retícula: círculo 34px en paper 52% + cruz + lectura `N / 000°` mono (`.eye-field-reticle`, `aria-hidden`); visible solo con objetivo fijado o `#eye-grid` activo, nunca en reposo. Flecha de borde (**nueva; no está en la maqueta**): si el objetivo fijado sale del encuadre, triángulo 10px `--ei-live` anclado al borde + distancia mono 12px; clic = Centrar; `aria-hidden` con equivalente textual en el panel («Fuera de vista · Centrar»). Sin esquinas de visor ni corchetes.
13. **Marcadores del globo** — objetivo: punto 7px verde + anillo 8px alfa .3; rótulo Grotesk 500 13px sobre placa `--ei-bg` .8, padding 8/5, solo hover/fijado. Órbita: discontinua 1.5px verde .7. Sismos: ámbar, `4 + (M − 2.5) · 3` px + halo 6px .25. Satélites: §8.
14. **Toast** — píldora `--ei-glass-strong`, 14px muted, arriba-centro, 2.4s, `role="status"`. → `#eye-notice`.

## 7. Móvil (≤760px en la maqueta; implementar sobre los cortes de la app 650/850)

- **Globo a sangre** entre titular y hoja: el contenedor recalcula su alto (`layoutPhone`) y el globo llena el 90% de la franja libre. Sin marco.
- Arriba: marca + buscador-icono + ayuda (padding 8/16); titular 34px debajo; lede y capas ocultos.
- **Hoja inferior** = panel contextual: `left/right: 16px; bottom: 138px; max-height: 40vh; radio 20`. Asa de 44px; estados _asomada_ (título + 2 filas) / _media_ (40vh) / _completa_; cierre con botón y Escape. Hechos en 3 columnas, sismos a 2 filas, sin bloque de cámara.
- Tira de reloj a todo el ancho, desplazable, con máscara `linear-gradient(90deg, #000 85%, transparent)`; botones 44px.
- Barra inferior: 4 columnas, 52px + `env(safe-area-inset-bottom)`, fondo `rgba(2,5,5,.9)`, etiquetas **14px** (⚠ maqueta 11.5px). Verificar «Instrumentos» a 360px con `eyeinsky-mobile.mjs`; si no cabe, solo la activa lleva etiqueta y todas llevan `aria-label`.
- Objetivos ≥44px; ningún texto <14px; `viewport-fit=cover`; inputs a 16px para evitar zoom.

## 8. Globo (arreglos pedidos; valores de partida, a medir)

- **Cámara inclinada, terminador en diagonal:** la maqueta usa home = subsolar +55° lon, lat 18°, globo al 74% (90% móvil) y `pitch −90°`. Propuesta: `heading −20°`, `pitch −70°`, encuadre 70%. Validar con capturas a 3 horas UTC distintas.
- **Luces nocturnas:** VIIRS City Lights 2012 `nightAlpha 1`, `brightness 1.6`, `contrast 1.2`; día `nightAlpha .55`, `brightness 1.05`, `saturation .9`. Los créditos dicen «2012»: no son luces de esta noche.
- **Halo atmosférico:** `skyAtmosphere.brightnessShift .35`, `saturationShift .15`; `enableLighting`, `dynamicAtmosphereLightingFromSun`, `showGroundAtmosphere`.
- **Satélites ≠ estrellas:** estrellas ~70, ≤0.9px, alfa .15–.6, estáticas, nunca delante del disco; satélites 3px (2.5px órbita alta), paper alfa .9 con contorno 1px `#020505` .6 para leerse sobre el limbo; seleccionado = verde. En P4 (3D) el punto se mantiene a distancia orbital.
- **Fondo estelar sobrio:** `skyBox: false`, canvas propio dibujado una vez, `scene.backgroundColor` transparente. Luna oculta en la vista Tierra; P5 conserva su vista y `.eye-dock-moon`.

## 9. Qué NO

- Cajas anidadas (vidrio dentro de vidrio) o tarjetas dentro del panel: dentro se separa con hairlines y espacio.
- Bordes duros u opacos (el actual `--glass-border` verde al 22%), esquinas de visor, corchetes, scanlines, «REC» (`#hud-timestamp`).
- Mono para texto corrido, etiquetas o botones.
- Más de un panel abierto: abrir `#eye-mission-dock` cierra `#eye-workspace` y viceversa; en móvil, una sola hoja.
- Rojo, glow o parpadeo de «urgencia»; porcentajes sin denominador; «live/en vivo» sin marca temporal.
- Mostrar todo al entrar; animar la UI mientras vuela la cámara; transiciones de UI >600ms.
- Afirmar FPS: comparar con el método de `output/eyeinsky-p4/t7/perf-repeat` (mismo equipo, viewport y escena; SwiftShader solo relativo), sobre todo por `backdrop-filter`.

## 10. Tokens listos para copiar

Incluye alias hacia los nombres actuales de `src/ui/styles/eyeinsky.css` para no romper reglas existentes.

```css
:root {
  --ei-space: #020505;
  --ei-bg: #071110;
  --ei-glass: rgba(9, 18, 17, 0.62);
  --ei-glass-strong: rgba(9, 18, 17, 0.82);
  --ei-glass-rail: rgba(9, 18, 17, 0.4);
  --ei-hairline: rgba(238, 241, 233, 0.09);
  --ei-hairline-strong: rgba(238, 241, 233, 0.18);
  --ei-hover: rgba(238, 241, 233, 0.07);
  --ei-fill: rgba(238, 241, 233, 0.04);
  --ei-fill-hover: rgba(238, 241, 233, 0.09);
  --ei-fill-press: rgba(238, 241, 233, 0.1);
  --ei-paper: #eef1e9;
  --ei-ink: #0b1413;
  --ei-muted: #b2c4b9;
  --ei-faint: #8fa398;
  --ei-live: #a6d7c2;
  --ei-live-ink: #062019;
  --ei-amber: #e6b46d;
  --ei-focus: var(--ei-amber);
  --ei-f-display: 'Instrument Serif', 'Times New Roman', serif;
  --ei-f-ui: 'Space Grotesk', system-ui, sans-serif;
  --ei-f-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --ei-s-1: 4px;
  --ei-s-2: 8px;
  --ei-s-3: 12px;
  --ei-s-4: 16px;
  --ei-s-6: 24px;
  --ei-s-8: 32px;
  --ei-s-12: 48px;
  --ei-s-16: 64px;
  --ei-gutter: 32px;
  --ei-target: 44px;
  --ei-r-chip: 4px;
  --ei-r-kbd: 6px;
  --ei-r-tip: 8px;
  --ei-r-act: 12px;
  --ei-r-m: 14px;
  --ei-r-sheet: 20px;
  --ei-r-l: 22px;
  --ei-r-pill: 999px;
  --ei-blur-panel: blur(24px) saturate(140%);
  --ei-blur-pop: blur(20px);
  --ei-blur-strip: blur(18px);
  --ei-blur-rail: blur(14px);
  --ei-shadow-panel: 0 30px 80px -30px rgba(0, 0, 0, 0.7);
  --ei-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --ei-t: 180ms;
  --ei-t-swap: 220ms;
  --ei-t-hide: 240ms;
  --ei-t-reveal: 600ms;
  --ei-fs-min: 12px;
  /* alias de compatibilidad con eyeinsky.css */
  --accent: var(--ei-live);
  --eye-amber: var(--ei-amber);
  --text-primary: var(--ei-paper);
  --text-secondary: var(--ei-muted);
  --text-dim: var(--ei-faint);
  --glass-bg: var(--ei-glass);
  --glass-border: var(--ei-hairline);
  --font-sans: var(--ei-f-ui);
  --font-mono: var(--ei-f-mono);
  --eye-radius: var(--ei-r-m);
  --eye-ease-out: var(--ei-ease);
  color-scheme: dark;
}
@media (max-width: 760px) {
  :root {
    --ei-gutter: 16px;
    --ei-fs-min: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --ei-t: 0ms;
    --ei-t-swap: 0ms;
    --ei-t-hide: 0ms;
    --ei-t-reveal: 0ms;
  }
}
```

**Límites honestos:** los valores de §8 y los alias (`--text-secondary` #b7c8bf→#b2c4b9, `--glass-bg` 88%→62%, `--glass-border` verde→hairline) cambian píxeles y contraste medidos por los arneses de captura; requieren pasada de `eyeinsky-p012/p3/p31/p4/p5/mobile` y comparación de rendimiento antes de aceptarse. Instrument Serif e IBM Plex Mono 500 aún no están en el repo.
