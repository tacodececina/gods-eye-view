# P3 — Plantilla de continuación dirigida (no despachar sin completar)

Reanuda exclusivamente el session_id REAL del constructor, en el mismo worktree, con claude-opus-5 y las mismas restricciones. No usar este archivo como una orden autónoma ni usar el ID del preflight sin persistencia.

KRÓNOS añade al final de este brief, antes de despacharlo, el recibo concreto de reparación: session_id leído de los eventos, base y HEAD medidos, candidato SHA, lista exacta de archivos modificados, IDs de hallazgos bloqueantes, reproducción RED, logs y comandos de revalidación. Si falta ese recibo, responde blocked-missing-repair-receipt y no edites.

Lee el diseño/plan P3 y el recibo. Corrige sólo los hallazgos enumerados y su misma causa en rutas hermanas. Conserva la evidencia anterior y las limitaciones reales. No introducir funciones P4 ni un rediseño nuevo.

Primero reproduce cada fallo con una prueba. Implementa el cambio mínimo y repite esa prueba más el smoke integrado correspondiente. Conserva umbrales, identidad, créditos y reduced-motion. No lanzar otro auditor, no commitear ni publicar. Si agotas turnos o falta permiso, entrega estado exacto; no fabricar GREEN.

Salida: HANDOFF de reparación separado de la entrega original, comandos/exit codes/logs y estado por ID corregido. El supervisor verifica por sí mismo antes de aceptar.
