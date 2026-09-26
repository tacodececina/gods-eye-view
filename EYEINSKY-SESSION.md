# EYEINSKY — punto de reanudación

## Actualización 2026-09-26 — Fase visual Editorial: T0–T5 en rama, pendientes reparación y T6

Rama `eyeinsky/visual-editorial` (worktree `C:/Users/Alex/orca/eyeinsky-vis`), HEAD `d2bcfe2`. Alex rechazó el aspecto (2026-09-25: «muy feo, no me atrapa») y eligió la maqueta **Editorial Clean** (`docs/design/eyeinsky/mockups/editorial-clean.html`; maquetas en `https://staging.eyeinsky.org/mockups/`). Plan: `docs/superpowers/plans/2026-09-25-eyeinsky-fase-visual-editorial.md` (decisiones D1–D5 resueltas en §0). Sistema: `docs/design/eyeinsky/DESIGN-SYSTEM-EDITORIAL.md`.

Hecho: T0b (shell troceado en `src/ui/shell/`, DOM idéntico), T0 (arnés `scripts/eyeinsky-visual.mjs`), T1 (piel `eyeinsky-editorial*.css`, fuentes OFL locales, copy del reloj), T2 (halo, luz solar del reloj P5, luces VIIRS por proxy `/api/gibs/night`, cielo Yale BSC5, retícula off, poses `?homePose=solar|tilt`), T3–T5 (sin dock en reposo, titular de entrada, panel contextual, USGS y datos avanzados bajo demanda, marcadores sin rojo, móvil con hoja única). Todo detrás de `?skin=editorial&globe=editorial`; por defecto sigue legacy hasta T6. Contratos renegociados: `docs/eyeinsky/visual/CONTRATOS-T3-T5.md`.

Evidencia (árbol d2bcfe2): suite 4.917 tests / 0 fail; visual 43/43 (editorial); p012 23/23 (ambos globos); p3 30/30; p31 15/15; p5 38/38; focus, journey, states, smoke; p4 42/42 y mobile 12/12 con globo legacy (con editorial: p4 40/42 por órbita discontinua en el contador del arnés, mobile por el literal de altura 26.000 km). Rendimiento T2 (n=3, GPD): escena A Δp95 −1,8 ms.

**Pendiente antes de T6 (revisión T3–T5, sin reparar por el límite semanal de la cuenta):**

- HIGH: fase «explore» de la revelación (en reposo ocultar carril, telemetría y capas vacías hasta la primera interacción; hoy solo se retira el titular).
- HIGH: en Simulación ×3600 la tira TIEMPO se solapa con la telemetría a 1600×900.
- HIGH: cerrar el panel (×) no suelta el objetivo (trackedEntity sigue; estado de revelación pasa a rest).
- HIGH: valores de la Luna recortados con elipsis en el panel (dd nowrap).
- HIGH: `#eye-share` queda enfocado bajo la máscara del carril de telemetría en móvil (llevar a Más).
- HIGH: p3-06 mide sobre el dock oculto; reabrir la ficha por Instrumentos antes.
- MEDIUM: anatomía del panel ISS (kicker natural, hechos útiles), panel Instrumentos con altura por contenido y sin decoder, carril móvil de 3 botones y telemetría de 2 lecturas, rótulos que chocan con la barra superior, encuadre nocturno del seguimiento, p31-01 con objetivo real y hoja en 390, piezas de la tira TIEMPO (nowrap por pieza), titular que se repinta en simulación, funciones >50 líneas en scripts/lib/eyeinsky-visual-t4t5.mjs.

