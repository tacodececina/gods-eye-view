# Propuesta P5: Tierra–Luna (2026-09-25)

- **Base:** worktree `eyeinsky-p5` en `e3e268e` (P0–P4 integradas), Cesium 1.138.0.
- **Evidencia (no versionada):** `output/eyeinsky-p5/{ephemeris-eval,code-probe,scene-perf}/`.
- Lo marcado **(verificar)** no está comprobado.
- **Aprobada por Alex el 2026-09-25.** Decisiones: fuera de rango → respaldo con astronomy-engine `GeoMoon` rotulado «modelo analítico ≤20 km» (opción b; barrido 2021–2040 contra DE441: máx 16,07 km); textura NASA SVS CGI Moon Kit 1k/2k con ledger verificado; placeholder gris hasta entonces.

## 1. Decisión recomendada

1. **La Luna sale de una tabla Chebyshev generada desde JPL Horizons DE441.** Pesa unos 118 KB, se carga en diferido y su error medido es de 0,02 km. Simon1994 queda prohibido para la Luna, como ya decidió P0.
2. **Hay un solo reloj: `viewer.clock`**, gobernado por `src/time/sceneClock.js`. Luna, Sol, luz, anillo y rótulos usan el mismo `JulianDate`, que es `frameState.time`.
3. **El paso ICRF→ECEF siempre usa `Transforms.preloadIcrfFixed`.** Nunca cae a TEME sin avisar. Si el marco no está, se muestra que falta.
4. **Hay una sola Luna.** Se apaga la `scene.moon` nativa y se dibuja un `Primitive` propio. La escala física es la de por defecto; el modo didáctico es un conmutador aparte que solo multiplica el radio ×10.
5. **Los feeds en vivo siguen en «ahora».** En simulación se suspenden y se explica por qué. P5 no re-propaga SGP4.

## 2. Efemérides

**Fuente:** Horizons DE441, con `COMMAND=301`, `CENTER=500@399`, `REF_SYSTEM=ICRF`, `VEC_CORR=NONE` (geométrico), `TIME_TYPE=TDB`, en km.

**Tabla:**

- Ajuste por mínimos cuadrados en segmentos de 8 d, orden 10, float32.
- Rango: **2021-01-01..2040-12-31 TDB**.
- Formato binario con cabecera: magic, versión, `DE441`, t0/t1 (s TDB desde J2000), segmento, orden, marco, unidades y sha256 de la carga.

**Sol para la luz:** `Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame`, con 0,063′ de error medido.

**Validación de las candidatas** (Luna geocéntrica, 10 épocas UT frente a DE441; `eval.mjs` → `results-candidates.json`):

| Época UTC        | Simon1994 km / ′ | astronomy-engine 2.1.19 km / ′ |
| ---------------- | ---------------- | ------------------------------ |
| 2025-01-15 00:00 | 152,3 / 0,47     | 13,3 / 0,030                   |
| 2025-07-04 06:30 | **782,2 / 6,47** | 10,8 / 0,017                   |
| 2026-01-20 12:00 | 97,3 / 0,58      | 11,1 / 0,029                   |
| 2026-09-25 18:45 | 241,5 / 1,91     | 12,6 / 0,052                   |
| 2027-03-11 03:15 | 384,7 / 2,47     | 12,0 / 0,035                   |
| 2027-11-30 21:00 | 282,7 / 1,50     | 12,3 / 0,043                   |
| 2028-06-06 09:10 | 149,6 / 0,76     | 12,6 / 0,051                   |
| 2029-02-14 15:40 | 264,7 / 0,49     | 10,8 / 0,048                   |
| 2029-10-01 00:00 | 389,3 / 2,47     | 14,0 / 0,066                   |
| 2030-06-21 12:00 | 552,4 / 4,90     | 13,5 / 0,071                   |

**Ajuste Chebyshev** (`table.mjs` → `results-table.json`). Se midió sobre `dense_301.txt`: 4369 vectores DE441 cada 30 min, del 2026-09-01 al 2026-12-01. El error se calcula en las medias horas que no entraron en el ajuste.

| Segmento / orden | Error máx.                      | Tamaño (20 años)        |
| ---------------- | ------------------------------- | ----------------------- |
| 8 d / 10         | **0,020 km** f32 (0,009 km f64) | 118 KB (gzip no reduce) |
| 8 d / 8          | 0,35 km                         | —                       |
| 8 d / 6          | 12,6 km                         | —                       |

Evaluar la tabla cuesta 0,07 µs en Node.

