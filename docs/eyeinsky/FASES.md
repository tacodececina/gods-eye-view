# EYEINSKY — fases guardadas al cierre

Estado: P0–P3 verificadas localmente al 20sep2026; P3.1 (Mission Dock)
implementada y verificada localmente al 21sep2026; Fase A de infraestructura
(arneses, runtime, staging privado en staging.eyeinsky.org) cerrada al
24sep2026. P4 (satélites 3D) aceptada por KRÓNOS al 24sep2026 con excepciones
aprobadas por Alex; lo siguiente es P5. P3 quedó aceptada por supervisión tras gates estáticos, navegador y una regresión RED→GREEN del estado terminal de mapa. Alex autorizó integrar/publicar el código en el fork público; la aceptación estética, la paridad global y un deployment web siguen separados porque el repositorio no tiene destino de despliegue configurado. Detalle maestro: `../superpowers/plans/2026-09-18-eyeinsky-universo-plan-maestro.md`.

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

## P5 — Tierra–Luna, NO iniciado

- [ ] Adoptar efemérides versionadas precisas y compararlas con NASA/JPL. No reutilizar la aproximación rechazada por P0 como resultado aprobado.
- [ ] Unidades, marcos, tiempos y rango temporal explícitos; reloj coherente para cuerpos/luz/etiquetas.
- [ ] Escala física y modo didáctico claramente separados; no presentar feeds presentes como datos históricos simulados.
- [ ] Pausa/avance/Ahora, apuntar a Luna y cambiar contexto sin alterar silenciosamente WGS84 terrestre.

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
