# EYEINSKY — fases guardadas al cierre

Estado: P0–P3 verificadas localmente al 20sep2026; P3.1 (Mission Dock)
implementada y verificada localmente al 21sep2026; Fase A de infraestructura
(arneses, runtime, staging privado en staging.eyeinsky.org) cerrada al
24sep2026. P4 (satélites 3D) aceptada por KRÓNOS al 24sep2026 con excepciones
aprobadas por Alex. P5 (Tierra–Luna) aceptada por KRÓNOS al 25sep2026 con dos
criterios de rendimiento no resolubles documentados y una regresión P3 móvil
abierta; lo siguiente es integrar P5, release a staging y P6. P3 quedó aceptada por supervisión tras gates estáticos, navegador y una regresión RED→GREEN del estado terminal de mapa. Alex autorizó integrar/publicar el código en el fork público; la aceptación estética, la paridad global y un deployment web siguen separados porque el repositorio no tiene destino de despliegue configurado. Detalle maestro: `../superpowers/plans/2026-09-18-eyeinsky-universo-plan-maestro.md`.

## P0 — cerrada como base y spike técnico

Respaldo, inventario, contratos, ciencia y viabilidad. Referencias públicas independientes cotejadas. La aproximación lunar probada fue rechazada para precisión: resolver efemérides adecuadas ANTES de integrar P5. Esto no es un bloqueo de P2 ni una Luna ya construida.

## P1 — corte local verificado

Escena negro global/verde cercano; navegación flotante simplificada; búsqueda derecha; Instrumentos; catálogo con descripción/cobertura/acceso; lista activa inicialmente vacía con Agregar/Volver/Apagar/Deshacer y configuración preservada. Validación en cinco viewports; no teléfono físico ni aceptación estética automática.

## P2 — corte local verificado

Director cinematográfico interrumpible, encuadre al activar capas, reduced-motion, revelado terminal y Aladino reversible. Regresiones de rueda/render y Deshacer rápido/foco cerradas. Cabina con fixture; picking universal y paridad global siguen pendientes.

## P3 — verificada y aceptada técnicamente

Implementación realizada con Claude Code `claude-opus-5` como único escritor y verificación independiente. Plan y diseño: `../superpowers/plans/2026-09-19-eyeinsky-p3-implementation.md` y spec enlazada. Evidencia canónica local: `output/eyeinsky-p3/supervisor/FINAL-ACCEPTANCE.md` y `.json`.

Expediente y actividad:

- [x] Expediente inferior derecho abierto por defecto; hoja compacta móvil sin perder instrumentos ni globo.
- [x] Jerarquía identidad/fuente/edad/datos/fotos/acciones; ausencias visibles sin telemetría inventada.
- [x] Fotografías reales curadas, slider accesible y suspensión por foco/puntero/hidden/reduced-motion.
- [x] Actividad conectada a mapas/cámaras/capas reales, terminales reintentables y single-flight.
- [x] Carreras A→B, eventos de imagen obsoletos, retry, saneado de secretos y zoom real cubiertos.
- [x] Recorridos P3, P0–P2, cámara adversa y cabina aprobados por el supervisor.

## P3.1 — Mission Dock, implementada y verificada localmente

Corte de presentación y autoridad sobre P3, con `claude-opus-5` como único
escritor. Commits `0ca97f7`, `1bb0ac3`, `3985708` y el commit de cierre de esta
fase. Evidencia local: `output/eyeinsky-p31/` (no versionada).

- [x] El expediente lateral derecho pasa a ser un Mission Dock inferior: riel
      siempre visible y cuerpo desplegable con tres paneles — OBJETIVO, MEDIOS
      (sólo si el contexto trae activos) y OPS.
- [x] La cápsula de Actividad bajo Ayuda pasa a ser la terminal `EYEINSKY OPS //
  LIVE`, tercer panel del dock, sobre el mismo modelo y fuentes de P3.
- [x] Autoridad de cámara separada de la identidad de selección: un gesto físico
      suelta la cámara y conserva el objetivo. `releaseCameraOwnership` frente a
      `stopTracking` en vuelos, militar y satélites; `refocusTrackedById` (SEGUIR)
      vuelve a engancharla.
- [x] `bhote-koshi-locator` retirado del runtime: sin capa, sin registro de
      serialización, sin receta ejecutable y sin entrada de interfaz. El módulo
      sigue en el árbol, con sus pruebas en verde, pero nada lo alcanza.
