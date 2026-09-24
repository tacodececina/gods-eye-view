# Propuesta P4: Satélites 3D

> **Aprobada por Alex el 2026-09-24 con Hubble incluido desde el inicio.** Documento de solo lectura. Parte de la rama `eyeinsky/p4-satellites-3d` (igual a `main`), del plan vigente `docs/superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`, de las propuestas A (fidelidad), B (rendimiento) y C (UX), y de dos veredictos de jueces. La orden de implementar se dio el 2026-09-24.

## 1. Decisión recomendada

1. La base es la propuesta B (rendimiento). Aporta el tope por perfil con cargas pendientes contadas, la muestra SGP4 por frame, la precarga del GLB y el inspector de GLB. Tomamos de A la honestidad en fidelidad y de C la experiencia de uso en el Dock y el expediente.
2. P4 lleva tres modelos NASA: **ISS específico** (en T0 se elige entre las versiones A y B), **Hubble específico** (NORAD 20580, decisión de Alex 2026-09-24) y **CubeSat 1U de familia**. El CubeSat solo se asigna a los satélites del grupo CelesTrak `cubesat`.
3. Escala real: `minimumPixelSize = 0` y un LOD que decide por el **diámetro proyectado en píxeles**. Se añade un encuadre **INSPECCIONAR**, que controla `tracking.js`. Sin él, la ISS ocupa unos 0,15 px desde la distancia actual de `TRACK_VIEW_FROM_LEO`, que es de unos 726 km.
4. Actitud **por activo**: la ISS usa `lvlh-nominal`; el CubeSat usa `desconocida-ilustrativa`. Siempre va rotulada, sin números ni cuaterniones.
5. Unas **7,5 jornadas** (Hubble suma ~0,5). Eclipse en el modelo, huella, pases, vista desde órbita, yaw-steering, GNSS y Starlink pasan a P4.1 o P5.

## 2. Qué se mantiene y qué cambia respecto al plan vigente

| Tema                                 | Plan vigente                                               | Decisión P4                                                                     |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Autoridad de posición                | SGP4                                                       | **Se mantiene**                                                                 |
| Dueño de cámara, tracking y contexto | Capa satelital                                             | **Se mantiene**. `models.js` queda subordinado y sin cámara                     |
| Registro canónico                    | `elements.js` para TLE/OMM                                 | **Se mantiene**, más `classifyElementAge` por régimen                           |
| Precedencia de modelos               | specific > family > generic > null                         | **Cambia**: no hay activo `generic` (se resuelve a null y queda el punto)       |
| Tope de modelos                      | 2 contando pendientes                                      | **Se mantiene** en perfil `std`. `low` = 1, `off` = 0                           |
| LOD                                  | Bandas de distancia a calibrar                             | **Cambia** a píxeles proyectados, con histéresis                                |
| Escala                               | Sin especificar                                            | **Real**, `minimumPixelSize = 0`                                                |
| Pick                                 | `allowPicking:false`                                       | **Se mantiene**, con una guarda de huella en `interaction.js`                   |
| Pose                                 | Una sola, `velocity-aligned`                               | **Cambia** a modos por activo, rotulados                                        |
| Familia CubeSat                      | Resuelta por grupo, en el test con `families:['stations']` | **Cambia**: se añade el grupo `cubesat`; nunca por `stations` ni por nombre     |
| Órbita caduca                        | No definido                                                | **Se oculta el modelo**; queda el punto con el rótulo «órbita caduca»           |
| Arnés                                | `npm run preview --port 4199` (contradice CLAUDE.md)       | **Cambia**: se usa el servidor vivo `127.0.0.1:4204`, comprobado antes con curl |
| Matriz de aceptación                 | P4-01..P4-15                                               | **Se mantiene** y se amplía (sección 9)                                         |

## 3. Catálogo de modelos

Todos vienen de `github.com/nasa/NASA-3D-Resources`, fijado en la revisión `11ebb4ee043715aefbba6aeec8a61746fad67fa7`. Los términos son los de las guías de medios de NASA: sin logos ni insignias, sin sugerir respaldo y con el crédito «Source: NASA 3D Resources». La licencia MIT del repositorio **no** cubre estos activos. Los bytes y hashes de abajo son **candidatos** y se vuelven a medir en T0.