**Límite:** solo se han validado 91 días. T2 tiene que revalidar los 20 años (perigeos, fronteras) antes de aprobarla.

**Hashes de la evidencia** (fixtures, no producto): `dense_301.txt` `1e283676…48c5`, `horizons_301.txt` `b2935e4e…c2fd`. El hash de la tabla lo genera T2.

**Tolerancias:**

- Gate del pipeline: ≤1 km y ≤0,01′ frente a vectores ICRF que no entraron en el ajuste.
- Tolerancia pública del modo físico: ≤50 km y ≤0,5′.
- Gate de marco: ≤0,5′ en dirección tras ICRF→ITRF frente a Horizons body-fixed, medido en el arnés de navegador.
- El modo didáctico no se valida con estas cifras.

**Fuera de rango, opción a (por defecto):**

- El lector devuelve `{status:'out-of-range', validFrom, validTo}`.
- No se dibuja la Luna física y se rotula «SIN EFEMÉRIDES · válido 2021–2040 TDB».
- Si el avance cruza la frontera, pasa a PAUSA con ese motivo.

**Fuera de rango, opción b (la decide Alex):** respaldo con astronomy-engine `GeoMoon`, rotulado «modelo analítico ≤14 km».

- Añade 6,1 KB comprimidos con gzip.
- Usa `SetDeltaTFunction(()=>69.184)`.
- Tiene un sesgo radial medido de unos −11 km.

**Procedencia:**

- Se registra en `docs/eyeinsky/planning/sources-ledger.json`, `asset-manifest.json`, `docs/eyeinsky/p5/ASSET-LEDGER.md` y `DATA_SOURCES.md`.
- Atribución «NASA/JPL Horizons, DE441», con fecha de consulta, parámetros literales y sha256 de la tabla y del generador.
- Dominio público **(verificar el texto de uso de JPL)**.

## 3. Modelo de tiempo

**Un solo reloj: `viewer.clock`.**

- `CesiumWidget.render` hace `clock.tick()` antes de `scene.render`, así que `frameState.time` ya alimenta `SunLight` (`UniformState.js:1322`), las `CallbackProperty` y la Luna.
- Hoy está congelado porque `createApplicationViewer` (`src/app/viewer.js:7-23`) no pasa `shouldAnimate` (`docs/eyeinsky/p4/T0-FINDINGS.md`).
- No se escribe `currentTime` en `preRender`: `frameState.time` ya está fijado antes y el cambio llegaría un fotograma tarde.

**`src/time/sceneClock.js`.** Es puro y recibe `now` inyectado, como `PlaybackClock` en `src/director/clock.js`.

| Método                 | Qué hace                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `goLive()`             | `shouldAnimate=true`, `SYSTEM_CLOCK`                                |
| `play(rate)`           | `SYSTEM_CLOCK_MULTIPLIER`, con ritmos ±1, ±60, ±600, ±3600 o ±86400 |
| `pause()`              | `shouldAnimate=false`                                               |
| `seek(jd)`, `step(±s)` | Salto a una fecha o paso fijo                                       |

- No se usa `TICK_DEPENDENT`, porque deriva con la cadencia de render.
- `clockRange=UNBOUNDED`, para que el fuera de rango se vea.
- `sample(jd)` devuelve un objeto congelado: `{julianDate, tdbSecJ2000, offsetFromWallMs, mode, isLive}`.

**`src/time/timeScales.js`.** `JulianDate` ya guarda TAI y los segundos intercalares (el último, 2017; TAI−UTC=37 s).

- `tdbSecondsFromJ2000(jd) = JulianDate.secondsDifference(jd, J2000_TT_EN_TAI)`, con `J2000_TT_EN_TAI = new JulianDate(2451545, -32.184, TimeStandard.TAI)`. Así se corrige la fórmula previa, que sumaba 37 s dos veces.
- TDB−TT (<1,7 ms, unos 2 m) se ignora.
- ΔT = TT−UT1 = 69,184 s − (UT1−UTC). Sin EOP se declara UT1≈UTC (≤0,9 s, ≤13,5″ de rotación).
- **Test RED:** evaluar con UTC da unos 70 km / 0,6′ y tiene que fallar.

**Qué se simula:** Luna, Sol, luz y terminador, anillo, rótulos de época y la elevación solar del HUD (`src/hud.js:501-524`, que hoy usa `new Date()`).

**Qué sigue en presente:**

