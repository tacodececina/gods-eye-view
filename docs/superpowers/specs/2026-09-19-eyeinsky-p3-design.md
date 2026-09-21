# EYEINSKY P3 — Diseño de expediente y actividad

Estado: diseño propuesto para revisión de Alex; implementación NO iniciada.
Fecha de inspección: 2026-09-19, hora local del GPD.
Autor: KRÓNOS. Claude Code Opus 5 es el ejecutor solicitado para el workflow futuro, NO el autor de este documento: su preflight real devolvió `Credit balance is too low`.
Alcance interpretado: P3, el siguiente lote recomendado en la conversación. P4–P7 permanecen fuera de ejecución.
Base verificada: `812d75c0833887069e31cc2218d47b728b9cad36`, rama `eyeinsky/p0-p2-checkpoint-2026-09-18`.

## 1. Resultado que debe sentir Alex

El globo sigue siendo el espacio principal de trabajo. La esquina inferior derecha contiene una ventana de expediente breve, legible y abierta; al seleccionar un contacto cambia su información sin cambiar la identidad del contacto ni secuestrar la cámara. Bajo Ayuda hay una cápsula de actividad: explica qué se está cargando y permite abrir el detalle. No hay un tablero de métricas persistente ni una segunda consola.

Dirección única: vidrio mineral, negro orbital, ventanas de inteligencia simples, datos visuales útiles. Se conserva Space Grotesk para jerarquía e IBM Plex Mono para valores. No se reabre el rediseño A/B/C ni se interpreta «mejor 3D» como botones extruidos.

Tres alternativas de ingeniería consideradas, no variantes estéticas:

1. RECOMENDADA: adaptar el inspector existente con módulos puros de presentación y adaptadores de lectura sobre los dueños actuales. Menor riesgo de romper capas, voz y cabina.
2. Duplicar todo el contexto en un store global nuevo: descartada; dos selecciones autoritativas y carreras de datos.
3. Rehacer paneles en otro framework: descartada; no resuelve el problema y amplía injustificadamente el lote.

## 2. Composición y proporciones propuestas

### Escritorio

- Reutilizar `#eye-inspector`, anclar abajo a la derecha, no ocupar toda la altura como el inspector actual. Ancho objetivo 360px, límite 400px y máximo de 32vw en escritorio amplio. Si el contenido exige más altura, scroll interior; no reducir tipografía.
- Máximo de altura inicial 48dvh y límite expandido de 60dvh, siempre descontando atribuciones y controles. Si el viewport no admite estos límites, usar composición compacta, no superponer superficies.
- Respetar variables `--eye-safe-*`; separación mínima entre grupos 12px. Medir geometría real del crédito, no esconderlo con una franja fija arbitraria.
- Cápsula de actividad en el grupo de utilidades, en una fila inmediatamente debajo de Ayuda. Detalle de máximo 320px de ancho, sólo al abrir. No extenderla sobre búsqueda o sobre el expediente.
- No añadir cabecera, footer o telón modal. El centro del globo y los controles de cámara siguen recibiendo entrada.

### Teléfono y landscape

- Hoja inferior no modal, abierta en resumen al iniciar. Resumen de identidad, estado y botón «Ampliar», objetivo de altura de 144–192px según safe areas. Detalle con scroll hasta 60dvh; teclado virtual modifica el espacio mediante visualViewport.
- En landscape bajo usar una tarjeta lateral compacta; no forzar una hoja alta que cubra el globo. Elegir por ancho Y altura disponibles.
- Abrir Catálogo/Señales/Preferencias suspende la hoja visualmente, conservando contexto y estado anterior. Al volver a Explorar se restaura salvo cierre explícito del usuario.
- Actividad expandida y expediente expandido son excluyentes en móvil. El cierre de uno devuelve foco al disparador, nunca a un elemento oculto.
- Targets de 44×44px como mínimo y texto esencial de 14px. Escritorio: texto esencial de 13px. Contraste mínimo 4.5:1, estados con texto e icono además de color.

### Esquema de posición, no simulación del producto

