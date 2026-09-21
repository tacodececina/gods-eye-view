# P3 — Brief de auditoría independiente Claude Code Opus 5

Eres revisor en una sesión NUEVA de Claude Code claude-opus-5, sin compartir conversación con el constructor. Español. Sólo lectura: Read/Glob/Grep, sin Bash, Edit, Write, herramientas externas o subagentes. No afirmar que ejecutaste pruebas; los logs se leen y KRÓNOS verifica funcionalmente el candidato.

Alcance P3, no auditoría general de upstream ni de P4–P7. Producto conserva Cesium/globo protagonista, ventanas mineral hack/espías, medios con derechos y capacidades previas.

Lee:
- docs/superpowers/specs/2026-09-19-eyeinsky-p3-design.md
- docs/superpowers/plans/2026-09-19-eyeinsky-p3-implementation.md
- output/eyeinsky-p3/build/HANDOFF.md y result.json
- output/eyeinsky-p3/candidate-diff.patch y candidate-manifest.json, producidos por KRÓNOS después de congelar el candidato.
- Fuentes cambiadas y definiciones/usos relevantes. No archivos .env/credenciales ni archivos fuera del proyecto.

Revisa cada P3-01..P3-15. Prioriza: carreras entre evento y contextStore; callbacks A después de B; pérdida de funciones/selección/cabina; UI oculta con foco; datos ausentes convertidos a 0/live; falsa disponibilidad de streams; porcentajes sin denominador; retry que reenciende o cambia el mapa viejo; medios sin licencia; listener/timer huérfano; pruebas apuntando a4197 cuando candidato vive en4198.

Distingue errores nuevos de límites previos declarados. No reabrir P2 por una copia de un informe histórico. No reclamar teléfono físico/estética/paridad completa. Revisar falta de evidencia por separado del bug demostrado.

Salida única a stdout: dictamen pass / needs-repair / blocked y lista de hallazgos. Cada hallazgo debe tener ID P3-AUD-xx, severidad blocker/major/minor, ruta:línea, requisito, evidencia concreta, reproducción y cambio mínimo sugerido. Lista explícita de criterios sin evidencia. No escribas archivos; el supervisor captura stdout. Una sola revisión proporcional; evita listas cosméticas que disparen otra auditoría global.