**T6 (2026-09-26, KRÓNOS a mano por el límite semanal):** los seis HIGH de la revisión ya no se reproducían en el árbol final (verificado con sondas: × suelta el objetivo, sin solape en simulación, fase «explore» activa, valores de la Luna legibles, Compartir fuera del carril móvil, p3 30/30). Promovidos `skin=editorial` y `globe=editorial` como valores por defecto (pose `solar` hasta que Alex elija), `__eyeinsky.homeAltitude()` expuesto y `mobile` lo usa en vez del literal de 26.000 km, el contador de órbitas de P4 acepta la órbita discontinua. Evidencia (árbol final): suite 4.930 tests / 0 fail; visual 53/53; p012 23/23; p31 15/15; mobile 12/12; p4 41/42 — el único fallo es `paso-anonimo-sin-excepcion` (P4-20 abre una segunda página al final del recorrido y agota 120 s con el globo Editorial; en aislamiento carga en 4 s con las mismas reglas; P4-20 sigue cubierto por unitarios y por la fase P4). Cerrado el 2026-09-26: Alex eligió pose TILT (escritorio) con deriva sutil y SOLAR (móvil); CENTRAR re-engancha objetivos móviles; mediums principales (kickers naturales, edades sin corte, carril móvil de 3, panel de trabajo a su contenido); medición limpia n=3 (A) / n=2 (B): editorial −1,8 ms y −0,4 ms de p95 frente a legacy (docs/PERFORMANCE.md). **En producción** desde `20260926T1503Z-visual-prod` con cabeceras beta/noindex. Pendientes menores: margen superior de las tarjetas de rótulo frente a la barra, encuadre nocturno del seguimiento, anatomía fina del panel ISS (hechos del TLE), titular que se repinta en simulación.

## Actualización 2026-09-25 — P5 (Tierra–Luna) aceptada por KRÓNOS con dos criterios de rendimiento no resolubles

Rama `eyeinsky/p5-tierra-luna` (worktree `C:/Users/Alex/orca/eyeinsky-p5`), HEAD `1a929b1`, sin integrar aún en `main`. Commits: `a0b7ef9` propuesta aprobada por Alex, `51864e3` T0–T3 (tabla DE441, escalas de tiempo, marcos ICRF→fijo y respaldo), `5ee9868` T4–T7 (reloj único, estado celeste y fase, Luna a escala real, anillo y HUD unificados), `36824fa` T8–T9 (tira TIEMPO, acciones Tierra–Luna, suspensión de capas en vivo, enlaces y textura LROC), `1a929b1` pulido (atajos, enlaces según el rango de la tabla, aviso de pausa, motivo en el contexto de misión, rótulo TIERRA). Matriz P5-01..18 con estado al cierre en `docs/eyeinsky/p5/PROPUESTA-P5-2026-09-25.md` §9.

Qué cambió:

- **Efemérides:** tabla Chebyshev DE441 (`public/data/moon-de441-2021-2040.bin`, 120.792 B, 8 d / orden 10 / float32) generada desde JPL Horizons y revalidada en 20 años: máx 0,035 km (175.488 medias horas, fronteras ±60 s, 265 perigeos). Simon1994 medido a 782 km / 6,5′ → prohibido para la Luna (confirma P0), permitido sólo para el Sol (0,074′). Respaldo astronomy-engine `GeoMoon` rotulado «≤20 km» (barrido denso: máx 16,07 km), en un chunk aparte que sólo carga fuera de rango. ΔT desde `JulianDate.leapSeconds`. Procedencia en `docs/eyeinsky/p5/ASSET-LEDGER.md` y `DATA_SOURCES.md`.
- **Tiempo:** `sceneClock` gobierna `viewer.clock` (vivo con resincronización suave, pausa, simulación ×1…×3600), con hold de render y repintado en seeks. Los consumidores de `currentTime` quedan fijados por test. SGP4 y feeds siguen en hora real. En simulación las capas en vivo se suspenden con «Sin histórico: solo hora real» y AHORA restaura el mismo conjunto; una pausa de más de 60 s desde vivo anuncia la suspensión.
- **Marcos:** ICRF→ECEF con `preloadIcrfFixed`, nunca TEME; gate de 0,035′ frente a puntos sublunares ITRF de Horizons; punto sublunar con corrección de tiempo de luz.
- **Escena:** Luna nativa apagada; Luna propia (`Primitive` sobre `Ellipsoid.MOON`, profundidad, pick, Lambert con el Sol de escena, orientación IAU síncrona rotulada aproximada, 0,009° frente a MOON_ME). Textura NASA SVS LROC 1k/2k (dominio público, crédito SVS) con placeholder determinista. Modo didáctico ×10 sólo en el radio y con banda. Apagado sin fugas en 20 ciclos; WGS84 intacto.
- **UX:** tira TIEMPO (chip compacto en móvil), APUNTAR A LA LUNA, SISTEMA TIERRA–LUNA (rótulo TIERRA, callouts despejados), ESCALA, VOLVER A TIERRA con estado exacto, panel OBJETIVO Luna, retícula con flecha de borde. Atajos **L** (apuntar), **Shift+L** (sistema), **P** (pausa/reanudar), **N** (ahora) y **Esc**; Espacio sigue siendo la voz. Enlaces compartidos con `t` / `tr` / `lm` y el rango leído de la tabla; el Director restaura el reloj.