| Activo                | Nivel    | Aplicación                                          | Candidato                                                                                                                    | Estado                                   |
| --------------------- | -------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| ISS                   | specific | NORAD 25544                                         | `International Space Station (ISS) (A).glb` (39.708 B, sha `70d0619a…`), o la versión (B) (476.992 B) si pasa el presupuesto | **P4**                                   |
| CubeSat 1U            | family   | Solo los NORAD del grupo `cubesat`                  | `CubeSat - 1 RU Generic.glb` (149.424 B, sha `bae308ea…1e85`)                                                                | **P4**                                   |
| Hubble                | specific | NORAD 20580 (grupo `visual`, verificado 2026-09-24) | `Hubble Space Telescope (A).glb` (1.694.988 B)                                                                               | **P4** (decisión de Alex 2026-09-24)     |
| GPS, Galileo, GLONASS | family   | —                                                   | Sin fuente con licencia clara                                                                                                | Solo punto; **P4.1** si aparece licencia |
| TDRS, GOES (GEO)      | specific | NORAD por verificar en SATCAT                       | Candidatos NASA                                                                                                              | **P4.1**                                 |
| Starlink (dense)      | —        | —                                                   | Sin fuente abierta                                                                                                           | Nunca en P4; siempre punto               |

**Descarte explícito:** `3D Models/Galileo/Galileo.glb`, que según la propuesta A es la sonda enviada a Júpiter y no el GNSS. Hay que confirmarlo en T0; no lo verifiqué desde el repo. Tampoco se usan mallas generadas por IA ni procedurales.

**Registro de cada activo.** Se guarda en `public/models/satellites/manifest.json`, en `docs/eyeinsky/p4/ASSET-LEDGER.md` y en `docs/eyeinsky/planning/asset-manifest.json` y `sources-ledger.json`. Además va una sección nueva en `public/models/README.md`, que hoy solo cubre aeronaves y barcos con CC BY 4.0.

Campos por activo: `id`, `uri` con hash, nombrado `<id>-<sha8>.glb` (p. ej. `iss-70d0619a.glb`; `<id>` es el slug corto del activo, no el `id` del manifiesto, y `<sha8>` son los 8 primeros hex del SHA-256), `fidelity`, `noradIds` o `families`, `scaleMeters`, `forwardAxis`, `upAxis`, `radiusM`, `triangles`, `primitives`, `textureMaxEdge`, `bytes`, `sha256`, `sourceUrl`, `sourceRevision`, `termsUrl`, `credit` y `verifiedAt`.

## 4. Arquitectura

- **Módulos nuevos**, todos puros salvo `models.js`, dentro de `src/layers/satellites/`:
  - `elements.js`: `parseSatelliteElements`, `normalizeNoradId`, `elementEpochMs` y `classifyElementAge`.
  - `modelRegistry.js`: `resolveSatelliteModel`, con la precedencia y la validación del descriptor.
  - `modelLod.js`: `projectedDiameterPx` y `classifyModelBand`.
  - `modelBudget.js`: perfiles `std`, `low` y `off`.
  - `attitude.js`: construye la matriz o el cuaternión de pose, o devuelve null.
  - `models.js`: `createSatelliteModels` con `reconcile`, `release`, `screenHit`, `getStats` y `destroy`, y el cargador inyectado.
- **Módulos modificados:**
  - `policy.js`: constantes `SAT_MODEL_*` y el grupo `cubesat` en `CATALOG_GROUPS`.
  - `source.js`: `GROUPS` y el formato.
  - `ingestion.js`: pasa a usar registros canónicos.
  - `catalog.js:116` y `orbits.js:227`: dejan de usar `Number(satrec.satnum)`.
  - `orbits.js`: nueva `propagateStateEcef` con posición y dirección de velocidad, porque `propagatePosition` solo devuelve `speedMps`.
  - `tracking.js`: `_setTrackedFraming('orbit'|'inspect')`, precarga dentro de `_trackSatellite`, y `normalizeNoradId` sustituye a `_normalizeTrackedNorad`.
  - `interaction.js`: la guarda de huella.
  - `rendering.js`: `_preRenderTick`.
  - Además `lifecycle.js`, `state.js` e `index.js`.
- **Patrón que se reutiliza de `src/layers/flights/rendering.js`** (`_ensureModel`, `_releaseModel`):
  - la admisión cuenta la carga **antes** del `await`;
  - después del `await` se comprueban la época del lifecycle, la generación por NORAD y `_catalogRevision`, y la carga tardía se destruye;
  - tras `TRACKED_MODEL_MAX_LOAD_FAILS = 3` fallos (`flights/policy.js`) la URI queda vetada;
  - no hay `requestAnimationFrame` nuevo: todo entra por `_preRenderTick`.
