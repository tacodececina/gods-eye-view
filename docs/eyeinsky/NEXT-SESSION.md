# EYEINSKY — siguiente sesión

## Estado y alcance guardado

Alex pidió guardar el repositorio, fases, apuntes y lo relevante y cerrar la sesión. Se prepara un checkpoint local en `eyeinsky/p0-p2-checkpoint-2026-09-18`, conservando la integración completa que necesita P0–P2: F2, reparación de capacidades e Iris V3/V4. No se separan artificialmente parches que dependen entre sí. No se autoriza push, merge a main, publicación ni comenzar P3 por guardar este checkpoint.

- Producto: `C:/Users/Alex/AppData/Roaming/orca/codex-runtime-home/home/worktrees/ea9e/gods-eye-view`.
- Clon principal y evidencia pesada: `C:/Users/Alex/orca/gods-eye-view`.
- Git común: `C:/Users/Alex/orca/gods-eye-view/.git`.
- Base de trabajo: `0d41b6be5490db1f10a171f238be75db4d4ec3b4` (upstream PR626).
- Preview local: http://127.0.0.1:4197/; se deja intacta. Su disponibilidad debe medirse al retomar.
- Supervisión/plan: KRÓNOS con GPT-6-Astra. Constructor y auditor independiente: GPT-5.6-Sol en sesiones distintas. La reparación final de foco y el cierre fueron propios de KRÓNOS.

## Lectura mínima

1. Este archivo.
2. `FASES.md`: estado y próximos lotes P3–P7.
3. `ENTREGA-P0-P2.md`: recap, recorrido, resultados y límites.
4. `../superpowers/plans/2026-09-18-eyeinsky-p0-p2-ejecucion.md`: contrato de ejecución.
5. `../superpowers/plans/2026-09-18-eyeinsky-universo-plan-maestro.md`: plan completo original; sus checkboxes eran de propuesta, no registro actualizado de ejecución.
6. `EYEINSKY-Plan-Maestro-Universo.pdf`: plan original de25páginas con6conceptos, por GPT-6-Astra. Los conceptos NO son aceptación estética.
7. `evidence/`: copia de recibos finales. Los logs/capturas completos quedan en el clon principal bajo `output/eyeinsky-immersive/p012/` y en Documentos.

## Lo terminado y lo que falta

P0–P2 están verificadas como corte LOCAL utilizable: navegación Explorar/Vistas/Instrumentos/Más, búsqueda derecha, lista activa real/catálogo, fuentes descritas, negro global/verde cercano, cámara interrumpible, reduced-motion y terminal/Aladino/Undo. Se preserva el globo como protagonista y las capacidades anteriores.

No confundir la entrega con aprobación estética, publicación o paridad completa. Siguen pendientes cobertura/reproducción integral CCTV, selección/picking de todos los contactos/superposiciones, teléfono físico, inclinación opcional y mejoras de FPS acreditadas. El gráfico sísmico compacto de escritorio se oculta en el breakpoint móvil; allí se accede al registro por Instrumentos. Cabina se verificó con fixture identificada, no como garantía de disponibilidad de OpenSky.

Decisión P0 importante: se probaron marcos/unidades y tiempos UTC/TAI/TT/TDB, propagación OMM/TLE, identificadores NORAD de seis dígitos y referencias CelesTrak/Vallado + NASA/JPL. La aproximación lunar ensayada NO pasa la tolerancia declarada: no usarla como solución de precisión en P5. El spike no es una Luna explorable integrada.

## Evidencia al cerrar P0–P2

- npm test:4204tests,4194pass,0fail,10skipped (tres procesos; sumar sus resúmenes).
- Build, formato, boundaries y TypeScript: exit0.
- Recorrido P0–P2:23/23; recorrido propio independiente:16/16.
- Cámara adversa:9/9; seguimiento/cabina/Home:4/4con fixture.
- Viewports:1920×1080,1440×900,390×844,360×800,844×390.
- Inventario1315fuentes/configuraciones estable durante verificación, HTTP200.
- Evidencia canónica: `output/eyeinsky-immersive/p012/supervisor/focus-fix/green/` en el clon principal; recibo `supervisor/FINAL-ACCEPTANCE.json`.
- Entrega para Alex: `C:/Users/Alex/Documents/EYEINSKY/Entrega-P0-P2-2026-09-18/` (recap, pruebas,6capturas y manifiesto de17copias verificadas).

Este checkpoint añade documentación; el inventario de1315 describe el producto probado antes de añadir estas notas. No fingir que cubre archivos nuevos de documentación.

