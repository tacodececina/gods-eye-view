# P4 · T0 — Hallazgos verificados (2026-09-24)

Comprobado en el worktree `C:/Users/Alex/orca/eyeinsky-p4` (rama
`eyeinsky/p4-satellites-3d`, base `2bf513f`) y en el Vite vivo
`http://127.0.0.1:4204/`, con Cesium 1.138.0 y satellite.js 6.0.2. Solo se
lee; en T0 no se cambia código de producto.

## (a) Reloj e iluminación: `src/app/viewer.js`

- `createApplicationViewer` crea el `Cesium.Viewer` con `animation: false` y
  `timeline: false` (líneas 7–23).
  - **No** pasa `shouldAnimate` ni toca `scene.light`, `globe.enableLighting` ni
    la iluminación basada en imagen.
  - `globe.show = false` (línea 26).
  - Nada en `src/` asigna `clock.shouldAnimate`, `clock.currentTime`,
    `scene.light` ni `enableLighting` (búsqueda en todo `src/`, sin tests).
- En Cesium, `shouldAnimate` vale `false` por defecto:
  - `@cesium/widgets/Source/Viewer/Viewer.js:293` lo documenta y `:485` lo
    reenvía;
  - `@cesium/engine/Source/Core/Clock.js:139` usa `options.shouldAnimate ??
false`;
  - `Clock.prototype.tick` (`:258`) solo avanza si `canAnimate &&
_shouldAnimate` (`:262`).

  **`clock.currentTime` queda congelado en el instante en que se creó el
  Viewer.** El comentario de `src/cameraVerbs.js:1081` ya lo reconoce, y por eso
  esa cámara mide con `performance.now()`.

- `scene.light` es el `SunLight` por defecto (`Scene.js:762`). Su dirección sale
  de `frameState.time`, que es el tiempo del reloj (`Scene.js:1971`), a través
  de `UniformState.setSunAndMoonDirections` (`UniformState.js:1322-1335`, con
  Simon1994 e ICRF→ECEF).
- **Qué implica para el modelo:**
  - el sol que ilumina los GLB PBR queda fijo en el instante de carga de la
    página;
  - la posición SGP4, en cambio, usa el reloj de pared: `new Date()` o
    `Date.now()` en `catalog.js`, `ingestion.js`, `orbits.js`, `rendering.js`
    y `tracking.js`;
  - en el marco terrestre la dirección del sol gira unos 15° por hora, así que
    tras N horas de sesión la luz del modelo va unos 15·N° desfasada respecto al
    sol real;
  - con la sesión recién abierta el error es despreciable;
  - el lado día/noche de la ISS no es fiable y no se debe afirmar (el eclipse
    queda fuera de P4).
- **Decisión que se mantiene (propuesta §6):** P4 no toma la propiedad de
  `scene.light` ni de `shouldAnimate`. El eclipse, el terminador y
  `enableLighting` pasan a P4.1/P5.
  - Si se quisiera una luz coherente, habría que animar el reloj o fijar
    `clock.currentTime` en cada frame, y eso cambia a todos los consumidores de
    `clock.currentTime` (`trackedCamera.js:197,211`, `flights/motion.js:347`,
    `military/motion.js:253`, `cockpitCamera.js:65`).
  - Esa decisión es de fase propia.

## (b) `Number(satrec.satnum)`: tres usos

| Archivo                              | Línea | Código                                   | Qué pasa después                                                       |
| ------------------------------------ | ----- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `src/layers/satellites/ingestion.js` | 111   | `const noradId = Number(satrec.satnum);` | `seen.has(noradId)` / `seen.add(noradId)` para deduplicar              |
| `src/layers/satellites/catalog.js`   | 116   | `const noradId = Number(satrec.satnum);` | `layerState._catalog.has(noradId)`: el catálogo núcleo tiene prioridad |
| `src/layers/satellites/orbits.js`    | 227   | `noradId: Number(satrec.satnum),`        | Campo del registro que devuelve la propagación                         |

Sonda con satellite.js 6.0.2: `twoline2satrec` devuelve `satnum` como
**cadena**.

- `"25544"` pasa a `25544`.
- Un Alpha-5 (`"T0002"`) pasa a `NaN`, con `satrec.error === 0`, así que el
  TLE es válido.
- `Set` y `Map` tratan todos los `NaN` como la misma clave (SameValueZero):
  `new Set([NaN, NaN]).size === 1`.
- En consecuencia, con más de un Alpha-5, `ingestion.js` se queda con el primero
  y descarta el resto en silencio. `catalog.js` hace lo mismo con el catálogo.
- Hoy no hay NORAD de 6 dígitos en `cubesat` (83 objetos, 0 ≥ 100000), pero el
  riesgo es real al crecer el catálogo. Lo cubre T1 (P4-19).

## (c) Cómo monta `src/layers/flights/rendering.js` los GLB