- Vuelos, AIS, militares, sismos, FIRMS y CCTV.
- SGP4: `satellites/rendering.js:150,183`, `tracking.js:240-252`, `modelsHost.js:231` y `orbits.js:188,262`.
- El reloj de cabina (`cockpitInstruments.js:118`), rotulado «HORA REAL».

**Rótulo:** `UTC 2026-09-25 18:45:00 · TDB+69,18 s · DE441 2021–2040 · UT1≈UTC · VIVO|PAUSA|×600`.

**Render en reposo.** `src/renderGovernor.js` activa `requestRenderMode` cuando no hay holds.

- `holdContinuousRender('world-clock')` mientras el reloj corre y se ven la Luna o la luz; `release` al pausar.
- En vivo, `requestRender` periódico de baja frecuencia **(verificar la cadencia: el Sol se mueve 0,25°/min)**.

**Director:** `PlaybackClock` sigue midiendo `sceneElapsedSec`. En stop/abort (`src/scenes/director.js:1842-1846`) se restaura el estado previo de `sceneClock`. No se añade `worldEpoch` a los packs.

## 4. Marcos y unidades

**Cadena de conversión.** La tabla da ICRF geocéntrico, en km y TDB. De ahí:

1. multiplicar por 1000 para pasar a m;
2. aplicar `Transforms.computeIcrfToFixedMatrix(jd)` para pasar a ECEF (ITRF, IAU2006 XYS).

**`src/time/frames.js`.**

- `ensureIcrfFixed(interval)` hace `await preloadIcrfFixed` sobre ±1 d de la época y vuelve a precargar tras un seek o al salir del intervalo. En el prototipo, 3 d costaron 10–14 ms y 65 KB.
- `icrfToFixedOrAbsent(jd)` devuelve la matriz o `{status:'loading-frame'|'frame-unavailable'}`.
- Se elimina el fallback TEME de `src/celestialRing.js:632-634`. TEME pierde 21–26′ de precesión en 2025–2030, unos 2500 km en la Luna (`results-precession.json`).

**Orientación lunar.**

- `IauOrientationAxes`, igual que `Scene/Moon.js:115-117`, más un giro de 180° en z por la convención `s` de `EllipsoidGeometry.js:526`.
- Se valida con Tycho, Crisium, Copernicus y la sub-Earth lon/lat de Horizons (≤1°).
- No es ME/PA: eso llega en P6.

**WGS84 intacto.** La Luna usa su propio `modelMatrix`. Un test comprueba que `scene.globe.ellipsoid` sigue igual tras alternar modos.

**Unidades en el HUD:** km, s-luz y grados. La posición es geométrica (sin tiempo de luz, que serían unos 1,3 km, ni aberración) y así se declara.

## 5. Escena

**Una sola Luna.** `scene.moon.show=false` en `src/ui/eyeinskyScenePolicy.js`, junto al `skyBox` (línea 66). Motivos:

- usa Simon1994 y el reloj congelado;
- se dibuja en el pase de entorno, sin profundidad (`Scene.js:3021`);
- su textura, `moonSmall.jpg` (256×128), no tiene procedencia conocida.

**`src/layers/moon/primitive.js`.**

- `Primitive` con `EllipsoidGeometry(Ellipsoid.MOON.radii)` de 256×128 y `MaterialAppearance(Image)`.
- Se crea en diferido.
- `modelMatrix` se actualiza en `scene.preUpdate` con el `time` del evento, que es el patrón por frame de P4 (`satellites/modelPose.js`).
- Entra en el test de profundidad y se puede seleccionar (id `eyeinsky-moon`).

**Luz.**

- Se mantiene `SunLight`: con el reloj vivo y XYS precargado ya no queda congelada ni en TEME.
- No hace falta shader propio.
- El terminador sigue `czm_lightDirectionEC` **(verificar contra Illu% de Horizons, ±1 %)**.

**Profundidad.**

- Con log depth, `frustum.far = 1e10` (`Scene.js:717-720`) y near 0,1.
- Medido: 1 frustum en las 5 vistas y la Tierra oculta la Luna.
- No se toca `far` y no se desactiva log depth.

**Coordenadas.** Se usa `IntersectionTests.rayEllipsoid` en el marco lunar. `pickPosition` da 1,2–1,4 km de error a 10 000 km.

**Textura.**

- Por defecto, un placeholder gris rotulado.
- NASA SVS Moon Kit 4720 LROC, solo cuando la licencia y el ledger estén verificados:

| Versión | Tamaño    | Hash        |
| ------- | --------- | ----------- |
| 1k      | 139 068 B | `b246064f…` |
| 2k      | 457 942 B | `f7130a18…` |