Evidencia (local, `output/eyeinsky-p5/`, no versionada):

- Gates (`polish/`, árbol de `1a929b1`): suite de 4.769 tests (4.759 pass, 10 skip, 0 fail); build, format:check y check:boundaries en verde. Doctor en verde en `repair-gates/` (árbol de T8–T9; no se repitió tras el pulido).
- Arnés `scripts/eyeinsky-p5.mjs`: 38/38 en `final/p5/` (HEAD `1a929b1`, ANGLE sobre Radeon 890M).
- Regresiones: p31 15/15 (`final/p31/`); p4 42/42 (`kronos-final/p4/`, árbol de T8–T9); p012 23/23, cámara adversa 9/9, cockpit 4/4 y smoke sin fallos en su JSON (`supervisor-1/reg/`, árbol anterior a T8–T9). Supervisor independiente y reparación (REANUDAR desde pausa en vivo, foto de retorno con capas suspendidas, «Apagar» alcanzable en 390 px, foco de teclado, regresión P4 restaurada) y pulido de mediums.
- **P5-15 cerrado (regfix, sin commitear sobre `1a929b1`):** p3 daba 27/30 en `final/p3/` por texto de 13 px en la tira TIEMPO y las acciones Tierra–Luna; ahora `--eye-earth-moon-text` sube a 14 px en teléfono y FECHA UTC gana a `.eyeinsky label` (test `src/ui/eyeinskyEarthMoonType.test.mjs`). El arnés P5 exige 14 px en teléfono, como P3. regresión final en secuencia sobre el árbol de `1a929b1` + regfix (`output/eyeinsky-p5/regfix/final2/`, 2026-09-25 18:28–18:41 UTC): p5 38/38, p31 15/15, p4 42/42, p3 30/30, p012 23/23, cámara adversa 9/9, cockpit 4/4, smoke sin fallos, mobile 12/12, focus 12/12, journey 25/25 y states 19/19 (todos exit 0; cámara adversa re-ejecutada tras un fallo de arranque de Chrome «browser is already running» con perfil temporal nuevo, log en `camera-adverse-launchfail.log`). Gates en `final2/gates/`: `npm test` 4.775 tests (4.765 pass, 10 skip de plataforma, 0 fail), build, doctor, format:check y check:boundaries en verde. Arneses endurecidos sin relajar criterios: reintento registrado del fetch Node→proxy de P4 ante `connect ETIMEDOUT`, conteo de órbitas P4-09 sin la retícula del shell, vista de `shortcuts` a 90° de la sublunar.
- Rendimiento (`perf-clean/`, GPD Win 4, modo `windows`, 69–73 °C en ventana, n=3 intercaladas, vista de P4; detalle en `docs/PERFORMANCE.md`): M1 y M2 ≤ A+3 ms cumplen (Δp95 −0,5 y −2,0 ms); S sin long tasks y heap ≤ +2 MiB cumple; E comandos = A cumple. **No resolubles:** A′−A Δp95 (mediana −0,4 ms, pero +1,3 ms en una ronda con una sesión Playwright ajena activa) y el heap de E (+0,5…+1,5 MiB residual tras apagar, no atribuido). P5-16: cumple parcial, 4/6 criterios. La medición anterior (`perf/`, modo `gaming`, 82–92 °C) se descartó por contaminación. No se afirman FPS.