- **Pose del modelo seguido:** sale de `_trackedFrameCartesian` / `_getTrackedFramePosition`, la misma muestra que usan el punto y la cámara, así que no hay jitter entre ellos. El modelo secundario se propaga en cada frame y escribe también la posición de su punto.
- **Proveedor:**
  - `celestrakGpUrl(group,{format})` en `src/data/spaceProviderRequests.js`;
  - en `server/providers/space/celestrak.js`, la caché y el single-flight usan la clave `${group}:${format}` y se añade la cabecera `x-tle-fetched-at`;
  - se mantiene el TTL de 6 h;
  - OMM JSON para los grupos núcleo; TLE para Starlink.
- **Fronteras:** los módulos nuevos se declaran en `scripts/package-boundaries.json` (satellites-layer). `tracking.js` tiene hoy 535 líneas: la lógica pura va en módulos aparte para no pasar de 800.

## 5. LOD y presupuesto

La métrica es `projectedDiameterPx = 2·radiusM·viewportHeightPx / (2·distanceM·tan(fovy/2))`. El `radiusM` es el medido en T0. Ejemplo: la ISS vista a 10 km en 1080 px con 60° ocupa unos 10 px.

| Caso                    | ADD     | KEEP (histéresis) | Techo                 |
| ----------------------- | ------- | ----------------- | --------------------- |
| Seguido                 | ≥ 6 px  | hasta < 3 px      | —                     |
| Secundario (no seguido) | ≥ 16 px | hasta < 10 px     | ADD 25 km, KEEP 30 km |

- **Ritmos:**
  - reconcile cada 250 ms (`SAT_MODEL_RECONCILE_MS`);
  - pose en cada frame, solo para los modelos admitidos (2 como máximo);
  - la evicción espera 2 s (`SAT_MODEL_EVICT_DEBOUNCE_MS`), salvo cambio de objetivo, disable o destroy, que evictan en el acto.
- **Perfiles**, en `modelBudget.js` y seleccionables con `?satModels=std|low|off`:

| Perfil                                                 | Tope (activos + pendientes) | Triángulos por modelo | Primitivas | Texturas  | Memoria de GPU                      | Silueta                    |
| ------------------------------------------------------ | --------------------------- | --------------------- | ---------- | --------- | ----------------------------------- | -------------------------- |
| `std` (escritorio, GPD)                                | 2                           | ≤ 60k                 | ≤ 12       | ≤ 1024 px | ≤ 6 MB por modelo, ≤ 10 MB en total | 1 px cian, solo el seguido |
| `low` (`pointer: coarse`, ≤ 650 px o deviceMemory ≤ 4) | 1, solo el seguido          | ≤ 30k                 | ≤ 8        | ≤ 512 px  | ≤ 2 MB                              | No                         |
| `off`                                                  | 0                           | —                     | —          | —         | —                                   | —                          |

- **Nunca reciben modelo:** el grupo `dense`, los `_dockedCompanions` (`DOCKED_COMPANION_RADIUS_M = 2000`) y los satélites con órbita caduca.
- **Carga:** `Cesium.Model.fromGltfAsync` con `shadows: ShadowMode.DISABLED`, colores PBR originales **sin tinte MIX** y `minimumPixelSize: 0`. Ni Draco ni KTX2 ni instancing.
- **Calibración en T7:** en la GPD física se compara `off` frente a `auto` en la misma sesión. Criterio: 2 o menos altas y evicciones por minuto durante 60 s de órbita manual. Cada umbral ajustado se anota en `policy.js` junto a la ruta de su evidencia. Si la línea base de la GPD en la escena A ya es mala, el perfil por defecto baja a `low`.

## 6. Actitud aproximada

SGP4 no da actitud. `attitude.js` recibe r y v en ECEF, de la misma muestra SGP4, y los ejes del descriptor. Si la base es degenerada (|v| cercano a 0, v paralela a r o NaN), devuelve null: se usa la orientación neutral ENU (`Transforms.eastNorthUpToFixedFrame`) y la posición nunca se bloquea.