Hay dos rutas, y las dos usan `Cesium.Model.fromGltfAsync`:

- **Flota (`_ensureModel`, líneas 488–595).** Opciones en 517–531:
  - `url: resolveAsset(spec.url)`, `asynchronous: false`;
  - `minimumPixelSize: MODEL_MIN_PX`, `scale: spec.scale`;
  - `color` con `colorBlendMode: MIX` y `colorBlendAmount`;
  - `customShader` IR opcional;
  - `id: icao24` para el pick.
- **Seguido (líneas 723–737).** Las mismas opciones, con `TRACKED_MODEL_MIN_PX`,
  `Color.CYAN` y `id` del seguido. La promesa se descarta si cambió
  `_trackedModelGen` o se destruyó la colección.

Patrón que se reutiliza tal cual en `models.js`:

- **Admisión.** Se cuentan los pendientes (`_models.size + _modelPending.size >=
cap`) **antes** del `await`. Se capturan `epoch` (`_modelEpoch`) y `gen`
  (`_modelGen` por id).
- **Tras el `await`:**
  - si la época es de otro ciclo de vida, se ejecuta `model.destroy()` sin tocar
    el estado;
  - si hay `stale` (cambió la generación, el régimen está inactivo, la colección
    está destruida, ya existe o el tope está lleno), se destruye y se ejecuta
    `_cleanupModelGen`;
  - en el `catch`, se vuelve al billboard y se limpia el pendiente solo si la
    época sigue vigente.
- **Admitido:**
  - `model.id` explícito;
  - `model.show = false` hasta que tenga matriz, para evitar un frame en el
    centro de la Tierra;
  - `_modelCollection.add(model)`.
- **Liberación.** `_releaseModel` (597–625) sube la generación solo si hay modelo
  o pendiente. Deja el pendiente para que su propio post-`await` lo rechace.
  `_cleanupModelGen` (630–636) mantiene acotado el mapa.
- **Contexto:**
  - la colección es una `Cesium.PrimitiveCollection` creada en
    `flights/lifecycle.js:54-55`;
  - la pose se escribe sobre el `modelMatrix` propio del modelo (`_modelMatrix`,
    línea 257), sin compartir matriz entre modelos;
  - el veto por fallos usa `TRACKED_MODEL_MAX_LOAD_FAILS = 3`
    (`flights/policy.js:293`);
  - `resolveAsset` por defecto antepone `import.meta.env.BASE_URL`
    (`src/app/layers/flights.js:20-21`).
- **Lo que no se reutiliza (propuesta §5):**
  - el tinte `ColorBlendMode.MIX` y el `customShader`;
  - `minimumPixelSize` distinto de 0, porque P4 usa escala real y
    `minimumPixelSize: 0`.

  Además P4 añade `shadows: ShadowMode.DISABLED`.

- **Nuevo en P4:** los GLB satelitales exigen **Draco**, y ninguno de los aviones
  lo usa (el inspector lo confirma sobre `public/models/*.glb`). Cesium lo
  decodifica en workers y compite con la fotogrametría por esa capacidad (ver
  `public/models/README.md`, fila `airplane.glb`). El impacto se mide en T7.

## (d) Proxy CelesTrak: `server/providers/space/celestrak.js`

**No acepta `FORMAT=json` hoy.**

- La ruta toma solo el grupo: `req.url.replace(/^\//,'').split('?')[0]`
  (líneas 71–73). La query se descarta.
- La URL de origen es fija: `celestrakTleUrl(group)` en
  `src/data/spaceProviderRequests.js:2-7` pone `FORMAT=tle`.
- La respuesta de origen se valida con `/^1 /m` (línea 65). Una respuesta JSON se
  rechazaría como «no TLE lines».
- La caché en memoria y en disco (`.gev-cache/celestrak-<group>.json`) y el
  single-flight usan como clave **solo el grupo**. No hay cabecera
  `x-tle-fetched-at`.
- Prueba viva:

  ```text
  curl -D - "http://127.0.0.1:4204/api/celestrak/stations?FORMAT=json"
  → 200, Content-Type: text/plain, x-tle-cache: HIT, cuerpo TLE ("ISS (ZARYA)" / "1 25544U ...").
  ```

- El grupo `cubesat` ya funciona por el proxy: `/api/celestrak/cubesat` devolvió 200. Ese acceso creó `.gev-cache/celestrak-cubesat.json`, que está ignorado
  por git.
- Pendiente para T1, como dice la propuesta §4: `celestrakGpUrl(group,{format})`,
  clave `${group}:${format}`, validación por formato y cabecera
  `x-tle-fetched-at`.
- Datos de origen verificados el 2026-09-24 con FORMAT=json directo a
  celestrak.org:
  - `cubesat`: 83 objetos, 0 con NORAD de 6 dígitos;
  - `visual`: 156 objetos, con HST 20580 e ISS 25544;
  - `stations`: 22 objetos, con ISS 25544 y sin HST.

