# EYEINSKY Universo — Plan maestro de implementación

> Autor: GPT-6-Astra / KRÓNOS. Estado: propuesta para aprobación de Alex; NO autoriza implementación, publicación, compra o cambios de motor. Sin delegación de autoría.
> Para la ejecución posterior: cargar executing-plans o subagent-driven-development según la modalidad que autorice Alex. Un escritor por lote; no commit/push sin orden.

Goal: implementar las diez solicitudes de Alex conservando las capacidades operativas del producto y extendiendo la exploración al sistema Tierra–Luna.
Architecture: Cesium terrestre existente, shell contextual, una autoridad de cámara, modelos orbitales bajo demanda y contexto lunar aislado condicionado a un prototipo. Sin cambio de framework ni de renderer por defecto.
Tech Stack: JS/TypeScript y Vite del proyecto; Cesium instalado 1.138.0, satellite.js 6.0.2; APIs y manager de capas existentes.
Spec: `output/eyeinsky-plan-universo-2026-09-18/plan.html` (25 páginas, versión PDF adjunta en esa carpeta). La transcripción está en `plan-texto.md`; visuales en `conceptos.html` y `visuals/`.

## Restricciones globales

- Universo negro en vista general; verde mineral tenue SÓLO al acercar. Separar universo, atmósfera y máscara Iris.
- 3D significa globo/escena/cámara/selección y cuerpos, no botones con relieve.
- Sin cabecera/footer del producto; mantener atribuciones legales visibles y pulsables.
- Lista de capas inicialmente vacía. Enlaces compartidos restauran su estado explícito; reanudar sesión previa es opt-in.
- Expediente inferior derecho abierto por defecto; en móvil, hoja inferior resumida. Instrumentos siempre descubribles en cápsula superior.
- Revelado binario decorativo, sin falsear ni demorar valores esenciales. Reduced-motion y control manual completos.
- Fotografías reales de archivo y geometría específica/familia/genérica rotuladas. Órbita calculada no equivale a medición en vivo ni determina actitud/modelo.
- Conservar todo el catálogo y funcionalidades upstream; no declarar paridad por una prueba parcial. V4 original10/11 y cierre aislado permanecen como evidencias separadas.
- Sin secretos en Markdown, cliente, logs o enlaces. Nada se publica sin aceptación y backup.

## Mapa de archivos

Existentes inspeccionados: `src/app/scene.js`, `src/app/viewer.js`, `src/scopeMask.js`, `src/ui/navigationController.js`, `src/navigationPolicy.js`, `src/app/constructCatalog.js`, `src/data/layerState.js`, `src/loadingFeedback.js`, `src/layers/satellites/index.js`, `src/layers/satellites/rendering.js`, `src/ui/templates/eyeinsky.html`, `src/ui/styles/eyeinsky.css`.

Puntos adicionales ya localizados: `src/ui/layers.js`, `src/ui/eyeinskyHud.js`, `src/standalone/catalog.js`. En implementación, releer definiciones y usos antes de editarlos.

Archivos NUEVOS propuestos, no APIs existentes:

- `src/ui/eyeinskyCameraDirector.js` y `.test.mjs`: encuadre, secuencia, cancelación; adaptador sobre NavigationController y navigationPolicy.
- `src/ui/eyeinskyLayerWorkspace.js` y `.test.mjs`: lista/catálogo y proyección del estado único del manager.
- `src/ui/eyeinskyDossier.js` y `.test.mjs`: ficha vista/objetivo y medios.
- `src/ui/eyeinskyActivity.js` y `.test.mjs`: agregador de tareas de carga.
- `src/app/bodySceneController.js` y `.test.mjs`: ciclo de vida por cuerpo y snapshot terrestre.
- `src/layers/satellites/modelRegistry.js` y `.test.mjs`: activo por ID/variante, LOD y fallback.
- `src/celestial/clock.js`, `ephemerides.js`, `frames.js` y pruebas vecinas: tiempo, efemérides, unidades y marcos.
- `src/lunar/scene.js`, `surface.js`, `selection.js` y pruebas vecinas: contexto lunar y exploración global.

## Contratos propuestos

