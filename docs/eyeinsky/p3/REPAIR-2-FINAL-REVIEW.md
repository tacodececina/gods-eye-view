# REPAIR-2 — ocho bloqueantes reproducibles de la revisión final

Reanuda la MISMA sesión `32cfb7bc-04f0-47e2-a38c-a6278aacda8b`, mismo `claude-opus-5`, mismo worktree y único escritor. REPAIR-1 pasó sus arneses pero NO fue aceptada: la segunda revisión independiente encontró ocho huecos reproducibles que KRÓNOS confirmó leyendo los contratos reales. No commit/push/merge/deploy. No P4–P7 ni refactor lateral.

FUENTES DE VERDAD: `docs/eyeinsky/p3/REPAIR-1-INDEPENDENT-AUDIT.md`, esta lista y los contratos existentes. Conserva toda evidencia anterior. Crea evidencia nueva bajo `output/eyeinsky-p3/repair-2-*`. 4198 está viva bajo supervisión; no inicies otra.

Aplica TDD estricto, un RED→GREEN por bloqueante:

1. MAPA ACTIVO FALSO. `eyeinskyActivitySources.js` consulta `state.ready`; el controlador real (`src/maps/controller.js:getState`) expone `state.status` = `ready|switching|error`. Resultado vivo actual: «Mapa base · En curso» permanente. Usa el contrato real. Montar con status ready no debe publicar trabajo ni historia. `switching` sí publica loading; transición posterior ready/error puede cerrar el intento real sin porcentaje de teselas. Prueba con objeto de estado de forma REAL, no mock con `ready` inventado. El arnés P3 debe exigir cero trabajo en curso en reposo.

2. RETRY TERMINAL ACCESIBLE. El reducer mueve error/partial a `history`, pero `eyeinskyActivity.js` no pinta Reintentar allí. Renderiza una acción real `data-eye-activity-retry` para terminales con `canRetry`, con nombre accesible y delegación existente; no cuentes ese terminal como «en curso». Prueba DOM de click real desde historial → una sola llamada a onRetry.

3. FICHA CCTV CON CONTRATO PÚBLICO REAL. La instantánea real trae `activeCamera` (presentation.js): `{id,name,provider,sourceLabel,sourceStatus,lat,lon,elevationM,city,...}`, no `activeCameraName/source/observedAt` raíz. Construye título, fuente, posición y campos desde `snapshot.activeCamera`; conserva stableId/activeCameraId. No inventes observedAt si no existe. Prueba con forma pública real y arnés LIVE que seleccione una cámara y compruebe identidad/nombre/proveedor/coordenadas, no sólo controlador/geometría.

4. BOTÓN EXPEDIENTE MÓVIL DEBE REABRIR. En 390×844 el botón de Instrumentos publica `reopen` pero el workspace conserva `mobile-workspace`, así que la ficha sigue display:none. Al activar Expediente: salir a Explorar/retirar la razón, reabrir la ficha vigente y mover foco a un control visible sólo después de restaurar. Respeta cierre explícito e interacción con Vista limpia (si clean-view sigue activa, no muestres). Browser RED→GREEN exacto: cerrar explícitamente, abrir Instrumentos, pulsar Expediente, verificar workspace cerrado, ficha visible con misma identidad y foco visible.

5. AUTOPLAY REALMENTE PAUSADO POR INTERACCIÓN. `pointerenter/focusin` antes del click no sirve porque autoplay aún es false; el click arranca intervalo mientras puntero/foco siguen dentro. Modela por separado «reproducción solicitada» y «timer activo/pausado por razones». Mientras puntero/foco/hidden/reduced-motion estén activos NO corre el timer; al salir de la interacción puede reanudarse sólo si sigue solicitado. El botón debe poder desarmar la solicitud. `isPlaying()` debe describir timer real, y si hace falta expón otra lectura para requested sólo en test. Pruebas DOM con secuencia natural pointerenter→focusin→click (timer parado), luego pointerleave+focusout (timer corre), visibility/reduced-motion lo paran y destroy libera todo.

6. EVENTOS DE IMAGEN OBSOLETOS. El dataset del único `<img>` siempre contiene el token más reciente, por lo que un error tardío de A puede marcar B unavailable. Usa identidad por solicitud real: por ejemplo, un elemento `<img>` nuevo por render con listeners cerrados sobre token/contexto, reemplazando y neutralizando el anterior. Prueba A→B→error tardío de A: B permanece loading/ready y no muestra «Fotografía no disponible»; error de B sí lo muestra. Evita precargas/listeners huérfanos.

7. SANITIZACIÓN JSON Y VALORES CON ESPACIOS. `safeErrorText` deja `{"api_key":"SENTINELA_JSON"}` y restos de `password="SENTINELA UNO"`. Redacta nombres entrecomillados, separadores JSON y valores quoted completos, además de formas actuales. Test con centinelas en JSON, comillas simples/dobles, espacios, Bearer y claves unquoted; ningún fragmento del secreto puede sobrevivir. Conserva mensaje útil y límite 160.

8. ZOOM 200 % REAL. `deviceScaleFactor:2` sólo cambia DPR (`visualViewport.scale=1`). Cambia el arnés para aplicar zoom/page scale real por CDP (`Emulation.setPageScaleFactor` o API equivalente disponible) y demuestra `visualViewport.scale≈2` o métrica de zoom equivalente, con área visual efectiva reducida y superficies utilizables. Restaura a 1 después. No llames zoom a DPR.

CIERRE OBLIGATORIO:
- Pruebas focales RED→GREEN para los ocho puntos.
- P3 debe exigir: reposo sin actividad falsa, retry terminal visible, ficha CCTV real, reapertura móvil real, medios interactivos/stale, redacción JSON y zoom real.
- Corre `npm test`, build, boundaries, format, format:check, TypeScript, focales; luego P3/P012/camera/cockpit a directorios nuevos. Si build vuelve stale el servidor, deja pedido de reinicio al supervisor y no dupliques server.
- Actualiza al inicio de `HANDOFF.md` una sección REPAIR-2 y `result.json.repair2`; NO borres REPAIR-1 ni evidencia histórica. Estado `candidate-awaiting-supervisor`.
- Corrige también las contradicciones antiguas de la matriz/limits sólo mediante una nota clara «superseded by REPAIR-2»; no reescribas historia.
- Si agotas turnos, checkpoint exacto; no declares terminado sin gates y handoff.