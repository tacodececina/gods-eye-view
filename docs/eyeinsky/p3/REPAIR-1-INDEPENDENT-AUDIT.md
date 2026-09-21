# Reparación dirigida P3 — hallazgos confirmados por supervisión

Reanuda la MISMA sesión `32cfb7bc-04f0-47e2-a38c-a6278aacda8b`, mismo `claude-opus-5`, mismo worktree y único escritor. No reinicies, no replantees P3 ni amplíes a P4–P7. No commit/push/merge/deploy. La entrega `candidate-awaiting-supervisor` NO fue aceptada: dos revisiones independientes encontraron fallos reproducibles. KRÓNOS leyó el código y confirmó los mecanismos señalados.

4198 está viva bajo supervisión y sirve este worktree. No inicies otro servidor si responde. Conserva `supervisor/gates-1` y `supervisor/browser-gates-2`; son evidencia inmutable. El primer cockpit supervisor falló por un hash Vite stale tras compuertas estáticas; reiniciar el servidor produjo 4/4 sin pageErrors y la corrida completa post-restart quedó P3 17/17, P012 23/23, cámara 9/9, cockpit 4/4. Eso no invalida los fallos lógicos siguientes.

REPARA SÓLO ESTOS BLOQUEANTES, con test RED reproducible antes de cada cambio y GREEN después:

1. SELECCIÓN A→B ENTRE TODOS LOS CARRILES. `eyeinskyDossierSources.js`: `resolutionTurn` sólo cambia en SUBJECT_SELECTED/CLEARED. Una microtarea tracking A puede pisar una selección B posterior por `gev:entity-selected`, CCTV o `viewer.selectedEntityChanged`. Invalida cualquier resolución pendiente en TODA selección/clear relevante, sin convertir refresh en selección ni cambiar autoridad ajena. Test dirigido con A tracking → B por cada carril → microtarea: B debe permanecer.

2. CCTV REAL EN RUNTIME. `eyeinskyShell.js` monta ambos conectores sin `cctv`. Localiza el controlador público real ya registrado (no propiedades privadas nuevas, no controlador simulado) y pásalo a dossier/activity. Acredita selección/ficha de cámara y geometría con una prueba de integración honesta. Distingue geometría de disponibilidad/frame. Si existe una señal pública de frame/tiles, intégrala; si no existe, no inventes porcentaje y documenta exactamente qué fuente pública falta.

3. ACTIVIDAD HONESTA. Hoy `publishLayers()` publica 21 capas deshabilitadas como `idle`; el reducer las retiene y la UI cuenta `tasks.length`, produciendo «22 en curso» aunque 21 están idle. El estado inicial de mapa/capas no debe crear historia ni trabajo. Sólo trabajo real en curso cuenta; idle no aparece como activo. Repetir el mismo terminal no duplica historial. Estados error/partial con `canRetry` deben seguir accesibles con botón Reintentar (pueden estar en una sección terminal accionable, pero no desaparecer). Mantén historial real máx.40.

4. RETRY SINGLE-FLIGHT HONESTO. `retry()` incrementa `attempts` ANTES de `gate.run`; doble clic comparte Promise pero publica intentos #2 y #3. Un único vuelo debe tener un único número/estado/historia y una sola llamada `refreshLayer`. Nuevo intento sólo tras settle. Test exacto doble clic.

5. SUSPENSIÓN MÓVIL. `openView` usa `closeInspector(false)` y convierte navegar a Catálogo/Instrumentos/Preferencias en cierre permanente. Suspende/restaura el expediente conservando cierre explícito, selección, foco y clean-view. Maneja razones superpuestas (workspace móvil y Vista limpia) sin que salir de una restaure mientras la otra sigue activa. Instrumentos debe poder reabrir el expediente vigente mediante una acción visible, no sólo un reducer sin consumidor. Browser RED/GREEN en 390×844.

6. FICHA TIERRA ÚTIL. `createViewContext()` inicial llega sin mapa activo, centro de cámara ni altura. Al iniciar y al volver a vista, muestra mapa activo real y valores reales de cámara (lat/lon/altura) sin activar capas, sin mover cámara y sin robar foco. Actualiza por eventos públicos/lecturas reales; no inventes tiempo/proveedor.

7. BRÚJULA ACCIONABLE. No basta `role=img`: debe ser control 44×44 con nombre accesible, teclado/clic/tacto y acción Norte existente a través de la autoridad de navegación/cámara. El botón Centrar no sustituye Norte. Añade prueba browser real.

8. MEDIOS ROBUSTOS. En error/404 muestra texto estable «Fotografía no disponible» sin bloquear ficha. Pausa autoplay por foco/puntero, `visibilitychange`, ocultamiento/suspensión y cambio dinámico a reduced-motion; libera listeners/timer en destroy y descarta eventos de imagen obsoletos tras cambio de contexto. Endurece `isMediaAllowed`: el objeto debe coincidir con entrada conocida también en sourceUrl, crédito, licencia, licenciaUrl, contexto y demás campos usados; URLs de crédito deben ser HTTP(S) seguro. Pruebas DOM RED/GREEN + navegador 404/reduced-motion.

9. SECRETOS EN ERRORES. `safeErrorText` debe redactar Bearer/Authorization, `api_key`, `x-api-key`, password/token/secret en formas comunes, además de URL/query/stack. Tests con valores centinela que no sobrevivan.

10. ACCESIBILIDAD MÓVIL REAL. 844×390 también es móvil: texto esencial >=14px y controles >=44×44. Corrige el arnés: no aceptar ancho O alto de 24; ambos >=44. Prueba zoom 200%. Hit-test de CADA enlace de atribución visible, no un punto del contenedor. Conserva corrección de oclusión del rail.

11. DESTRUCCIÓN REAL. El check actual sólo cuenta nodos. Añade test/harness que destruya montaje/app o colaboradores, compruebe que listeners/timers/medios quedan liberados y que callbacks/publicaciones tardías no mutan DOM/estado. No llames teardown a contar nodos.

12. RETRY UI y fuentes: separa mapa listo de teselas cargadas; no afirmar frame disponible por geometría. No filtres errores crudos ni query strings.

REGLAS:
- No rebajes thresholds, no borres assertions, no cambies tests para ocultar el fallo.
- No refactor general ni dependencia nueva.
- Preserva las funciones P0–P2, la corrección localGeoJSON y la autoridad única de cámara.
- Usa `textContent`; no secretos, `.env`, credenciales ni datos externos nuevos.
- Si una señal pública exigida no existe, deja límite honesto sólo después de agotar las rutas públicas ya presentes; no uses internals para fingir cumplimiento.

CIERRE:
- Ejecuta pruebas focales y corrige hasta GREEN.
- Ejecuta `npm test`, build, boundaries, format, format:check y TypeScript permitido; browser P3/P012/camera/cockpit en directorios NUEVOS post-repair.
- Actualiza `HANDOFF.md` y `result.json` sin borrar el historial: añade REPAIR-1, archivos, RED/GREEN, comandos y límites. Estado sigue `candidate-awaiting-supervisor`.
- Si agotas turnos, checkpoint exacto y salida; no declares terminado sin evidencia.