```text
ESCRITORIO
 marca       Explorar / Vistas / Instrumentos / Más     búsqueda
                                                       Acciones / Ayuda
 capas activas                                         Actividad ▾
                 GLOBO INTERACTIVO REAL
                                               ┌ Expediente ──────┐
                                               │ identidad/fuente │
                                               │ visual + valores │
                                               │ medios / acciones│
                                               └──────────────────┘
       instrumentos / telemetría             créditos accesibles

MÓVIL
 navegación / búsqueda / Ayuda / Actividad
 capas resumidas
                 GLOBO INTERACTIVO REAL
 ┌ Expediente: identidad, estado, Ampliar/Cerrar ─┐
 └───────────────────────────────────────────────┘
 atribuciones y salida de vista limpia fuera de la hoja
```

## 3. Expediente: contenido y comportamiento

### Jerarquía

1. Contexto: «Vista · Tierra» o «Objetivo · tipo». Título e ID estable; nunca reemplazar un ID por callsign o nombre.
2. Procedencia: proveedor, hora de observación si existe, hora de consulta separada y disponibilidad. `updatedAt` del contextStore significa actualización local, no medición del proveedor.
3. Visual útil: brújula/rumbo y escala relativos a la cámara, o localizador de posición del objetivo. Mostrar unidad, etiqueta y valores equivalentes en texto.
4. Valores relevantes: máximo cuatro prioritarios; resto en «Detalles». No ceros ficticios para campos ausentes. «No informado» cuando no exista dato.
5. Fotografías de archivo y crédito; medios opcionales nunca condicionan selección o render.
6. Acciones aplicables, conectadas a comandos ya existentes: abrir fuente, abrir controles del contacto, centrar mediante la autoridad P2, guardar contexto en Operación. Sin botones aparentes que no hagan nada.

### Vista inicial

- Sin objetivo, mostrar Tierra/vista actual, mapa activo, centro de cámara y altura. No activar capas ni seleccionar un contacto al abrir.
- No llevar foco al expediente al arrancar; su apertura predeterminada no interrumpe navegación.
- Una brújula SVG simple, accionable por teclado/tacto, llama a Norte mediante el controlador vigente. No simular radar o datos orbitales.

### Objetivos y selección

- USGS: preservar magnitud, profundidad, hora del evento, última consulta e ID exacto. La ruta actual de lista/selección debe continuar funcionando.
- Vuelos/militares/satélites: usar los carriles `gev:awareness-subject-selected` y `gev:awareness-subject-cleared`, no sólo `viewer.selectedEntityChanged`. El evento de vuelo se emite antes de `selectTrackedSubjectContext`; releer en microtarea y validar identidad/generación antes de presentar.
- Entidades con contexto registrado: observar `gev:entity-selected` y `gev:entity-selection-cleared`; consumir datos públicos existentes sin modificar el store.
- CCTV: usar `subscribe`/`getUIState` y `activeCameraId`; NO decidir una nueva selección a partir de cada actualización automática de fotograma. Sólo cambios de ID admitidos por la autoridad actual.
- Contactos sin adaptador enriquecido conservan la selección y su interfaz nativa. Mostrar información mínima con procedencia conocida, nunca una ficha falsa ni una capa deshabilitada para ocultar el faltante.
- Cambiar A→B invalida solicitudes de medios y completamientos de A. El key de presentación incluye layerId + stableId; revisiones del mismo objetivo no vuelven a abrir una ventana cerrada ni reinician cámara.
- Desaparición por caducidad: conservar último dato con «Ya no está en el conjunto actual»; cierre deliberado o cambio de objetivo vuelve a la vista. Distinguir eventos de expulsión frente a deselección.
- Home conserva su semántica de navegación P2 y vuelve a la ficha de vista. El cambio a ficha de vista sustituye el antiguo cierre del inspector; las pruebas que esperaban inspector oculto se actualizan por este contrato explícito, no eliminando comprobaciones de render/foco.
- No clonar `right-context-rail`, `global-context-panel`, panel de CCTV ni controles de cabina. Permanecen los dueños existentes y se ofrecen accesos contextuales; un rótulo anclado al contacto no se confunde con un segundo expediente.

### Cierre y restauración