- La 2k solo se usa si la Luna ocupa más de ~300 px, no es móvil y no hay save-data. Nunca más de 2k.

**Anillo.** `_updateEphemeris` recibe `time` y lee `src/layers/moon/celestialState.js`, que da `{sunFixed, moonFixed, moonDistanceKm, status}`. Se quitan `JulianDate.now()` (755) y el temporizador de 60 s (427-440).

**Modo didáctico.**

- Solo el radio ×10. Posición, dirección y fase siguen saliendo de la efeméride.
- `validatedAgainst:null` y `measurable=false`.
- Banda «ESCALA DIDÁCTICA · LUNA ×10 · NO ES REAL».

**Apagado limpio.** Está medido (`result3-leak.json`): sin `material.destroy()` se pierden 20–22 texturas en 20 ciclos; con él, 0. El orden es:

1. quitar el listener;
2. `m = prim.appearance.material`;
3. `scene.primitives.remove(prim)`;
4. `m.destroy()`;
5. `releaseContinuousRender`;
6. restaurar la política de escena.

## 6. UX: Mission Dock y móvil

**Tira TIEMPO**, fija en la cabecera del dock (`src/ui/eyeinskyMissionDock.js`; la lógica es `resolveTimeStrip`, pura, en `eyeinskyMissionDockModel.js`).

- Estados: «● EN VIVO 14:32:05 UTC», «◆ SIMULACIÓN 2027-03-14 06:00 UTC ×3600» (en ámbar) y «❚❚ PAUSA».
- Botones [PAUSA], [AVANCE ×] y [AHORA], y un campo de fecha en UTC.

**Acciones.**

- APUNTAR A LA LUNA: reorienta la cámara sin moverla.
- SISTEMA TIERRA–LUNA: encuadra con el FOV mínimo. En 390×844 el FOV vertical deja la Luna fuera de cuadro.
- ESCALA FÍSICA/DIDÁCTICA y VOLVER A TIERRA.
- Si una acción no está disponible, sale deshabilitada con el motivo («Fecha fuera de rango», «Marco no disponible»).

**Retícula.**

- Tamaño fijo en px, con la leyenda «RETÍCULA ≠ TAMAÑO» y una flecha en el borde cuando la Luna queda fuera de cuadro.
- A escala real, la Luna mide unos 16–17 px en 1920×1080 y unos 7 px CSS en 390×844. Es un cálculo con FOV 60° sobre la dimensión mayor **(verificar en captura; el prototipo dio ~9 px)**.

**Panel OBJETIVO Luna:** distancia (km y s-luz), fase, diámetro aparente, punto sublunar, la línea «JPL DE441 · geométrico · ICRF→ITRF» y la época en UTC/TDB.

**Simulación.**

- `eyeinskyActiveLayers` suspende las capas en vivo con el rótulo «Sin histórico: solo hora real».
- AHORA restaura exactamente el mismo conjunto.
- Nunca se presentan como históricas.

**Volver a Tierra.**

- Restaura cámara, capas, selección, seguimiento, anillo y pane del dock, con el patrón de `src/ui/cameraRestore` y `shareRestoration.js`.
- El reloj se queda como esté.

**`src/sharelink.js`.**

- Parámetros: `t=live|ISO`, `tr`, `lm=f|d` y `mv`.
- Una fecha inválida se rechaza.
- Una fecha fuera de rango abre en PAUSA con la ausencia visible.
- Sin `lm`, el modo es físico.

**Móvil (≤760 px).**

- Un chip «SIM 07-OCT 03:12» abre una hoja con botones de ≥44 px.
- Las acciones van al menú MÁS y la textura es la 1k.
- Con reduced-motion, cortes en lugar de vuelos y sin parpadeo.
- `aria-live="polite"` para anunciar los cambios de modo.

**Estética spy:** monoespaciada, con corchetes, ámbar para SIM y verde para VIVO. El globo manda; la Luna solo aparece cuando se pide.

## 7. Arquitectura

**Módulos nuevos.** Todos con exports declarados en `package.json` y pasando `check:boundaries`.