- [x] Recorrido de navegador nuevo `scripts/eyeinsky-p31.mjs`: 15/15 en cinco
      viewports reales (incluido 768×1024), alcance de controles, pestañera y
      foco, medios reales atribuidos, zoom real CDP al 200 % con
      `visualViewport.scale === 2`, Vista limpia, gesto físico que conserva
      `flights:<id>` y SEGUIR que recupera la misma entidad. El desmontaje/remontaje
      del dock también demuestra que el listener anterior no vuelve a responder.
- [x] Regresiones P3 (30/30), P0–P2 (23/23), cámara adversa y cabina (4/4) en
      verde contra este candidato.

Bhote Koshi queda **aplazado**, no cancelado: será una experiencia contextual
futura y NO permanente. Mientras no exista ese diseño, la retirada es el estado
honesto; reintroducirlo exige una fase propia, no un interruptor.

## Fase A (2026-09-24) — herramientas, arneses y staging privado, cerrada

- [x] Bug móvil del Mission Dock corregido; arneses heredados en verde; 4.311 tests, 0 fail.
- [x] `CLAUDE.md` y toolkit `.claude/` (everything-claude-code + antigravity).
- [x] Runtime de producción endurecido y `deploy/` con release verificado, smoke y rollback.
- [x] `staging.eyeinsky.org` privado (basic-auth, noindex) sirviendo P3.1 desde el VPS; `eyeinsky.org` intacto.
- [ ] Claves de proveedores en `eyeinsky.env` del staging (sin ellas no hay 3D Tiles/ion/voz).
- [ ] Ejecutar el release procedure contra producción sólo en P7 con orden separada.

## P4 — satélites 3D, aceptada (2026-09-24) con excepciones aprobadas por Alex

Rama `eyeinsky/p4-satellites-3d` (worktree `C:/Users/Alex/orca/eyeinsky-p4`).
Plan: `../superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`; propuesta
aprobada y matriz P4-01..25 con evidencia: `p4/PROPUESTA-P4-2026-09-24.md` §9;
curación: `p4/T0-FINDINGS.md`. Commits: `2bf513f` propuesta, `bf8dec8` T0,
`34e87bb` T1–T3, `f3f264f` follow-ups de revisión, `0a5025d` T4, `e0650de`
T5–T6, `64880d1` T7. Evidencia local (no versionada): `output/eyeinsky-p4/`.

- [x] Modelos curados de NASA 3D Resources (revisión `11ebb4ee`), con fuente,
      términos, escala, ejes, bytes y SHA-256 en los cuatro ledgers: ISS (A)
      específico para NORAD 25544, Hubble (A) específico para NORAD 20580 y
      CubeSat 1U de familia sólo para el grupo `cubesat`. Crédito dinámico
      «Source: NASA 3D Resources» mientras hay un modelo activo.
- [x] Excepciones de curación aprobadas: Draco aceptado; Hubble con excepción de
      memoria en `std` y sólo punto en `low`; CubeSat 1U con 18 primitivas.
- [x] Identidad y órbita SGP4 separadas de la geometría (específica / familia /
      sin modelo; nunca por nombre) y de la actitud, siempre rotulada como
      aproximada y sin números.
- [x] Puntos globales intactos y pickables; modelos sólo cercanos. Perfiles
      `std` (2 modelos), `low` (1, móvil/puntero táctil) y `off`. LOD por
      píxeles proyectados (seguido ADD 6 / KEEP 3 px; secundario 16 / 10 px con
      techo 25 / 30 km), reconcile 250 ms, evicción tras 2 s, timeout de carga
      20 s, veto tras 3 fallos, `environmentMapOptions` desactivado.
- [x] INSPECCIONAR / ÓRBITA en el Mission Dock (clamp(8·radiusM, 6 m, 5 km)),
      con motivo visible cuando está deshabilitada; pick sobre el casco no
      deselecciona; retícula de 4 px cuando el modelo ≥ 24 px.
- [x] Chips MODELO / ESCALA REAL / ACT. APROX. / ÉPOCA / CACHÉ / MODELO NO
      DISPONIBLE; riel móvil ALT · ÉPOCA · MODELO; cámara con sesgo para no
      quedar bajo el dock en móvil; estados «Posición calculada (SGP4)» y
      «Propagación falló (SGP4)».
- [x] OMM JSON para los grupos núcleo (NORAD de 6 dígitos exacto) y TLE para
      `dense`; proxy con lista blanca y `FORMAT=json`; Alpha-5 rechazado (antes
      colapsaba en NaN); edad de órbita por régimen; órbita caducada → sin
      modelo y con rótulo.
