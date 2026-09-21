# Workflow P3 — Claude Code Opus 5

Estado: preparado, NO iniciado. Alcance: implementar el diseño/plan P3 sólo cuando Alex lo ordene.
Modelo solicitado, literal: `claude-opus-5`. Sin `opusplan`, fallback a Sonnet/Fable/Sol ni sustitución silenciosa.

## 1. Verificación real de esta preparación

- Claude Code instalado: `2.1.220`, medido con `claude --version`.
- Ejecutable resuelto: `C:/Users/Alex/AppData/Roaming/npm/claude.CMD`.
- La documentación oficial identifica `claude-opus-5` y exige Claude Code >=2.1.219. La versión local satisface ese piso.
- Prueba mínima sin herramientas, sin lectura del repo y sin sesión persistida: exit 1, API HTTP 400, `is_error:true`, `terminal_reason:api_error`, texto `Credit balance is too low`.
- `modelUsage:{}`, `num_turns:1`, coste reportado 0; no se obtuvo respuesta del modelo.
- El JSON devolvió además `subtype:success`: NO basta comprobar ese campo. La decisión usa exit code, is_error, terminal_reason y modelUsage.
- ID del intento: `da67e1ce-0d3c-4708-b13e-bd6914f8b573`. No es un constructor resumible: se usó no-session-persistence.
- Evidencia sanitizada: [PREFLIGHT.json](PREFLIGHT.json). No se leyeron contraseñas ni se alteró configuración/auth/facturación.

Consecuencia: el plan y diseño los redactó KRÓNOS, no Opus. El bloqueo afecta el arranque del workflow, no la entrega de estos documentos. No cambiar cuenta, proveedor o mecanismo de pago para evitarlo. Alex resuelve saldo/acceso por su canal seguro; luego repetir preflight.

Fuentes oficiales consultadas el 2026-09-19:

- https://platform.claude.com/docs/en/models/opus-5/overview
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/cli-reference

## 2. Roles y secuencia

```text
Alex: aprueba alcance/diseño y ordena construir
          ↓
KRÓNOS: comprueba acceso, respaldo, base y worktree
          ↓
Claude Code Opus 5 / constructor único
  T0 base → T1 contratos → T2 ficha → T3 medios → T4 actividad → T5 UI
          ↓
Candidato congelado + hashes + reportes
          ↓
Claude Code Opus 5 / auditor, NUEVA sesión, sólo lectura
          ↓
KRÓNOS: pruebas reales de cierre T6 y recorrido independiente
          ↓
Mismo constructor: una reparación dirigida si hace falta
          ↓
Preview local P3 + aceptación de Alex
```

No equipos de escritores paralelos, no sub-subagentes que hereden otro modelo, no múltiples worktrees con parches contradictorios. El auditor recibe el candidato y su contrato, no la conversación del constructor. Sus conclusiones siguen siendo un autorreporte; KRÓNOS mide el resultado por sí mismo.

Revisión proporcional: una revisión independiente del candidato; corregir bloqueantes y repetir las pruebas afectadas, sin iniciar otra auditoría global por detalles secundarios. Tras tres intentos sin resolver la misma región, detener esa reparación y escalar con evidencia, no entrar en bucle.

## 3. Artefactos y contexto autocontenido

Documentos que viajan al worktree de ejecución:

1. `docs/superpowers/specs/2026-09-19-eyeinsky-p3-design.md`
2. `docs/superpowers/plans/2026-09-19-eyeinsky-p3-implementation.md`
3. `docs/eyeinsky/p3/WORKFLOW-CLAUDE-OPUS5.md`
4. `docs/eyeinsky/p3/BUILD-BRIEF.md`
5. `docs/eyeinsky/p3/AUDIT-BRIEF.md`
6. `docs/eyeinsky/p3/REPAIR-BRIEF.md`
7. `docs/eyeinsky/p3/PREFLIGHT.json`