Estados de presentación: abierta-resumen, abierta-detalle, cerrada-por-usuario, suspendida-por-superficie. El contexto es independiente de estos estados.
Cerrar afecta la presentación, no borra selección, seguimiento o capas. Un refresco del mismo ID no reabre; un nuevo objetivo explícito sí. «Expediente» en Instrumentos reabre siempre. Ambas rutas de Vista limpia ocultan expediente y actividad, retiran sus controles del foco y restauran exactamente sus estados anteriores al salir.

## 4. Medios y derechos

- Slider manual por defecto: anterior/siguiente, índice y botón «Reproducir» opcional. Si el usuario lo activa, intervalo propuesto de 6s. Pausa con foco, puntero sobre el slider, pestaña oculta, panel oculto o reduced-motion; no reanudar automáticamente después de interacción.
- Máximo una imagen actual y una siguiente precargada, cada derivado de hasta 350KiB y 1280px de lado mayor. Estos son presupuestos de diseño, no mediciones actuales. Máximo inicial cuatro imágenes curadas por contexto.
- Carga diferida, decoding async y ratio reservado para evitar saltos. Error/timeout: «Fotografía no disponible» y la ficha sigue operativa. Cancelar o ignorar solicitudes previas mediante generación.
- Registro por activo: ID, contexto/objeto, fidelidad (específico/familia/contextual), URL de procedencia, autor, licencia y URL de licencia, crédito, dimensiones, bytes, SHA-256 y fecha de verificación. Usar versiones locales autorizadas; rechazar URLs javascript/data y hosts no admitidos.
- No descargar por búsqueda arbitraria durante cada selección. No inferir permiso comercial de NASA, de MIT del repo ni de un logotipo visible en la web. Un medio no autorizado no entra al manifiesto publicable.
- Entrega mínima de curación: dos fotos reales de contexto Tierra con permiso verificado para probar slider; asociarlas sólo a «Vista · Tierra». Los objetivos sin medios verificados muestran estado sin foto, nunca una foto terrestre presentada como foto del objetivo.
- Marcas: sólo las ya licenciadas para el producto o las autorizadas por su titular. Sin licencia, nombre textual del proveedor. Una marca no implica patrocinio.
- No usar un stream vivo de CCTV como «fotografía de archivo» ni capturarlo para almacenar sin permiso. El reproductor conserva su ciclo de vida y gesto de audio.

## 5. Actividad: semántica y fuentes

La cápsula muestra «Sin cargas», «Cargando · N», «Completado» o «Revisar · N», derivados de trabajo observado. El popup agrupa Capas, Cartografía y Cámaras. Un pequeño historial visual de eventos seleccionables abre el detalle del evento; no un gráfico de actividad inventada.

- Capas: `dataManager.getAll()`, `subscribe(callback)` y `subscribeActivity(callback)`; reutilizar `aggregateLayerLoading`. Estados de lifecycle y refresh mantienen su autoridad original.
- Mapas: snapshot `mapStackController.getState()` y evento `gev:map-stack-changed`. Ready significa cambio de stack terminado, NO que todas las teselas del planeta están cargadas. Para carga visible de terreno usar evento público `viewer.scene.globe.tileLoadProgressEvent` sólo si está disponible; el número de pendientes no es un total estable. Teselas 3D requieren su evento público en el tileset realmente activo, con rebinding/desuscripción al cambiar stack; si no hay acceso público no proclamar cobertura total de teselas.
- CCTV: separar carga de catálogo/capa, preparación de geometría y fotogramas. `getUIState().loading.loaded/total` describe geometría, NO disponibilidad de streams. `ambientCards.fetchesInFlight` describe solicitudes, NO cámaras accesibles.
- Denominador desconocido o cambiante: progreso indeterminado y etiqueta del trabajo. Nunca sumar teselas, cámaras, bytes y entidades en un porcentaje global. Las cuentas de registros son resultados, no progreso de descarga.
- Estados finales: ready, partial, error, cancelled y blocked además de idle/loading. Datos parciales se mantienen visibles; «acercar», «vacío» o «sin resultados» son guía, no fallo de red.
- Errores se traducen a mensajes seguros; no exponer URL firmada, query string, token, cabecera o stack trace. Un 401/configuración requerida ofrece ir a configuración existente; no leer secretos.
- Reintento: sólo la operación que admite repetición. `refreshLayer` para capa ya habilitada; reactivar una activación fallida sólo tras acción explícita, vía `setEnabled`. Una promesa en vuelo por operación; doble clic comparte intento y no cambia configuración.
- Mapa: reintento del stack fallido mientras siga siendo el intento vigente. Cambio posterior A→B cancela el reintento de A. No desactivar el mapa anterior útil.
- Cancelación visible sólo si existe autoridad real para esa tarea. Abort del intento propio no cancela las operaciones de otro dueño. Si una llamada no admite cancelación, no dibujar «Cancelar» ficticio.
- Historial local en memoria: máximo 40 eventos terminales, sin localStorage. Deduplicar estado repetido e intentos por ID/generación; no crear un elemento por tick. No reconstruir retroactivamente cargas anteriores al montaje: mostrar snapshot actual, no historia inventada.
- Abrir Actividad jamás solicita permisos ni dispara consultas. Cerrar no detiene trabajos del manager. Al destruir UI se liberan listeners y timers propios.

