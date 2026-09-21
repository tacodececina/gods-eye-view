# EYEINSKY — Entrega local P0–P2

Fecha: 18 de septiembre de 2026. Dirección y cierre: KRÓNOS / GPT-6-Astra. Construcción: GPT-5.6-Sol; revisión independiente en contexto separado. Cierre dirigido y corrección final de foco: KRÓNOS.

## Ya puedes probarla

http://127.0.0.1:4197/

Abre esa dirección en este GPD y recarga con Ctrl+F5. Es una preview local de desarrollo, no una publicación en eyeinsky.org. La aceptación estética sigue siendo tuya; no se toma la aprobación del PDF como aprobación del aspecto final.

## Recap de P0–P2

### P0 — Base y decisiones técnicas

- Se preservó el trabajo previo sin commit/reset, con respaldos y comprobación SHA.
- Inventario y contratos de capas, cámara, accesibilidad y fuentes; no se sustituyó Cesium ni se migró el framework.
- Spike aislado de marcos, unidades, tiempos UTC/TAI/TT/TDB, propagación OMM/TLE e identificadores NORAD de seis dígitos. Comparación con referencias públicas CelesTrak/Vallado y NASA/JPL.
- Decisión científica: la aproximación lunar ensayada NO satisface la tolerancia declarada. Queda rechazada como solución de precisión para P5; Tierra–Luna deberá usar efemérides apropiadas y validarse otra vez. No se presenta la Luna decorativa existente como exploración lunar construida.

### P1 — Escena y organización

- Globo a pantalla completa con controles flotantes y tratamiento de ventanas hacking/espías. Se simplificó la navegación a Explorar / Vistas / Instrumentos / Más.
- Universo negro a distancia global y tratamiento verde tenue al acercarse; responsabilidades de cielo, atmósfera y máscara separadas.
- Buscador derecho desplegable por ratón, foco, clic y tacto.
- Lista real de capas activas a la izquierda: empieza vacía en sesión nueva; Agregar abre catálogo, Volver regresa a la lista, y cada capa activa tiene su propio botón Apagar. Incluye capas fuera de los antiguos accesos rápidos.
- Catálogo con descripción, cobertura y condiciones de acceso por capa. Las fichas futuras no simulan actividad ni disponibilidad.
- Instrumentos abre instrumentos, no el catálogo disfrazado. Gráficos y controles de orientación/escala/datos conectados a estado real. En el diseño compacto móvil, el registro de señales se alcanza desde Instrumentos; el pequeño gráfico sísmico permanente de escritorio no está visible en ese breakpoint.
- Restauración explícita de estado compartido y configuración de capas, sin activar por defecto una sesión nueva arbitraria.

### P2 — Cámara e interacción

- Secuencias de alejamiento/reencuadre/acercamiento en las rutas integradas; encuadre al activar capas, con entrada manual prioritaria y alternativas de movimiento reducido.
- Revelado terminal decorativo que conserva los datos finales legibles; animación Aladino con Apagar/Deshacer sin perder la identidad/configuración de la capa.
- Se corrigió el fallo de render al interrumpir una cinemática con rueda y el vuelo de encuadre que ignoraba movimiento reducido.
- Se corrigió también una carrera de foco: un Deshacer rápido ya no queda anulado visualmente por el temporizador del apagado anterior. La regresión se vio fallar antes de modificar el código y se incorporó a `scripts/eyeinsky-p012.mjs`.

## Recorrido recomendado

1. Agregar → activa una capa → Volver a capas activas. Verifica que aparezca su fila, no sólo un contador.
2. Apagar → Deshacer, también rápidamente. La capa, su configuración y el foco deben volver.
3. Abre Instrumentos y Señales sísmicas; actualiza la consulta y selecciona un registro cuando haya datos. Cambia de objetivo para observar las transiciones.
4. Interrumpe una cinemática con rueda/arrastre y regresa a la vista global. El globo debe continuar respondiendo.
5. Prueba búsqueda, Vista limpia y una ventana estrecha. Los controles esenciales siguen accesibles; los créditos cartográficos no se eliminan.