Los documentos históricos FASES, NEXT-SESSION, maestro P0–P7 y recap ya están en el checkpoint. Este paquete nuevo aún no está commiteado: copiarlo de forma explícita al worktree nuevo y verificar hashes. No creer que `git worktree add` incluye archivos sin commit.

Rutas:

- Producto previo: `C:/Users/Alex/AppData/Roaming/orca/codex-runtime-home/home/worktrees/ea9e/gods-eye-view`.
- Orquestación: `C:/Users/Alex/orca/gods-eye-view`.
- NUEVA ubicación propuesta para ejecutar: `C:/Users/Alex/orca/eyeinsky-p3-opus5`.
- NUEVA rama propuesta: `eyeinsky/p3-opus5`.
- Checkpoint: `812d75c0833887069e31cc2218d47b728b9cad36`.
- Preview previa 4197 intacta; candidata propuesta 4198 con comprobación de puerto libre y lectura HTTP/DOM.

No crear worktree/branch si ya existe sin inspeccionarlo primero; no borrar para despejarlo.

## 4. Arranque futuro, no ejecutado en esta preparación

### Preflight

Comando realmente probado, a repetir después de resolver saldo:

```bash
claude -p 'Responde solamente OPUS5_PREFLIGHT_OK. No leas archivos ni ejecutes herramientas.' --model claude-opus-5 --effort high --safe-mode --tools '' --no-chrome --max-turns 1 --output-format json --no-session-persistence
```

Aceptar sólo exit 0, is_error=false, respuesta esperada y modelUsage con `claude-opus-5`. Si hay otros modelos en modelUsage, registrar todos y revisar la causa; no atribuir todo el trabajo a Opus sin comprobación. Sin depurar credenciales en logs.

`--safe-mode` desactiva personalizaciones sin desactivar la autenticación normal. No usar `--bare` para «arreglar» OAuth: según la CLI local usa otro flujo de auth. No actualizar Claude globalmente por rutina; la versión instalada ya admite el modelo.

### Preparación supervisada

Tras orden de construir, comprobar `git status`, `git worktree list` y disponibilidad de nueva ruta/rama. Si están libres, ejecutar desde el clon principal:

```bash
git worktree add -b eyeinsky/p3-opus5 C:/Users/Alex/orca/eyeinsky-p3-opus5 812d75c0833887069e31cc2218d47b728b9cad36
```

Copiar los siete documentos enumerados por selección explícita y sus hashes; respaldar la base como indica T0. Leer instrucciones AGENTS/CLAUDE aplicables y trasladar al brief sólo las relevantes y no sensibles; safe-mode no las autocarga. Instalar dependencias y medir gates de T0. No escribir `.claude/settings.json` global ni del repo para un lote.

Crear `output/eyeinsky-p3/build` y `output/eyeinsky-p3/audit` en ese worktree. Iniciar su Vite con `npm run dev -- --host 127.0.0.1 --port 4198 --strictPort` como servidor supervisado separado y comprobar HTTP antes de probar. Si el puerto está ocupado, elegir otro libre y registrar URL en los briefs/comandos; no terminar al dueño desconocido.

### Constructor

Desde el nuevo worktree; comando propuesto basado en flags de la CLI instalada. Se ejecuta con terminal background=true y notify=true, no como un background interno opaco de Claude. Redirigir a archivos nuevos por corrida, no sobrescribir una entrega previa.

```bash
python -c "from pathlib import Path; print(Path('docs/eyeinsky/p3/BUILD-BRIEF.md').read_text(encoding='utf-8'))" | claude -p --model claude-opus-5 --effort high --safe-mode --permission-mode acceptEdits --tools 'Read,Glob,Grep,Edit,Write,Bash' --allowedTools 'Read,Glob,Grep,Edit,Write,Bash(npm test),Bash(npm run build),Bash(npm run check:boundaries),Bash(npm run format:check),Bash(node --test *),Bash(node scripts/eyeinsky-p3.mjs *),Bash(node scripts/eyeinsky-p012.mjs *),Bash(node scripts/eyeinsky-camera-adverse.mjs *),Bash(node scripts/eyeinsky-p012-cockpit.mjs *)' --disallowedTools 'Read(**/.env*),Read(**/*credentials*),Read(**/.claude.json),Bash(git commit *),Bash(git push *),Bash(git reset *),Bash(git clean *),Bash(rm *)' --no-chrome --max-turns 100 --output-format stream-json --verbose > output/eyeinsky-p3/build/events.jsonl 2> output/eyeinsky-p3/build/stderr.log
```