Límites honestos:

- Sin teléfono físico (`docs/eyeinsky/p5/LIMITES-MOVIL.md`): tacto real, Safari iOS, GPU móvil y lectores de pantalla sin verificar.
- 1k y 2k son versiones distintas del mapa SVS (2019 y 2025): al subir de 1k a 2k cambia el tono.
- El despeje de SISTEMA TIERRA–LUNA oculta todos los callouts de detección, no sólo los que estorban.
- Carrera rara con la navegación entre ciudades.
- Un enlace fuera de rango con la Luna apagada y la tabla sin cargar no pausa.
- Los +2 comandos constantes con la Luna fuera de cuadro no están verificados.
- `src/ui/eyeinskyShell.js` mide 1.502 líneas (deuda previa; +111 en P5).
- Los satélites no se re-propagan a tiempo simulado (por diseño).
- El Vite de desarrollo compartido (`:4204`) rechazó a veces conexiones de loopback bajo carga (`ERR_CONNECTION_TIMED_OUT` en un módulo → app parada en «Preparando el observatorio…»; `connect ETIMEDOUT` en el fetch Node→proxy de P4). Hace fallar arneses de forma no determinista; no es código de `src/`. Evidencia en `output/eyeinsky-p5/regfix/` (`mobile-diag5`, `p4-diag3`, `probe-lat.out`).

P5.1 candidatos: arneses contra un build o servidor dedicado (no el Vite compartido); atribuir los +2 comandos y el heap residual; tono uniforme de textura; despeje selectivo de callouts. La superficie lunar explorable es P6.

Siguiente: integrar P5 en `main`, release a staging y después **P6 (Luna explorable)**.

## Actualización 2026-09-24 — P4 (satélites 3D) aceptada por KRÓNOS con excepciones aprobadas por Alex

Rama `eyeinsky/p4-satellites-3d` (worktree `C:/Users/Alex/orca/eyeinsky-p4`), HEAD `64880d1`, sin integrar aún en `main`. Commits: `2bf513f` propuesta aprobada, `bf8dec8` T0 (curación e inspector GLB), `34e87bb` T1–T3 (elementos canónicos, registro y módulos puros LOD/presupuesto/actitud), `f3f264f` follow-ups de revisión, `0a5025d` T4 (modelos cercanos con presupuesto, prioridad, evicción y teardown), `e0650de` T5–T6 (INSPECCIONAR, pick sobre el casco, paso punto→modelo, expediente honesto), `64880d1` T7 (arnés canónico, pulido, honestidad ante fallo SGP4). Matriz P4-01..25 marcada en `docs/eyeinsky/p4/PROPUESTA-P4-2026-09-24.md` §9.

Qué cambió:

- **Modelos NASA 3D Resources** (revisión `11ebb4ee`, crédito dinámico «Source: NASA 3D Resources»): ISS (A) específico para NORAD 25544; Hubble (A) específico para NORAD 20580, con excepción de memoria en `std` y sólo punto en `low`; CubeSat 1U de familia, sólo para el grupo `cubesat`, con 18 primitivas aceptadas. Draco aceptado. Nombres con hash y cuatro ledgers.
- **Presupuesto y LOD:** perfiles `std` (2 modelos) / `low` (1; móvil o puntero táctil) / `off`. LOD por diámetro proyectado en píxeles: seguido ADD 6 / KEEP 3 px; secundario 16 / 10 px con techo 25 / 30 km. Reconcile 250 ms, evicción tras 2 s, timeout de carga 20 s, veto tras 3 fallos, `environmentMapOptions` desactivado (era el origen de las long tasks de B2).
- **UX:** INSPECCIONAR / ÓRBITA en el Mission Dock (clamp(8·radiusM, 6 m, 5 km)) con el motivo visible cuando está deshabilitada; el pick sobre el casco no deselecciona; retícula de 4 px cuando el modelo ≥ 24 px; chips MODELO / ESCALA REAL / ACT. APROX. / ÉPOCA / CACHÉ / MODELO NO DISPONIBLE; riel móvil ALT · ÉPOCA · MODELO; cámara con sesgo para no quedar bajo el dock en móvil; estados «Posición calculada (SGP4)» y «Propagación falló (SGP4)».
- **Datos:** OMM JSON para los grupos núcleo (NORAD de 6 dígitos exacto), TLE para `dense`; proxy con lista blanca y `FORMAT=json`; Alpha-5 rechazado (antes colapsaba en NaN); edad de órbita por régimen; órbita caducada → sin modelo y con rótulo.