## (e) Vite sirve `public/models`

- `server/standalone/eyeinsky.vite.config.js` usa `createBrowserViteConfig`
  (`build/vite.js`). Esa función solo pasa `publicDir` si se le indica, así que
  rige el valor por defecto de Vite: `public/` de la raíz.
- En vivo contra `http://127.0.0.1:4204/`:

  ```text
  /models/satellites/manifest.json        → 200 application/json, 3642 B, 3 entradas
  /models/satellites/iss-70d0619a.glb     → 200 model/gltf-binary, 39708 B, sha256 70d0619a…
  /models/satellites/hubble-e5ba4de1.glb  → 200 model/gltf-binary, 1694988 B, sha256 e5ba4de1…
  /models/satellites/cubesat-1u-bae308ea.glb → 200 model/gltf-binary, 149424 B, sha256 bae308ea…
  ```

- `npm run build` copia la carpeta a `dist/models/satellites/` (ver la salida de
  los gates).

## Decisiones (Alex/KRÓNOS, 2026-09-24)

Registradas también en el campo `budget` de
`public/models/satellites/manifest.json` (`decision`, `rationale`, `draco`,
`axes`). Los excesos se siguen mostrando (`ok: false`); la decisión no los
oculta.

1. **(a) Draco aceptado** para los tres activos. Cesium 1.138.0 incluye el
   decodificador (`draco_decoder.wasm` en `@cesium/engine/Source/ThirdParty/`)
   y la CSP de producción (`deploy/nginx/security-headers.conf`) permite
   `'wasm-unsafe-eval'` y workers `blob:`. El impacto de los workers de Draco
   frente a la fotogrametría se mide en T7. No se transforma ningún GLB.
2. **(b) Hubble:** excepción de memoria en el perfil `std` (unos 13,4 MB
   estimados, casi todo texturas: 4 × 512×1024 y 1 × 512×512). En el perfil
   `low`, Hubble **no** recibe modelo: se queda en punto.
3. **(c) CubeSat 1U:** se aceptan sus 18 primitivas (1,84 MB estimados, 23.570
   triángulos) en `std` y en `low`.
4. **(d) Ejes.** Los valores `upAxis +Y` / `forwardAxis +Z` del manifiesto son
   los de glTF. `Cesium.Model` los corrige con
   `ModelUtility.getAxisCorrectionMatrix` (`Y_UP_TO_Z_UP` y después
   `Z_UP_TO_X_UP`), así que en el marco local del modelo quedan **+Z arriba y
   +X adelante**. La ley LVLH de T3 debe mapear sobre ese marco ya convertido,
   no sobre los ejes glTF.
5. **(e) Nomenclatura definitiva:** `<id>-<sha8>.glb` (p. ej.
   `iss-70d0619a.glb`, `hubble-e5ba4de1.glb`, `cubesat-1u-bae308ea.glb`).
   `<id>` es el slug corto del activo (no el `id` del manifiesto, que lleva el
   prefijo `nasa-`) y `<sha8>` son los 8 primeros hex del SHA-256 del archivo
   publicado. Corregida la propuesta §3, que decía
   `iss-a.70d0619a.glb`.

Siguen abiertos:

- **Escala del CubeSat** tomada de la arista del cuerpo (0,10 m) y no de la
  dimensión mayor, que son las antenas. Incertidumbre de alrededor del 10 %.
- **Signo de la marcha de la ISS** (+Z glTF, +X tras la corrección de Cesium)
  sin verificar visualmente (T3/T5).
- **Crédito «Source: NASA 3D Resources» en la UI: va en T6.** No se añade a
  `DATA_CREDITS` de `src/data/dataCredits.js`: esa lista es de datos,
  siempre activa y copiada de `DATA_SOURCES.md`, que remite los créditos de
  modelos a `public/models/README.md`. Las condiciones de NASA piden el crédito
  mientras haya un modelo activo, así que T6 lo registra con
  `registerDynamicCredit` al cargar el primer modelo satelital (mismo patrón
  que `TOMTOM_CREDIT`).

## Límites honestos

- No se midió el rendimiento ni se hizo la línea base en la GPD, ni se cargó
  ningún GLB satelital en Cesium dentro del navegador. Eso queda para T4/T7.
- La GPU estimada es aritmética (RGBA8 + mipmaps), no una lectura de
  `model.statistics`.
- El descarte de `Galileo.glb` no se verificó.
- `scripts/eyeinsky-glb-inspect.test.mjs` vive en `scripts/`, como pide T0.
  `npm test` recorre ahora `src/**/*.test.mjs` y también `scripts/*.test.mjs`
  (solo primer nivel; `scripts/fixtures/` queda fuera), así que la suite del
  inspector corre en los gates. Cubre la ruta `accessor-corners` con un GLB
  Draco sintético y con `public/models/satellites/iss-70d0619a.glb`.
