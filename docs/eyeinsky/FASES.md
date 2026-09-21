# EYEINSKY — fases guardadas al cierre

Estado: P0–P3 verificadas localmente al 20sep2026; P3.1 (Mission Dock)
implementada y verificada localmente al 21sep2026. P4 sigue SIN iniciar y es lo
siguiente. P3 quedó aceptada por supervisión tras gates estáticos, navegador y una regresión RED→GREEN del estado terminal de mapa. Alex autorizó integrar/publicar el código en el fork público; la aceptación estética, la paridad global y un deployment web siguen separados porque el repositorio no tiene destino de despliegue configurado. Detalle maestro: `../superpowers/plans/2026-09-18-eyeinsky-universo-plan-maestro.md`.

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

## P4 — satélites 3D, plan preparado; implementación NO iniciada

Plan ejecutable: `../superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`.

- [ ] Curar al menos un modelo específico verificable y uno de familia, con licencia, escala, procedencia y hash.
- [ ] Distinguir identidad/orbita propagada, geometría específica/familia/genérica y actitud aproximada.
- [ ] Puntos/billboards globales y modelos sólo cercanos; LOD, caché/evicción y presupuesto con capas cargadas.
- [ ] Cubrir OMM/TLE, época caduca, activo ausente/corrupto y selección intacta si falta el GLB.

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