| Modo                      | Activos                     | Ley                                                                       | Rótulo en la UI                                     | Valor en contexto y voz          |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------- |
| `lvlh-nominal`            | ISS                         | z = −r̂ (nadir), y = −normalize(r×v), x = y×z (aproximadamente +velocidad) | «ACTITUD: LVLH nominal (aproximada, no telemetría)» | `attitude: 'lvlh-nominal-aprox'` |
| `desconocida-ilustrativa` | CubeSat (y Hubble si entra) | Fija en marco inercial, sin animación                                     | «ACTITUD: desconocida · orientación ilustrativa»    | `attitude: 'desconocida'`        |

- Queda prohibido articular paneles o antenas y mostrar ángulos o cuaterniones. Un test en `eyeinskyDossierSources.test.mjs` lo impide.
- Pasan a P4.1: `yaw-steering` (GNSS) y `sun-pointing` por nodo.
- **Luz, a verificar en T0:** `src/app/viewer.js` crea el Viewer con `animation:false` y no fija `shouldAnimate`, así que el sol de `scene.light` puede estar congelado respecto a SGP4. P4 **no** toma la propiedad de `scene.light`. El eclipse (Simon1994, patrón de `celestialRing.js::_updateEphemeris`) y `enableLighting`, que hoy no se usa, pasan a P5 o P4.1.

## 7. UX: Mission Dock y móvil

- **Acción `inspect`** («INSPECCIONAR» / «ÓRBITA») en `resolveMissionDockActions` (`eyeinskyMissionDockModel.js`):
  - Si no hay modelo resuelto, aparece deshabilitada con el motivo «Sin modelo curado: solo punto».
  - Al pulsarla, `tracking.js` cambia `viewFrom` a la dirección de `TRACK_VIEW_FROM_LEO` escalada a clamp(8·radiusM, 30 m, 5 km).
  - Con reduced-motion el cambio es instantáneo.
  - Rueda, arrastre o pellizco siguen usando `_releaseCameraOwnership`, y SEGUIR (`_refocusTracked`) recupera el encuadre.
- **Paso del punto al modelo:** una función pura `resolvePointModelHandoff({modelReady, modelPx, reducedMotion})`. Cuando el modelo supera los 24 px, el punto amarillo de 14 px con `disableDepthTestDistance` se convierte en una retícula de 4 px con alfa 0,5. **No se quita el point**, porque la cámara necesita su bounding sphere.
- **Pick:** `models.screenHit(click.position)` proyecta la esfera del modelo a pantalla, con un radio mínimo de 12 px, o 24 px con puntero táctil. Si el clic cae dentro, no se deselecciona. Un pick sobre otro satélite sigue cambiando de objetivo. Proyección a pantalla: `SceneTransforms.worldToWindowCoordinates` (**verificar** el nombre exacto en Cesium 1.138).
- **Expediente:**
  - Campos planos: `elementFormat`, `elementEpoch`, `elementAge` (vigente, envejecida, caducada o futura), `fetchedAt`, `cacheStatus`, `geometryFidelity`, `attitude` y `visualScale: 'real'`.
  - `FIELD_LABELS` en español, sin cambiar las claves que consume la voz.
  - Nuevo estado `predicted`, «Posición calculada (SGP4)», que sustituye a «La fuente no informa la hora» (`eyeinskyDossier.js:27`, `eyeinskyMissionDock.js:27`).
  - `contextFromRecord` corta en 12 campos (`eyeinskyDossierModel.js:215`); un test comprueba que no se pierde ninguno.
- **Chips monoespaciados:**
  - MODELO: ESPECÍFICO · NASA / FAMILIA CUBESAT 1U / SIN MODELO — punto SGP4
  - ESCALA REAL
  - ACT. APROX.
  - ÉPOCA · edad
  - CACHÉ
  - MODELO NO DISPONIBLE (tras 404 o GLB corrupto; se conservan punto, órbita, cámara y expediente)
- **Crédito:** «Source: NASA 3D Resources» en atribuciones mientras haya un modelo activo.
- **Móvil (≤ 650 px o puntero táctil):** perfil `low` con 1 modelo; el rail compacto muestra «ALT · ÉPOCA · MODELO»; INSPECCIONAR es un objetivo de 44 px o más; zoom al 200 % y 5 viewports siguen operativos.

## 8. Plan de tareas TDD (unas 7 jornadas)