## 6. Datos y componentes

```text
Selección actual ── adaptadores de lectura ── modelo de expediente ── #eye-inspector
       │                                       │
       └─ dueños de tracking/cámara intactos    └─ medios por manifiesto/generación

Manager + mapas + CCTV ── normalización ── modelo de actividad ── cápsula / popup
                                           │
                                           └─ retry acotado al dueño existente
```

Módulos nuevos propuestos, NO encontrados como APIs existentes:

- `src/ui/eyeinskyDossierModel.js`: estado puro, identidad, revisiones, cierre/suspensión y generación.
- `src/ui/eyeinskyDossierSources.js`: adaptación de los carriles existentes, sin seleccionar ni mover cámara.
- `src/ui/eyeinskyDossier.js`: montaje DOM/acciones/motion, sin fetch de datos del proveedor.
- `src/ui/eyeinskyMedia.js` y `src/ui/eyeinskyMediaManifest.js`: medios admitidos, slider y propiedad de recursos.
- `src/ui/eyeinskyActivityModel.js`: estados/normalización de progreso/deduplicación y exclusión de retry.
- `src/ui/eyeinskyActivitySources.js`: observadores de manager/mapas/CCTV.
- `src/ui/eyeinskyActivity.js`: cápsula y detalle accesible.

Cada módulo con lógica pura tendrá prueba `.test.mjs` vecina. Montajes se validan en Puppeteer sobre la app real, no sólo con DOM simulado.

## 7. Límites de calidad y entrega

- No dependencias de UI nuevas, no React, no segundo Cesium Viewer, no segundo director de cámara.
- Motion propuesto de 180–240ms; reduced-motion sin traslación/decodificación decorativa. Texto esencial disponible desde el inicio.
- Datos: eventos/coalescing; edad actualizada como máximo cada 30s. Ningún requestAnimationFrame permanente nuevo para paneles. Detener timers de medios al ocultar/destruir.
- Cinco viewports del corte anterior y teclado/200%/safe areas. Una prueba de móvil emulado no sustituye teléfono físico.
- Baseline y comparación con misma GPU/viewport/capas; medir DOM writes, heap/listeners y fluidez. No prometer más FPS ni convertir muestras headless en rendimiento físico.
- Aceptación técnica P3, aceptación estética de Alex, paridad global y publicación son decisiones distintas. Un bloqueo de proveedor debe declararse, no maquillarse con fixtures.
- Exclusiones: satélites modelados P4, sistema Tierra–Luna P5/P6, publicación P7, correo, formulario aplazado, terminal del sistema y sensor físico.

## 8. Documentos de ejecución

- Plan: `../plans/2026-09-19-eyeinsky-p3-implementation.md`.
- Workflow: `../../eyeinsky/p3/WORKFLOW-CLAUDE-OPUS5.md`.
- Antecedente: `../../eyeinsky/FASES.md` y `../plans/2026-09-18-eyeinsky-universo-plan-maestro.md`, sección P3.

Aprobar este documento no acredita que las funciones ya existan. El único intento de Claude en esta preparación fue un preflight sin herramientas; no generó contenido ni cambios de producto.