- `SelectionContext`: bodyId, kind, stableId, source, epochUtc, boundingVolume. ID estable no se reemplaza por etiqueta visible.
- `CameraDirector.goTo(intent, signal)`: Promise con status completed/cancelled/failed. Intent contiene target, reason, framePolicy, motionMode. Cada intención usa una generación; sólo la vigente completa o publica estado.
- `LayerCatalogEntry`: id, category, description, availability, source, coverage. Availability distingue available/config-required/coming-soon. Visible/loading/error son estado de instancia, no disponibilidad del catálogo.
- `LoadTask`: taskId, layerId, status, loaded/total opcionales, error seguro. Progreso indeterminado cuando no hay denominador fiable.
- `AssetManifest`: id, stableObjectId, variant, url, allowedHost, mediaType, bytes, hash, license, credit, fidelity. Validar recursos antes de decodificar.
- `BodySceneController.enter(bodyId)` y `leave()`: snapshot cámara/capas/selección, cancelación de jobs y liberación de recursos. No cambiar Ellipsoid.default global.

## P0 — Base y viabilidad / 1–2 jornadas estimadas

- [ ] Respaldar V4 y conservar dirty tree previo; registrar hashes y manifest. No mezclar ni sobrescribir cambios ajenos.
- [ ] Extraer catálogo completo del registro y mapear navegación/instrumentos a sus dueños; no inferir disponibilidad sólo de la presencia de una tarjeta.
- [ ] Medir GPU nativa, viewport/DPR, capas y recorridos comparables. Registrar frames Cesium, input latency, memoria/cargas y baseline de selección superpuesta.
- [ ] Prototipo aislado: ellipsoid lunar explícito, cámara/picking en polos y cara lejana, retorno terrestre y liberación GPU. No integrarlo como entrega si falla.
- [ ] Validar conversión de unidades km→m en satélites, marcos TEME/inercial/cuerpo fijo y tiempo UTC/TDB/TT según fuente. Comparar muestras contra referencia y definir tolerancia a la escala visible antes de aprobar pipeline.
- [ ] Probar IDs OMM de seis dígitos y TLE heredado sin truncamiento. Fijar rango temporal de efemérides, caducidad y caché.
- [ ] Gate: enfoque lunar viable documentado, contrato de estado/cámara aprobado y presupuestos calibrados; alternativa requiere decisión explícita.

## P1 — Escena y shell / 4–6 jornadas

- [ ] Tests RED para lejos/cerca/lejos, sesión vacía vs share restore, hover/foco/tacto de búsqueda y acceso a instrumentos.
- [ ] Separar cielo, atmósfera y máscara; transición con histéresis por proximidad al cuerpo activo.
- [ ] Reubicar navegación y búsqueda; catálogo/lista activa con botón de regresar, disponibilidad y fichas Próximamente deshabilitadas.
- [ ] Integrar todo el inventario existente. Botones con nombres/estados planos; sin dashboard/header.
- [ ] GREEN unitarios + recorrido agregar/apagar/restaurar + cinco viewports; ningún cruce de controles ni créditos tapados.

## P2 — Cámara y movimiento / 2–4 jornadas

- [ ] Tests RED para cancelación por input, sustitución de objetivo, respuesta tardía descartada, lote de capas, cambio de escala y reduced-motion.
- [ ] Integrar goTo sobre la autoridad vigente, no un segundo flyTo dueño. Secuencia zoom out/reencuadre/zoom in con colisiones y padding de paneles.
- [ ] Encuadre contextual por volumen/FOV y región; si ya cabe, no mover. Actualizaciones de datos no reinician cámara.
- [ ] Añadir revelado decorativo y Aladino reversible, con limpieza de estilos y foco. Datos finales siempre disponibles.
- [ ] GREEN unitarios y seguimiento/cabina/Home con identidad exacta. Probar también objetivo solapado, no sólo aislado.

## P3 — Expediente y actividad / 3–5 jornadas