0. **T0, línea base y curación (0,75 j).**
   - `npm ci` y gates base.
   - `scripts/eyeinsky-glb-inspect.mjs` sin dependencias, con su test RED sobre un GLB sintético.
   - Descargar a scratch ISS (A) y (B), CubeSat 1U y Hubble (A) (los tres primeros y Hubble ya verificados por hash el 2026-09-24); medir bytes, SHA, bbox frente a la dimensión real, triángulos, primitivas, texturas y ejes.
   - Confirmar que existe el grupo `cubesat` y cuántos satélites añade, que NORAD 20580 está en `visual`, y el estado de `shouldAnimate` y `scene.light`.
   - Escribir el manifiesto y los ledgers.
   - Línea base de rendimiento en la GPD (escena A) con renderer, TDP y fuente de alimentación leídos en solo lectura con gpd-forge, guardada en `output/eyeinsky-p4/baseline/`.
1. **T1, elementos (1 j).**
   - RED en `elements.test.mjs`: OMM con NORAD de 6 dígitos, decimales rechazados, NaN de Alpha-5 en **`ingestion.js:111`, `catalog.js:116` y `orbits.js:227`**, época OMM y TLE, `classifyElementAge` para LEO y MEO/GEO, y STALE-ERROR conservado.
   - GREEN: `elements.js`, `celestrakGpUrl`, clave `group:format` en el proxy, `source.js` con formato e `ingestion.js` con registros canónicos.
   - Regresión: `spaceProviders.test.mjs` y `source.test.mjs`.
2. **T2, registro y grupo cubesat (0,5 j).**
   - RED en `modelRegistry.test.mjs`: precedencia, nunca por nombre, URI no local, SHA inválido, ejes contradictorios, presupuesto excedido; `cubesat` en `CATALOG_GROUPS`, `GROUPS`, `satelliteClass.js` y `POINT_STYLES`, y la deduplicación no quita a la ISS su grupo.
   - GREEN y `package-boundaries.json`.
3. **T3, módulos puros (0,75 j).**
   - RED en `modelLod.test.mjs` (la ISS a 10 km da unos 10 px; histéresis) y `modelBudget.test.mjs` (perfiles y override).
   - RED en `attitude.test.mjs`: base LVLH ortonormal con tolerancia 1e-6, el caso degenerado devuelve null, el modo ilustrativo es estable.
   - GREEN, y `propagateStateEcef` en `orbits.js`.
4. **T4, `models.js` e integración (1,25 j).**
   - RED en `models.test.mjs` con cargador inyectado: el tope cuenta pendientes; prioridad del seguido; sin thrashing; A→B invalida la carga tardía de A; 404 o GLB corrupto conservan el punto; veto tras 3 fallos; exclusión de `dense`, acoplados y órbitas caducas; destroy deja active = 0 y pending = 0.
   - GREEN integrado en `_preRenderTick`, `lifecycle`, `state` e `index`.
   - Regresión: `satellitesVisibility.test.mjs` y `satellitesTrackedRefresh.test.mjs`.
5. **T5, inspección, pick y Dock (1 j).**
   - RED:
     - `_setTrackedFraming('inspect')` cambia `viewFrom` sin cambiar el NORAD ni el contexto;
     - reasignar `trackedEntity` no dispara el auto-untrack de `trackedEntityChanged`;
     - la precarga ocurre dentro de `_trackSatellite`;
     - `screenHit` no deselecciona;
     - la acción `inspect` aparece habilitada o deshabilitada según el modelo;
     - `resolvePointModelHandoff` se comporta bien con y sin reduced-motion.
   - GREEN.
6. **T6, expediente honesto (0,75 j).** RED en `eyeinskyDossierSources.test.mjs` y `eyeinskyDossierModel.test.mjs`: los 12 campos exactos, estado `predicted`, época distinta de `fetchedAt`, sin cuaterniones. GREEN, con chips, crédito y rail compacto en `eyeinsky.css`.
7. **T7, arneses, rendimiento y cierre (1 j).**
   - `scripts/eyeinsky-p4.mjs <url> <out>` rechaza una salida que ya tenga `result.json`. Recorrido:
     - fixture OMM 123456;
     - pick real con puntero, registrando coordenadas, owner y NORAD;
     - INSPECCIONAR sobre la ISS y sobre un CubeSat;
     - clic sobre el casco sin deseleccionar;
     - active + pending ≤ 2 en todo momento;
     - A→B con evicción;
     - 404 y GLB corrupto;
     - órbita caduca;
     - caída de la fuente;
     - reduced-motion, 5 viewports y zoom al 200 %;
     - un GNSS sin modelo.
   - `scripts/eyeinsky-p4-perf.mjs` sobre `sample()` de `eyeinsky-p012-performance.mjs`, escenas A–E en `off` y `auto`, en la GPD. `commandList` y `model.statistics` son privadas: se detectan antes de usarlas y, si faltan, se registran como «no medido».
   - Gates: build, doctor, format:check, check:boundaries y test. Arneses p3, p31, p012, camera-adverse, p012-cockpit y smoke contra el servidor 4204.
   - Revisión independiente. Actualizar `FASES.md` y `EYEINSKY-SESSION.md`. Formato mecánico en un commit aparte. Sin deploy.