| Ubicación                                                      | Contenido                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/time/`                                                    | `timeScales.js`, `sceneClock.js`, `frames.js`                                                                                                                                                                            |
| `src/layers/moon/`                                             | `ephemeris.js` (parseo, sha256 con `crypto.subtle`, Clenshaw), `celestialState.js`, `pose.js`, `scaleMode.js`, `lunarPhase.js`, `primitive.js`, `lifecycle.js` (patrón de `satellites/lifecycle.js`), `textureBudget.js` |
| `scripts/eyeinsky-ephemeris-build.mjs`                         | Generador offline, fuera de CI. Parte de `ephemeris-eval/eval.mjs` y `table.mjs`                                                                                                                                         |
| `scripts/eyeinsky-p5.mjs <url> <out>`                          | Arnés, portado de `scene-perf/run2.mjs` y `run3.mjs`                                                                                                                                                                     |
| `public/data/ephemeris/moon-de441-2021-2040.bin`               | La tabla **(verificar la caché inmutable en Vite/nginx)**                                                                                                                                                                |
| `src/layers/moon/fixtures/horizons-de441-moon-validation.json` | ~40 vectores ICRF y 10 ITRF, Illu% y sub-Earth, rotulados como FIXTURE                                                                                                                                                   |

**Módulos que se modifican:**

- `src/app/viewer.js` y `src/ui/eyeinskyScenePolicy.js`;
- `src/celestialRing.js`, `src/hud.js` y `cockpitInstruments.js`;
- `src/scenes/director.js` y `src/sharelink.js`;
- modelo y vista del Mission Dock;
- `applicationShortcuts.js` (L, Shift+L, Espacio, N, Esc; **verificar que no chocan**);
- `eyeinskyActiveLayers`.

**Guarda:** un test con grep falla si aparecen `computeMoonPositionInEarthInertialFrame` o `computeTemeToPseudoFixedMatrix` en `src/`.

## 8. Plan TDD (RED→GREEN; el formato mecánico va en un commit aparte)

| #   | Tarea                                                                                                                                                                                                                                                | Jornadas |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T0  | Arnés `eyeinsky-p5.mjs` en RED con lo que falla hoy: `moon.show` activo, reloj congelado 5 s, anillo distinto de `scene.moon` e ICRF→Fixed sin definir. Más la guarda y la política de escena. Commit solo de tests                                  | 0,5      |
| T1  | `timeScales`: J2000 TT en TAI, intercalar de 2017, RED de UTC≠TDB. `frames`: sin precarga devuelve ausencia, nunca TEME                                                                                                                              | 0,5      |
| T2  | Generador 2021–2040. Revalida 20 años (medias horas, fronteras ±1 min, perigeos), aborta si pasa de 1 km / 0,01′ y genera `.bin`, fixture, `summary.json` y ledger                                                                                   | 1        |
| T3  | `ephemeris.js`: parseo, hash, Clenshaw y ≤1 km en ≥10 épocas. `out-of-range` tipado; cabecera corrupta da error                                                                                                                                      | 0,5      |
| T4  | RED de los consumidores de `currentTime` (`trackedCamera.js:197,211`, `flights/motion.js:347`, `military/motion.js:253`, `cockpitCamera.js:65`, `cameraOrientationControls.js:10`). Después, `sceneClock`, `viewer.js` y el hold de `renderGovernor` | 1        |
| T5  | `celestialState`, `pose` (≤1°) y `lunarPhase` (Illu% ±1 %). Gate ECEF ≤0,5′ en el arnés                                                                                                                                                              | 0,75     |
| T6  | `scaleMode`, `primitive` y `lifecycle`: `moon.show=false`, apagado en orden, 20 ciclos con texLeak=0 y WGS84 intacto                                                                                                                                 | 0,75     |
| T7  | `celestialRing` y HUD pasan al estado común. Test: el marcador del anillo coincide con la Luna 3D (1e-9)                                                                                                                                             | 0,25     |
| T8  | Dock: tira TIEMPO, acciones, panel, suspensión de capas en vivo, retícula y retorno sin listeners huérfanos                                                                                                                                          | 1        |
| T9  | `sharelink`, restauración del Director y textura (solo con el ledger aprobado)                                                                                                                                                                       | 0,25     |
| T10 | Gates: `build`, `doctor`, `format:check`, `check:boundaries` y `test`. Arneses p5, p4, p31, p012 y smoke contra `:4204`. A/B en la GPD. Actualizar `EYEINSKY-SESSION.md` y `FASES.md`                                                                | 0,5      |

Son unas **7 jornadas**: el techo del rango 4–7 del plan maestro. Si hay que recortar, se aplaza la textura LROC.

## 9. Matriz de aceptación

| ID    | Criterio                                                                                                                    | Evidencia                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P5-01 | Tabla ≤1 km / ≤0,01′ en los 20 años y en ≥10 épocas del fixture                                                             | `summary.json`, test T3                                                                         |
| P5-02 | UTC evaluado como TDB falla; la vía TDB pasa                                                                                | test `timeScales`                                                                               |
| P5-03 | ECEF ≤0,5′ frente a Horizons ITRF, sin TEME                                                                                 | arnés p5, guarda                                                                                |
| P5-04 | Con `t=ISO`, Luna, Sol y rótulos muestran el mismo instante                                                                 | arnés, captura                                                                                  |
| P5-05 | Pausa congela; avance ×N dentro de ±1 %; AHORA deja `offset≈0`                                                              | test `sceneClock`, arnés                                                                        |
| P5-06 | Una sola Luna, y la del anillo coincide con la 3D                                                                           | arnés                                                                                           |
| P5-07 | El modo didáctico lleva banda, no es medible y tiene `validatedAgainst:null`; el físico es el de por defecto                | test `scaleMode`, sharelink                                                                     |
| P5-08 | WGS84 sin cambios tras 5 ciclos de modo y contexto                                                                          | test                                                                                            |
| P5-09 | Fuera de rango: la ausencia se ve, no hay Luna física y el avance pasa a PAUSA                                              | test, arnés                                                                                     |
| P5-10 | Marco no disponible: se muestra «CARGANDO/SIN MARCO», sin fallback                                                          | test `frames`, arnés sin red                                                                    |
| P5-11 | En simulación no hay capas en vivo visibles; AHORA restaura exactamente el conjunto                                         | test del modelo del dock                                                                        |
| P5-12 | Apuntar a la Luna y volver conserva cámara, capas, selección y seguimiento                                                  | arnés, diff de estado                                                                           |
| P5-13 | 20 ciclos con texLeak=0 y bufLeak=0; listeners y primitivas sin cambios                                                     | arnés p5                                                                                        |
| P5-14 | Orientación ≤1° frente a la sub-Earth; fase ±1 % frente a Illu%                                                             | tests T5                                                                                        |
| P5-15 | Sin regresiones P0–P4: `npm test` sin fallos; p4, p31, p012 y smoke en verde                                                | `output/`                                                                                       |
| P5-16 | A/B en la GPD con la misma escena, viewport y perfil de capas que P4, con y sin Luna; tiempo de frame relativo, **sin FPS** | `eyeinsky-p5.mjs`, `eyeinsky-p4-perf.mjs` **(verificar que la línea base de P4 es comparable)** |
| P5-17 | En 390×844 y 1920×1080: botones ≥44 px, retícula y reduced-motion                                                           | arnés; teléfono físico o límite declarado                                                       |
| P5-18 | Procedencia registrada en el ledger y en `DATA_SOURCES.md`                                                                  | revisión                                                                                        |

## 10. Riesgos y lo que NO haremos

**Riesgos:**

- Animar el reloj afecta a todo lo que lee `currentTime`. Lo cubre el RED de T4.
- `requestRenderMode` congela la escena si no hay hold.
- IAU2006_XYS puede dar 404 detrás de nginx (`CESIUM_BASE_URL`). **Verificar en staging**; el deploy necesita una orden aparte.
- La tabla solo está validada en 91 días. Sin la aprobación de T2, P5 no se cierra.
- Un segundo intercalar nuevo antes de 2035 obliga a actualizar `JulianDate.leapSeconds` (1 s ≈ 1 km).
- Medido en la GPD (Radeon 890M, ANGLE headless): la Luna a pantalla completa añade unos 4–6 ms de relleno; pequeña, queda en ruido. Es solo relativo, no son FPS y no se ha medido en teléfono.
- Tiles de Google a distancia lunar: sin medir con clave.
- Licencia SVS sin verificar y posibles huecos polares en la textura 2k.
- Los arneses `focus`, `journey`, `mobile` y `states` se repararon en Fase A (2026-09-24) y sí sirven como evidencia.

**Lo que NO haremos:**

- Nada de P6: superficie explorable, relieve LOLA, LROC por encima de 2k, coordenadas ME/PA medibles, aterrizaje ni colisión.
- No re-propagaremos SGP4 ni ningún feed a hora simulada, ni inventaremos telemetría.
- No comprimiremos distancias en el modo didáctico ni tocaremos WGS84.
- No usaremos Simon1994 para la Luna, ni la aproximación de P0, ni TEME.
- Alex autorizó `astronomy-engine` como respaldo fuera de rango (2026-09-25). No desplegaremos en `eyeinsky.org` sin orden aparte.
