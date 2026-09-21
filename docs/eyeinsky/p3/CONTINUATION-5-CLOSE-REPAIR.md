# Continuación 5 — cerrar reparación P3 tras max-turns

Reanuda la MISMA sesión `32cfb7bc-04f0-47e2-a38c-a6278aacda8b`, mismo `claude-opus-5`, mismo worktree y único escritor. La continuación 4 agotó 120 turnos; NO fue fallo del producto. Conserva todo el trabajo y evidencia. No commit/push/merge/deploy.

CHECKPOINT EXACTO:
- Repair 1 avanzó con TDD sobre selección, actividad/retry, CCTV, suspensión móvil, ficha Tierra, medios, secretos, accesibilidad y teardown.
- Último arnés P3: 23 checks, 22 pass, sólo falla `p3-12-compass-is-an-actionable-control`.
- Evidencia previa del fallo: botón real BUTTON, 66.3×44, foco sí, label «Rumbo 90 grados. Orientar al norte», headingBefore=1.571, headingAfter=1.571; el botón Norte existente también quedó sin giro en esa pose. Después comenzaste a instrumentar si la acción llega a la autoridad de cámara, pero max-turns ocurrió justo tras editar `scripts/eyeinsky-p3.mjs`; no hay resultado posterior.
- `git diff --check` estaba verde.
- 4198 sigue bajo supervisión; comprueba que responde antes de usarlo. No arranques servidor duplicado.

TRABAJO RESTANTE, EN ORDEN:
1. Lee el final de la continuación 4 y el estado actual del arnés. Termina el check de brújula SIN rebajar contrato: clic/Enter/tacto deben emitir la acción `north` por el mismo controlador/autoridad pública que el botón Norte existente. Verifica de forma causal la invocación a esa autoridad. Además, si hay una pose Cesium reproducible donde la autoridad Norte cambia heading, mídela ahí. No aceptes sólo `click()` ni sólo cambio de texto autoinducido. Si el botón Norte heredado no cambia heading en esa pose del renderer headless, registra esa limitación del controlador compartido y conserva evidencia de invocación real; no implementes un `flyTo` paralelo ni falsifiques el heading.
2. Corre el arnés P3 en un directorio NUEVO `output/eyeinsky-p3/repair-1-p3-final`; exige todos verdes y exit0. Si falla, corrige causa real con RED→GREEN.
3. Corre pruebas focales de todos los módulos P3. Agrega/ajusta tests sólo si capturan los fallos reales, no para ocultarlos.
4. Ejecuta gates completos: `npm test`, `npm run build`, boundaries, `npm run format`, format:check y TypeScript permitido. Registra salidas y totales agregados honestos.
5. Tras cualquier format/build, verifica 4198 y evita hash Vite stale: si el servidor supervisado entrega errores de chunks, documenta que necesita reinicio supervisor y detén browser gates; no inicies duplicado. Si está sano, corre P012, camera-adverse y cockpit a directorios NUEVOS post-repair.
6. Relee cada hallazgo del brief `docs/eyeinsky/p3/REPAIR-1-INDEPENDENT-AUDIT.md` y crea una tabla cerrada: repaired + evidencia, o límite público exacto (sólo CCTV frame si realmente no hay señal pública). Nada de omitir hallazgos.
7. Actualiza `output/eyeinsky-p3/build/HANDOFF.md` y `result.json`, sección `REPAIR-1`, sin borrar evidencia previa. Estado final sigue `candidate-awaiting-supervisor`. Incluye archivos cambiados, RED/GREEN, comandos, resultados y límites.

NO hagas replanificación general, P4–P7, refactor lateral ni dependencia nueva. No declares terminado sin HANDOFF/result y gates medidos. Si vuelves a agotar turnos, deja checkpoint exacto.