## 9. Matriz de aceptación

Se mantienen **P4-01 a P4-15** del plan vigente, con dos cambios:

- **P4-06:** la precedencia pasa a ser `specific > family > null`.
- **P4-08:** el tope es por perfil (`std` 2 / `low` 1 / `off` 0).

Se añaden:

- **P4-16:** con INSPECCIONAR la ISS es visible a escala real (`minimumPixelSize = 0`); ÓRBITA vuelve a `TRACK_VIEW_FROM_LEO` sin cambiar el NORAD.
- **P4-17:** un clic sobre el casco del modelo seguido no deselecciona ni reinicia la cámara, probado con un evento de puntero real.
- **P4-18:** la familia CubeSat solo se aplica a miembros del grupo `cubesat`; nunca a `stations` ni por nombre.
- **P4-19:** los NORAD Alpha-5 o de 6 dígitos no producen NaN en `ingestion`, `catalog` ni `orbits`.
- **P4-20:** con órbita caduca no hay modelo, el punto sigue y aparece el rótulo; si falla SGP4 se muestra «propagación falló», no la última pose.
- **P4-21:** actitud por activo rotulada; ningún número de actitud en el contexto ni en la voz.
- **P4-22:** los 12 campos de `contextFromRecord` se conservan; aparecen el estado `predicted` y las etiquetas en español.
- **P4-23:** `dense` y `_dockedCompanions` nunca reciben modelo.
- **P4-24:** la escena E (después de destroy) vuelve a los comandos y la memoria de A-off. La escena A con modelos activos no cambia frente a `off`.
- **P4-25:** activos con hash en el nombre, registrados en los cuatro ledgers y en `public/models/README.md`.

## 10. Riesgos y qué NO haremos

**Riesgos:**

- Escala o ejes de los GLB NASA sin documentar. Si el inspector de T0 falla, se detiene la curación y el satélite se queda en punto.
- El grupo `cubesat` puede no existir o crecer demasiado. En ese caso la familia se declara sin asignación.
- Jitter o near plane a 30 m–5 km de un objeto a unos 6.700 km del centro de la Tierra. Se mide en las escenas C y D; si aparece, se sube el mínimo del clamp.
- Tirones por compilación de shaders en una GPU integrada. Se mitiga con la precarga y se mide con longtask.
- Una pose LVLH convincente puede leerse como real. Se mitiga con el rótulo permanente y el test que prohíbe números.
- Las mediciones de la GPD varían con TDP, batería y temperatura. Se fijan y se registran.
- Los umbrales de rendimiento de B (+2 ms en p95, etc.) son **provisionales** hasta tener la línea base.
- El proxy de producción (rama `eyeinsky/production-runtime`) debe montar el mismo `celestrak.js`. Se verifica sin desplegar.

**Qué no haremos:**

- modelos para Starlink ni para todos los puntos;
- instancing, Draco, KTX2, CustomShader o sombras;
- activos genéricos o hechos con IA;
- el Galileo.glb de NASA;
- tinte MIX sobre los PBR;
- inflar la escala sin rótulo;
- eclipse, terminador o `enableLighting` (pasan a P5/P4.1);
- huella, pases, vista desde órbita, yaw-steering o paneles articulados (pasan a P4.1);
- afirmar FPS absolutos o usar SwiftShader como evidencia de GPU;
- iniciar la fase sin una orden de Alex, o desplegar.

---

Límite de esta propuesta: lo comprobé contra el worktree `C:/Users/Alex/orca/eyeinsky-p4`. Los tres usos de `Number(satrec.satnum)`, el `allowPicking:false` de `rendering.js:72`, la matriz P4-01..15 y el uso de `fromGltfAsync` en flights salen de ahí. Los tamaños y la identidad de los GLB NASA vienen de las propuestas y se vuelven a medir en T0.