- [x] Activo 404 o corrupto, caída de la fuente y cambio A→B conservan NORAD,
      punto, órbita, cámara y expediente.
- [x] Gates: suite de 4.507 tests / 0 fail; build, format:check y
      check:boundaries en verde (P4-15).
- [x] Arnés `scripts/eyeinsky-p4.mjs` 42/42 (21 ids de la matriz aprobados en
      arnés; P4-12 y P4-15 por gates y arneses, P4-14 por `perf-repeat`, P4-24
      por excepción). Regresiones: p31 15/15, p3 30/30, p012 23/23, cámara
      adversa, cockpit 4/4 y smoke. Supervisor independiente y reparación.
- [x] Rendimiento en GPD Win 4 (Radeon 890M, ANGLE/D3D11, modo `windows`,
      70–75 °C): `low` cumple todo en `perf-clean`; `std` cumple A y B2 en
      `perf-repeat` (n=3 intercaladas); E = A-off + 2 comandos (EntityCluster,
      excepción aprobada por Alex); E2 − E heap +0,25 MiB. Sin FPS. Detalle en
      `../PERFORMANCE.md`.

Límites honestos: la sesión de medición contaminada (LoL abierto, modo
`gaming`, 85–90 °C) se descartó; n=3 sin intervalo de confianza y sólo CPU del
hilo principal; sin teléfono físico; el tope de 2 modelos simultáneos sólo está
probado en unitarios (el recorrido nunca pasó de 1); con gestos reales en
INSPECCIONAR el seguimiento se suelta (diseño P3.1, `interruptHumanNavigation`),
así que no hay órbita manual alrededor del modelo; la calibración §5 sólo se
pudo ejecutar por API (2 eventos/min, justo en el límite); el heap en `off` sube
+1,56 MiB entre ciclos sin atribuir; el `commandList` leído justo tras disable no
está verificado. Sin release a staging todavía.

## P4.1 — pendientes (candidatos, NO iniciado)

- [ ] Órbita manual alrededor del modelo en INSPECCIONAR (decisión de producto
      de Alex sobre `interruptHumanNavigation`).
- [ ] Huella y pases.
- [ ] Modelos GEO (TDRS, GOES) con NORAD verificado en SATCAT.
- [ ] Actitud `yaw-steering` (GNSS).
- [ ] Dos modelos simultáneos ejercitados en el arnés de navegador.

## P5 — Tierra–Luna, aceptada (2026-09-25) con dos criterios de rendimiento no resolubles

Rama `eyeinsky/p5-tierra-luna` (worktree `C:/Users/Alex/orca/eyeinsky-p5`),
sin integrar aún en `main`. Propuesta aprobada por Alex y matriz P5-01..18 con
su estado al cierre: `p5/PROPUESTA-P5-2026-09-25.md` §9. Procedencia:
`p5/ASSET-LEDGER.md` y `../../DATA_SOURCES.md`; límite de móvil:
`p5/LIMITES-MOVIL.md`. Commits: `a0b7ef9` propuesta, `51864e3` T0–T3,
`5ee9868` T4–T7, `36824fa` T8–T9, `1a929b1` pulido. Evidencia local (no
versionada): `output/eyeinsky-p5/`.

- [x] **Efemérides versionadas y comparadas con JPL.** Tabla Chebyshev DE441
      (`public/data/moon-de441-2021-2040.bin`, 120.792 B, segmentos de 8 d,
      orden 10, float32) generada desde JPL Horizons y revalidada en los 20
      años: máx 0,035 km (175.488 medias horas, fronteras ±60 s y 265
      perigeos). Simon1994 medido a 782 km / 6,5′ → prohibido para la Luna
      (confirma P0) y permitido sólo para el Sol (0,074′); una guarda falla si
      reaparece en `src/`.
- [x] **Fuera de rango honesto.** Respaldo astronomy-engine `GeoMoon`
      rotulado «≤20 km» (barrido denso 2021–2040: máx 16,07 km), cargado como
      chunk aparte sólo fuera de rango; ΔT desde `JulianDate.leapSeconds`.
- [x] **Un solo reloj.** `sceneClock` gobierna `viewer.clock`: vivo con
      resincronización suave, pausa y simulación ×1…×3600; hold de render y
      repintado en seeks. Los consumidores de `currentTime` quedan fijados por
      test. SGP4 y feeds siguen en hora real.