Evidencia (local, `output/eyeinsky-p4/`, no versionada):

- Suite: 4.507 tests, 0 fail. Build, format:check y check:boundaries en verde.
- Arnés `scripts/eyeinsky-p4.mjs`: 42/42 (`t7/supervisor-1/` y, tras la reparación, `t7/repair-p4-2/`). 21 ids aprobados en arnés; P4-12 y P4-15 por gates y arneses de regresión, P4-14 por `t7/perf-repeat/`, P4-24 por excepción.
- Regresiones: p31 15/15, p3 30/30, p012 23/23, cámara adversa, cockpit 4/4 y smoke. Supervisor independiente y ronda de reparación.
- Rendimiento (GPD Win 4, Radeon 890M ANGLE/D3D11, modo `windows`, 70–75 °C; detalle en `docs/PERFORMANCE.md`): `t7/perf-clean/` en corrida única → `low` cumple todo; `std` falló A (+2,5 ms) y B2 (+7,9 ms). `t7/perf-repeat/` con n=3 intercaladas → A Δp95 −0,4 ms (mismos 22 comandos), B2−B Δp95 0,0 ms, 0 long tasks: cumple. E = A-off + 2 comandos (`PointPrimitiveCollection` del EntityCluster, excepción aprobada por Alex); E2−E heap +0,25 MiB (caché de shaders única). Calibración §5 por API: 2 eventos/min, justo en el límite. No se afirman FPS.

Límites honestos:

- La sesión de medición contaminada anterior (League of Legends abierto, modo `gaming`, 85–90 °C) se descartó entera.
- n=3 no da intervalo de confianza; sólo se mide CPU del hilo principal del frame de Cesium, sin GPU; headless con GPU real.
- Sin teléfono físico.
- El tope de 2 modelos simultáneos sólo está probado en unitarios: el recorrido de navegador nunca pasó de 1.
- Con gestos reales en INSPECCIONAR el seguimiento se suelta (diseño P3.1: `interruptHumanNavigation`), así que no existe órbita manual alrededor del modelo. Es una **decisión de producto pendiente de Alex para P4.1**; por eso §5 sólo se calibró por API.
- En `off` el heap sube +1,56 MiB entre ciclos sin atribuir.
- El `commandList` leído justo tras disable (51 / 41 en dos ciclos) no está verificado; la medida estable posterior no muestra comandos residuales.

P4.1 candidatos: órbita manual en INSPECCIONAR, huella y pases, GEO (TDRS / GOES), yaw-steering, dos modelos simultáneos en el arnés.

Siguiente: integrar P4 en `main` y hacer release a staging; después **P5 Tierra–Luna**, con efemérides precisas primero.

## Actualización 2026-09-24 — Fase A cerrada: herramientas, arneses, runtime y staging privado

Rama `eyeinsky/fase-a-herramientas` (worktree `C:/Users/Alex/orca/workspaces/gods-eye-view/coney`), sobre `fe31165`. Roadmap aprobado por Alex el 2026-09-23: **P4→P5→P6→P7 completas antes de publicar**; la infraestructura se ejercita en staging privado desde ya.

Qué cambió:

- **Bug de producto corregido** (`src/ui/eyeinskyShell.js`): en móvil (≤650 px) inspeccionar un sismo dejaba el Mission Dock suspendido sin lista ni ficha. Ahora se retira la razón `mobile-workspace` al mostrar la ficha; cerrar sigue volviendo a inicio.
- **Los cuatro arneses heredados** (`eyeinsky-focus/-journey/-mobile/-states`) vuelven a verde contra 127.0.0.1:4204, junto a P3.1 15/15. Suite unitaria: 4.311 tests, 4.301 pass, 0 fail, 10 skip.
- **`CLAUDE.md` del proyecto** y **toolkit `.claude/`** (everything-claude-code + 8 skills de antigravity; mapa en `.claude/MAPA-HABILIDADES.md`).
- **Runtime de producción endurecido** (`server/production-runtime.js`, 10 tests): MIME completo, límite de body 1 MiB en /api, timeouts, errores de stream, guards de proceso, arranque correcto vía symlink `current/`.
- **`deploy/` real**: `release.sh` construye desde el commit auditado, empaqueta dist + runtime + node_modules de producción, verifica sha256 en remoto, cambia symlink atómicamente, smoke y rollback automático. Plantillas systemd (hardening + EnvironmentFile), nginx con HSTS/CSP/limit_req y snippet compartido, vhost de staging con basic-auth. Rutas adaptadas al aaPanel del VPS (`/www/server/...`).
- `ws` pasa a dependencia de runtime (lo necesita el proveedor AIS).

**Staging vivo:** https://staging.eyeinsky.org/ (basic-auth, `noindex`, `X-EYEINSKY-Phase: staging`). VPS Hostinger compartido, árbol `/opt/eyeinsky-staging`, servicio `eyeinsky-staging` en 127.0.0.1:4174 con el Node 22 del sistema. Release activa `20260924T1436Z-staging`. Credencial de basic-auth en el servidor, `/root/eyeinsky-staging-credential.txt` (root, 600); nunca en el repo ni en el vault. `eyeinsky.org` sigue siendo el placeholder `preparacion-https`, intacto.

Límites honestos del staging: sin claves de proveedores (`/opt/eyeinsky-staging/shared/eyeinsky.env` está vacío: sin Google 3D Tiles, ion, OpenAI, AIS, TomTom, FIRMS); dos violaciones CSP `script-src eval` de sondas de capacidad que no afectan al render; `/api/realtime/debug-log` responde 400 sin clave OpenAI. El release se ejercitó tres veces: el primero falló y hizo rollback automático (bug de arranque vía symlink, corregido).

Siguiente: **P4 (satélites 3D)** con `docs/superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`, en worktree propio desde `main` tras integrar esta rama. Cada fase termina con release a staging.

## Actualización 2026-09-21 — P3.1 (Mission Dock) implementada y verificada; P4 sigue sin iniciar

P3.1 está implementada en `eyeinsky/p3.1-mission-dock`
(`C:/Users/Alex/orca/eyeinsky-p31-mission-dock`), sobre la base `8811666`, con
`claude-opus-5` como único escritor. Es un corte de presentación y autoridad
sobre P3; no añade fuentes de datos nuevas.

Qué cambió, en una línea cada uno:

- El expediente lateral derecho es ahora un **Mission Dock inferior**: riel
  siempre visible (identidad, estado de cámara, valores medidos, brújula,
  SEGUIR/CENTRAR/NORTE/MÁS) y cuerpo desplegable con OBJETIVO, MEDIOS y OPS.
- La cápsula de Actividad es ahora la terminal **`EYEINSKY OPS // LIVE`**,
  tercer panel del dock, sobre el mismo modelo y las mismas fuentes de P3.
- **Autoridad de cámara ≠ identidad de selección.** Un gesto físico suelta la
  cámara y conserva el objetivo: `releaseCameraOwnership({origin})` frente a
  `stopTracking({origin})`, y `refocusTrackedById` para volver a engancharla.
- **`bhote-koshi-locator` retirado del runtime.** Sin capa, sin registro de
  serialización (token `z` retirado, no reutilizado), sin receta ejecutable y
  sin entrada de interfaz. El módulo y sus pruebas siguen en el árbol.

Evidencia supervisora final de esta fase (local, no versionada):

- `output/eyeinsky-p31/supervisor-static-6/summary.json`: 4.311 tests,
  4.301 pass, 0 fail, 10 skip; 98/98 afectadas; build, boundaries, formato,
  TypeScript, whitespace, secretos y estabilidad de hashes verdes.