- La allowlist y el brief acotan trabajo, no constituyen sandbox del sistema operativo. No conceder Bash irrestricto ni bypassPermissions para arreglar una denegación.
- Necesidades fuera de allowlist (curar/descargar activos públicos, formatear archivos concretos o ejecutar TypeScript fijado): las realiza KRÓNOS como pasos supervisados, o concede únicamente el comando preciso tras inspección. El constructor reporta el bloqueo, no inventa resultados.
- El esfuerzo high y presupuesto inicial de 100 turnos son límites operativos, no promesa de terminar ahí. Registrar coste real del CLI; no presupuesto monetario inventado, nueva compra ni habilitación de sobreconsumo.
- No herramienta Agent ni MCP de propósito general en este escritor: no crea subagentes o conecta secretos. No se autoriza publicación/commit.

### Reanudación

Si agota turnos: leer el árbol real, último informe y evento result; registrar su session_id EXACTO. Reanudar con `--resume` ese ID, `--model claude-opus-5` y las mismas restricciones/working directory. No usar `--continue` en un directorio con otras sesiones; no crear otro constructor.

Usar REPAIR-BRIEF como plantilla de continuación con hallazgos concretos, archivos/hashes vigentes y pendientes. Presupuesto recomendado de continuación: 60 turnos; si falla por billing o permisos, no ampliar presupuesto a ciegas. No reanudar el ID del preflight sin persistencia.

### Auditor

Sólo después de congelar candidato y registrar sus hashes. Sesión nueva, sin resume y sin herramientas de escritura ni shell:

```bash
python -c "from pathlib import Path; print(Path('docs/eyeinsky/p3/AUDIT-BRIEF.md').read_text(encoding='utf-8'))" | claude -p --model claude-opus-5 --effort high --safe-mode --permission-mode plan --tools 'Read,Glob,Grep' --allowedTools 'Read,Glob,Grep' --disallowedTools 'Read(**/.env*),Read(**/*credentials*),Read(**/.claude.json)' --no-chrome --max-turns 30 --output-format json > output/eyeinsky-p3/audit/result.json 2> output/eyeinsky-p3/audit/stderr.log
```

La salida es revisión estática/de evidencia, no prueba funcional ejecutada por el auditor. KRÓNOS ejecuta las pruebas/browser de T6 en el candidato exacto. Si el auditor propone un parche, devuelve ubicación y reproducción; no tiene permiso de aplicarlo.

## 5. Contrato de entrega del constructor

Escribir `output/eyeinsky-p3/build/HANDOFF.md` y `result.json` con:

- base HEAD, branch, session_id y modelo efectivo extraído de eventos, no «soy Opus» como evidencia;
- estado por P3-01..P3-15: pass/fail/blocked/not-run, sin omisiones;
- archivos modificados y SHA-256 medidos por supervisor, no strings inventados;
- comandos realmente ejecutados, exit codes, logs y alcance de fixture/live;
- capturas identificadas por viewport y caso; URL del servidor probado;
- ledger de activos, riesgos y límites; estado `candidate-awaiting-supervisor` si no hay fallos conocidos;
- ningún claim de aceptación estética, paridad total o publicación.

El supervisor produce manifest/verification propios y comprueba que el código no cambió mientras se verificaba. Lectura del repo y pruebas son necesarias; exit 0 del agente no basta.

## 6. Cierre

Entregar a Alex diseño ejecutado, preview local, recap y diferencias respecto a P2. Mantener P4–P7 pendientes. No commit/push/merge/deploy implícitos. La aprobación de la preview y autorización de publicación son decisiones posteriores y separadas.