- [x] **Marcos explícitos.** ICRF→ECEF con `preloadIcrfFixed`, nunca TEME;
      gate de 0,035′ frente a puntos sublunares ITRF de Horizons; punto
      sublunar con corrección de tiempo de luz; «CARGANDO/SIN MARCO» sin
      fallback.
- [x] **Una sola Luna, escala física por defecto.** Luna nativa apagada; Luna
      propia (`Primitive` sobre `Ellipsoid.MOON`, profundidad, pick, Lambert
      con el Sol de escena, orientación IAU síncrona rotulada aproximada,
      0,009° frente a MOON_ME). Textura NASA SVS LROC 1k/2k (dominio público,
      crédito SVS) con placeholder determinista. Modo didáctico ×10 sólo en el
      radio y con banda. Apagado sin fugas en 20 ciclos; WGS84 intacto.
- [x] **Presente ≠ simulado.** En simulación las capas en vivo se suspenden con
      «Sin histórico: solo hora real» y AHORA restaura el mismo conjunto; una
      pausa en vivo de más de 60 s anuncia la suspensión.
- [x] **UX.** Tira TIEMPO (chip compacto en móvil), APUNTAR A LA LUNA, SISTEMA
      TIERRA–LUNA (rótulo TIERRA, callouts despejados), ESCALA, VOLVER A TIERRA
      con estado exacto, panel OBJETIVO Luna y retícula con flecha de borde.
      Atajos L / Shift+L / P / N / Esc (Espacio sigue siendo la voz). Enlaces
      compartidos con `t` / `tr` / `lm` y el rango leído de la tabla; el
      Director restaura el reloj.
- [x] **Gates** (`output/eyeinsky-p5/polish/`, sobre el árbol de `1a929b1`):
      suite de 4.769 tests (4.759 pass, 10 skip, 0 fail); build,
      format:check y check:boundaries en verde.
- [x] **Arnés** `scripts/eyeinsky-p5.mjs` 38/38 (`final/p5/`, HEAD
      `1a929b1`, Radeon 890M). p31 15/15 (`final/p31/`). p4 42/42
      (`kronos-final/p4/`, árbol de T8–T9). p012 23/23, cámara adversa 9/9,
      cockpit 4/4 y smoke sin fallos en su JSON (`supervisor-1/reg/`, árbol
      anterior a T8–T9). Supervisor independiente y reparación (REANUDAR desde
      pausa en vivo, foto de retorno con capas suspendidas, «Apagar» alcanzable
      en 390 px, foco de teclado, regresión P4 restaurada) y pulido de mediums.
- [x] **Regresión P3 en móvil cerrada (P5-15).** `final/p3/` daba 27/30
      (`p3-11-surface-quality` en 390×844, 360×800 y 844×390: texto de la tira
      TIEMPO y de las acciones Tierra–Luna a 13 px). Ahora todo tamaño de
      `eyeinsky-earth-moon.css` pasa por `--eye-earth-moon-text` (13 px
      escritorio, 14 px con `max-width: 650px` o `max-height: 520px` apaisado)
      y la etiqueta FECHA UTC usa `.eyeinsky .eye-time-field` para ganar a
      `.eyeinsky label` (13 px global). Test `src/ui/eyeinskyEarthMoonType.test.mjs`
      (RED→GREEN). El arnés P5 exige ya 14 px en teléfono
      (`MIN_TEXT_PX_PHONE`), igual que P3; `mobile-sim-readout-fits` confirma
      que la lectura cabe en 360 y 390 px y no hay targets < 44 px.
      regresión final en secuencia sobre el árbol de `1a929b1` + regfix (`output/eyeinsky-p5/regfix/final2/`, 2026-09-25 18:28–18:41 UTC): p5 38/38, p31 15/15, p4 42/42, p3 30/30, p012 23/23, cámara adversa 9/9, cockpit 4/4, smoke sin fallos, mobile 12/12, focus 12/12, journey 25/25 y states 19/19 (todos exit 0; cámara adversa re-ejecutada tras un fallo de arranque de Chrome «browser is already running» con perfil temporal nuevo, log en `camera-adverse-launchfail.log`). Gates en `final2/gates/`: `npm test` 4.775 tests (4.765 pass, 10 skip de plataforma, 0 fail), build, doctor, format:check y check:boundaries en verde.
      Endurecimiento de arneses (no de la app): la lectura Node→proxy de P4
      reintenta un `connect ETIMEDOUT 127.0.0.1:4204` transitorio y lo
      registra (`scripts/eyeinsky-p4-network.test.mjs`); el conteo de órbitas
      de P4-09 ya no cuenta la retícula del shell; la vista de partida de
      `shortcuts` (P5) se coloca a 90° de la sublunar en vez de en −100°.