- `output/eyeinsky-p31/supervisor-browser-6/summary.json`: P3.1 15/15, P3
  30/30, P0–P2 23/23, cámara adversa 9/9 y cockpit 4/4.
- Las dos `ERR_ABORTED` USGS de P3/P0–P2 ocurren al cerrar/cambiar la página;
  no producen errores de página ni invalidan los fixtures aceptados.

La primera auditoría independiente rechazó el candidato por MEDIOS oculto,
wiring residual Bhote, listeners sin teardown, selección/refollow tautológico,
zoom 200 % simulado y umbral táctil débil. Cada punto se reprodujo en RED, se
reparó y pasó reauditoría independiente. El recorrido final selecciona un vuelo
fixture real en Cesium, dispara un `WheelEvent`, conserva el mismo `contextKey`,
muestra cámara libre y SEGUIR vuelve al mismo entity. El zoom usa CDP,
`visualViewport.scale === 2`, viewport visual 720×450, controles y créditos
hitteables, targets de 44 px y texto esencial de al menos 13 px.

Servidor canónico de navegador: `http://127.0.0.1:4204/` (Vite dev forzado y
local). Comprobar HTTP antes de asumir que sigue vivo. No es un deployment.

Bhote Koshi queda **aplazado**, no cancelado: futura experiencia contextual y
**no permanente**. Reintroducirlo requiere una fase propia con su diseño; no es
un interruptor que volver a encender.

Límites honestos de P3.1: no hay teléfono físico, no se afirma FPS sostenido, y
cuatro arneses heredados (`eyeinsky-focus`, `-journey`, `-mobile`, `-states`)
siguen fallando por selectores obsoletos del rediseño P0–P2. Se comprobó
ejecutándolos contra la base `8811666`: fallan **igual** allí, así que no son
regresiones de P3.1. En esta fase sólo se les parametrizó la URL y se reparó la
ruta de navegación a Señales/Operación.

P4 sigue **sin iniciar** y es lo siguiente. No empezarlo sin orden separada.

## Actualización 2026-09-20 — P3 aceptada; P4 sólo planificada

P0–P3 están implementadas en `eyeinsky/p3-opus5`. P3 fue construida con la sesión Claude Code `32cfb7bc-04f0-47e2-a38c-a6278aacda8b`, modelo efectivo `claude-opus-5`, y aceptada por KRÓNOS después de gates independientes y reparación RED→GREEN. La autoridad final es `output/eyeinsky-p3/supervisor/FINAL-ACCEPTANCE.md` y `.json`, no el handoff anterior del constructor.

La preview local aceptada fue `http://127.0.0.1:4198/`; siempre comprobar HTTP antes de asumir que sigue viva. No representa un deployment público.

Estado de integración al redactar este documento:

- Worktree P3: `C:/Users/Alex/orca/eyeinsky-p3-opus5`.
- Rama: `eyeinsky/p3-opus5`.
- Base P0–P2: `812d75c0833887069e31cc2218d47b728b9cad36`.
- `main` remoto previo: `0d41b6be5490db1f10a171f238be75db4d4ec3b4`.
- Alex autorizó commit, push, PR/merge y publicación del código en el fork público.
- El repositorio no tiene GitHub Pages, deployments, environments, releases ni proveedor de hosting configurado. Publicar el código en `main` no equivale a desplegar una app.

P4 está planificada, NO implementada:

- Plan: `docs/superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`.
- Alcance: OMM/TLE sin truncamiento, época/caducidad, un modelo específico ISS y uno de familia CubeSat sujetos a curación, máximo dos modelos cercanos, puntos globales, selección/cámara/expediente intactos y actitud sólo aproximada.
- No iniciar P4 sin orden separada. Crear un worktree nuevo desde el `main` ya integrado; un solo escritor.

Límites reales de P3 siguen vigentes: no teléfono físico, no afirmación de FPS sostenido, no paridad global completa y CCTV no inventa porcentajes cuando la fuente carece de denominador.