- [ ] Tests RED de vista/objeto, datos faltantes, medios fallidos, pausa de slider, cargas parciales/error/cancelación y restore de Vista limpia.
- [ ] Inspector abierto inferior derecho; hoja resumida móvil. Jerarquía identidad/fuente/datos/fotos/acciones.
- [ ] Fotos verificadas, etiquetas de archivo, marcas autorizadas y slider pausado con foco/reduced-motion.
- [ ] Actividad debajo de Ayuda conectada a eventos reales; conteo sólo cuando se conoce el total; reintento idempotente.
- [ ] GREEN accesibilidad/targets/créditos, modo offline y contextos sin datos. No esperar imagen para seleccionar objeto.

## P4 — Satélites 3D / 4–7 jornadas

- [ ] Fixtures de identidad/variante, OMM/TLE, época caduca, activo faltante/corrupto y LOD. Modelo nunca sustituye la identidad orbital.
- [ ] Curar un modelo específico verificable y una familia; registrar licencia/escala/hash/atribución.
- [ ] Mantener puntos/billboards globales y cargar 1–2 modelos cercanos como máximo inicial. Worker/colas/caché según perfil existente.
- [ ] Guardar posición calculada aunque falle el GLB; actitud aproximada etiquetada. Evictar recursos al cambiar objetivos.
- [ ] Gate: recorrido orbital y presupuesto con capas cargadas; no comprar ni prometer mallas específicas para todos los satélites.

## P5 — Tierra–Luna / 4–7 jornadas

- [ ] Tests RED de época, avance/pausa/Ahora, marcos/unidades, modo físico/didáctico y fuentes fuera de rango temporal.
- [ ] Pipeline de efemérides versionadas y muestreo/interpolación; comparar contra NASA/JPL con tolerancia documentada en P0.
- [ ] Escala física real y escala didáctica explícita; un reloj coherente alimenta cuerpos, luz y rótulos. No mezclar pasado simulado con feeds presentes como si fueran históricos.
- [ ] Apuntar a Luna y traspasar contexto preservando estado; no considerar completa la superficie por mostrar una esfera.

## P6 — Luna completa / 6–10 jornadas

- [ ] Pruebas de superficie global, cara lejana, polos, antimeridiano, relieve, picking y coordenadas/datum lunares.
- [ ] LROC/LOLA: reproyección y normalización; construir teselas/malla LOD compatibles con el prototipo. Declarar resolución y cobertura.
- [ ] Iluminación/terminador sin atmósfera terrestre; POIs con fuente. Colisión de cámara contra relieve cuando proceda.
- [ ] Retorno a Tierra con cámara/capas/selección correctas, sin listeners/render loops huérfanos.
- [ ] Gate: 360° + relieve + medidas + regreso en GPD y móvil físico, con pérdida de red y límites de GPU. No sustituir por disco/billboard.

## P7 — Integración / 3–5 jornadas

- [ ] Unitarios relevantes, `npm run test`, `npm run build` y scripts de tipos/boundaries/formato confirmados en manifest. No ejecutar formato global que reescriba archivos ajenos.
- [ ] Recorridos completos de R01–R10; mismo perfil/capas antes/después. Cinco viewports + dispositivo físico.
- [ ] Matriz de paridad upstream y limitaciones reales; aceptar sólo regresiones resueltas, no reemplazar reportes históricos.
- [ ] Feature flags para revertir shell, efectos, modelos y Luna por separado sin perder capas previas.
- [ ] Preview y revisión de Alex. Publicación separada, con backup y readback del destino si se autoriza.

## Estimación y recursos

27–46 jornadas netas estimadas para una vía principal. No son minutos/horas del modelo ni compromiso de calendario. Recalibrar con P0; excluir esperas de terceros. Requeridos: frontend/Cesium, pipeline geoespacial/celeste, curación de medios/licencias y QA. Storage/CDN, terreno, mapas, APIs y activos comerciales requieren decisión de coste; ninguna compra implícita.

## Evidencia documental

PDF: `output/eyeinsky-plan-universo-2026-09-18/EYEINSKY-Plan-Maestro-Universo.pdf`.
DOM/print: `layout-report.json` (25 páginas, fuentes cargadas, imágenes válidas, sin desbordamiento).
PDF: `qa/pdf-verification.json` (rasterización y texto de las 25 páginas, R01–R10).
Procedencia: `sources-ledger.json`, `assets/asset-manifest.json`.
Los bocetos son conceptuales, no funciones implementadas.