- [x] **Rendimiento (P5-16), cumple parcial: 4/6 criterios, 2 no resolubles.** GPD Win 4 (`perf-clean/`, modo `windows`,
      69–73 °C en ventana, n=3 intercaladas, vista de P4): M1 y M2 ≤ A+3 ms
      cumplen (Δp95 −0,5 y −2,0 ms); S sin long tasks y heap ≤ +2 MiB cumple;
      E comandos = A cumple. **No resolubles:** A′−A Δp95 (mediana −0,4 ms,
      pero +1,3 ms en una ronda con una sesión Playwright ajena activa) y el
      heap de E (+0,5…+1,5 MiB residual tras apagar, no atribuido). La medición
      anterior se descartó por contaminación (modo `gaming`, 82–92 °C). Sin
      FPS. Detalle en `../PERFORMANCE.md`.

Límites honestos: sin teléfono físico (`p5/LIMITES-MOVIL.md`); 1k y 2k son
versiones distintas del mapa SVS (2019 y 2025) y cambian de tono; el despeje de
SISTEMA oculta todos los callouts de detección, no sólo los que tapan; hay una
carrera rara con la navegación entre ciudades; un enlace fuera de rango con la
Luna apagada y la tabla sin cargar no pausa; los +2 comandos constantes con la
Luna fuera de cuadro no están verificados; `eyeinskyShell.js` mide 1.502 líneas
(deuda previa, +111 en P5); los satélites no se re-propagan a tiempo simulado
(por diseño); el servidor Vite de desarrollo compartido rechazó a veces
conexiones de loopback (`ERR_CONNECTION_TIMED_OUT` / `connect ETIMEDOUT` a los
~0,3–1,3 s) bajo carga: un módulo sin cargar deja la app en «Preparando el
observatorio…» y hace fallar cualquier arnés de forma no determinista (visto en
mobile, cámara adversa y p4; no es código de `src/`). Sin release a staging
todavía.

## P5.1 — pendientes (candidatos, NO iniciado)

- [x] Cerrar `p3-11-surface-quality` en móvil y re-ejecutar las regresiones
      sobre el árbol final: hecho en P5 (`regfix/final2/`, ver P5-15 arriba).
- [ ] Arneses contra un build (`npm run preview`) o servidor dedicado para no
      depender del Vite de desarrollo compartido (conexiones de loopback
      rechazadas bajo carga).
- [ ] Atribuir los +2 comandos con la Luna fuera de cuadro y repetir A/A′ en
      ≥ 2 rondas sin carga ajena.
- [ ] Atribuir el heap residual tras apagar la Luna (+0,5…+1,5 MiB).
- [ ] Tono uniforme de textura entre 1k y 2k.
- [ ] Despeje selectivo de callouts en SISTEMA TIERRA–LUNA; carrera con la
      navegación entre ciudades; pausa de enlace fuera de rango con Luna
      apagada.
- La superficie lunar explorable es P6, no P5.1.

## P6 — Luna explorable, NO iniciado

- [ ] Superficie global/relieve con fuentes LROC/LOLA, resolución/cobertura/datum declarados y LOD apropiado.
- [ ] Cara lejana, polos, antimeridiano, picking, colisión cuando proceda e iluminación sin atmósfera terrestre.
- [ ] Regresar a Tierra conservando cámara/capas/selección, sin recursos ni listeners huérfanos.
- [ ] Prueba en GPD y teléfono físico, pérdida de red y límites GPU. Una esfera decorativa no acredita esta fase.

## P7 — integración y aceptación, NO iniciado

- [ ] Recorridos completos R01–R10 y matriz de paridad con upstream, sin omitir limitaciones antiguas.
- [ ] Tests/build/types/boundaries/formato, responsive y teléfono físico.
- [ ] Rendimiento medido con misma escena/capas/perfil y recursos reversibles por flags.
- [ ] Revisión de Alex y aceptación estética/funcional.
- [ ] Publicación sólo con orden separada, respaldo y verificación real del destino.

## Pendientes transversales

Cobertura/reproducción CCTV, picking de tráfico/contactos superpuestos, acceso/estabilidad de proveedores, sensor de inclinación opcional, derechos por activo y paridad total. No prometer más FPS sin medición comparable. No mezclar correo, formularios aplazados o terminal del sistema con estas fases.