Si recuperas una sesión guardada que tú habilitaste o entras mediante un estado compartido, pueden reaparecer sus capas. La lista vacía se verifica en sesión nueva, no destruyendo tu estado guardado.

## Verificación propia de la entrega

- `npm test`: 4,204 pruebas contabilizadas en sus tres procesos; 4,194 pasaron, 0 fallaron y 10 se omitieron. No se confunde el último resumen parcial de 13 con la suite completa.
- Build, formato, límites de módulos y TypeScript: exit0 sobre la versión final.
- Recorrido P0–P2: 23/23 comprobaciones, incluyendo la nueva regresión de Deshacer rápido.
- Recorrido independiente escrito por el supervisor: 16/16, escritorio y móvil; lista, catálogo, instrumentos, foco, modo limpio y créditos.
- Interrupciones adversas de cámara: 9/9; seguimiento/cabina/Home: 4/4 con fixture identificada. Esto último NO certifica disponibilidad de OpenSky ni picking universal con contactos reales superpuestos.
- Cinco viewports: 1920×1080, 1440×900, 390×844, 360×800 y 844×390. Son pruebas de navegador, no validación en un teléfono físico.
- HTTP200 y 1,315 archivos de fuente/configuración del inventario sin cambios durante el cierre. Sin commit, push ni publicación.

Evidencia final: `output/eyeinsky-immersive/p012/supervisor/focus-fix/green/verification.json`, `browser/p012-journey.json`, `own-journey/own-journey.json`, `camera/camera-adverse.json` y `cockpit.json`. Hay logs, capturas y manifiestos SHA en el mismo árbol. La comprobación propia de referencias científicas está en el árbol `supervisor`.

## Límites y pendientes

- Este es el corte local P0–P2 listo para tu revisión, no una declaración de paridad total con Gods Eye View ni aprobación estética automática.
- Continúan abiertos la cobertura/reproducción integral CCTV y la selección directa/picking de todos los tipos de contacto y superposiciones. Los proveedores pueden no entregar datos.
- No se afirma una mejora de FPS. La validación en un teléfono físico y la inclinación opcional del dispositivo no están acreditadas.
- No se construyeron en este corte el expediente multimedia ampliado, modelos satelitales nuevos, Tierra–Luna ni terreno lunar. No hay compras o permisos comerciales implícitos.
- Nota de trazabilidad: una ejecución RED del supervisor usó el directorio de salida predeterminado y sobrescribió artefactos iniciales `build/p012-*`. No usar esos archivos como evidencia histórica inmutable. La auditoría, la continuación y los cierres propios están separados; la entrega se fundamenta en `supervisor/focus-fix/green`. Detalle: `supervisor/focus-fix/ARTIFACT-PROVENANCE-NOTE.json`.

## Siguientes fases, todavía no ejecutadas

P3 — Expediente y actividad. Inspector inferior derecho abierto, datos organizados, fotos reales/slider y marcas con derechos comprobados; actividad bajo Ayuda conectada a cargas y errores reales.

P4 — Satélites 3D. Modelos específicos verificados o de familia claramente rotulados; LOD/carga cercana, identidad orbital estable y licencias por activo.

P5 — Tierra–Luna. Efemérides precisas en lugar de la aproximación rechazada, tiempo coherente, escala física/didáctica explícita y tránsito entre cuerpos sin confundir simulación con datos presentes.

P6 — Luna explorable. Superficie global con relieve y resolución declarada, polos/cara lejana/picking y retorno a Tierra conservando estado.

P7 — Integración y aceptación. Recorridos completos, paridad contra upstream, dispositivo físico, presupuesto de rendimiento y aceptación de Alex. La publicación requiere una orden separada y verificación del destino.

Recomendación: revisar primero la composición y los gestos de esta preview; después avanzar a P3 sin mezclar todavía modelos satelitales y Luna en el mismo lote.