## Dirección de Alex que no debe perderse

- Ventanas hacking/espías, vidrio contextual, menos bloques y más visuales útiles/interactivos. Globo real3D protagonista, no dashboard con globo de fondo.
- Sin cabeceras/footers globales ni lema «el mundo en perspectiva». Atribuciones legales visibles y utilizables.
- Universo negro de lejos; verde mineral tenue SÓLO cerca. Separar skybox, atmósfera y máscara.
- «Mejor3D» significa escena/cámara/navegación/selección, NO botones extruidos3D.
- Ratón, teclado y tacto; hover nunca única vía. Cámara interrumpible, reduced-motion, texto esencial13px desktop/14px móvil y targets44px.
- Conservar funciones de Gods Eye View, no recortar para simplificar. No actividad falsa ni etiquetas de directo engañosas; simulaciones y muestras rotuladas.
- Medios/modelos/logos requieren procedencia/licencia por activo. MIT del código no licencia automáticamente mapas/APIs/medios.
- Un escritor por lote, respaldo previo y verificación independiente proporcional. No reiniciar cadenas generales auditoría→reparación por avisos tardíos o detalles menores.

## Ingeniería y lecciones concretas

- Node/npm sobre Windows/Git Bash: usar rutas nativas `C:/...` con programas nativos; no asumir conversión de `/c/...`.
- `scripts/eyeinsky-p012.mjs` recibe URL y directorio de salida como argumentos POSICIONALES. No usa IRIS_OUT. Su default apunta a un build histórico; pasar siempre un directorio nuevo.
- Una invocación RED sobrescribió los primeros `build/p012-*`; NO usarlos como originales históricos inmutables. La auditoría, continuation y verificación final están separadas. Ver `evidence/ARTIFACT-PROVENANCE-NOTE.json`.
- El fallo de rueda durante cinemática se reprodujo antes de repararlo. La regresión está en `scripts/eyeinsky-camera-adverse.mjs`; no ocultar errores de Cesium ni desactivar gestos para aprobarla.
- Deshacer rápido antes de terminar la animación disparaba foco tardío a Agregar. `src/ui/eyeinskyShell.js` invalida ese callback si la capa ya está habilitada. Regresión `rapid-undo-preserves-restored-layer-focus` en `scripts/eyeinsky-p012.mjs`; no esperar artificialmente a que termine el apagado para probarla.
- El paquete TypeScript NO estaba instalado en el node_modules del producto. La verificación usó `C:/Users/Alex/AppData/Local/npm-cache/_npx/a322a253dbd59f36/node_modules/typescript/lib/tsc.js`; medir disponibilidad al retomar, no asumir que la caché dura siempre.
- Un test verde de un fragmento no acredita una fase completa: un contador no es lista activa,40px no acredita44px y screenshot no acredita FPS.
- No leer/imprimir contraseñas, no secretos en Markdown y no exportar credenciales/datos privados a proveedores. No cambiar cookies/registro/permisos para esquivar un bloqueo de navegador.

## Retomar sin perder trabajo

1. Leer estas notas y comprobar rama/status/head en el worktree correcto. No hacer reset/clean ni recrear desde main.
2. Consultar la orden nueva de Alex; el siguiente candidato es P3, no hay autorización implícita por el cierre.
3. Medir disponibilidad de la preview y leer scripts de package.json antes de reiniciarla. No levantar un servidor que tape otro en el mismo puerto.
4. Revisar feedback estético sobre P2. No volver a A/B/C ni copiar ciegamente la densidad de los conceptos PDF.
5. Antes de otro escritor, respaldo y estado limpio/diferencias documentadas. Mantener un solo escritor.
6. Ejecutar un lote funcional completo y gates proporcionales; no borrar limitaciones de paridad ni anunciar pruebas con datos reales si sólo hubo fixture.

## Procesos y avisos ya resueltos

Constructor inicial `proc_e716a8ae769c`, auditor `proc_8671d435242f` y continuación `proc_cadc934d5dec` terminaron. `proc_29e67dc76087` corresponde a gates anteriores aprobados. `proc_bb8a0088dc4f` falló por una etiqueta de estado incorrecta en el preflight del runner; luego se corrigió y el cierre foreground pasó. Ningún aviso tardío de ellos inicia otro lote ni demuestra una falla actual.

Formulario/terminal oculta continúan aplazados. Correo externo sigue pendiente de destinatario autorizado y acceso seguro; no bloquea la preview y no pertenece a P3 por defecto.
