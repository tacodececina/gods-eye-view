# Mapa de habilidades — gods-eye-view (EYEINSKY)

Stack: Cesium + Vite 6, JS puro, node:test. Objetivo: llevar la web 3D/geo a producción.
Patrón replicado de `C:/Users/Alex/juegos-lol/.claude/`.

## Origen A — everything-claude-code (ECC)
Fuente: `C:/Users/Alex/GOD.INC/08-HABILIDADES/biblioteca/everything-claude-code`

- **plugins/everything-claude-code/scripts/** (hooks: session-start, session-end, pre-compact, suggest-compact, evaluate-session + lib). Copiados de juegos-lol (la biblioteca ECC no trae `scripts/`). Ignorado por git.
- **skills:** e2e-testing, browser-qa, verification-loop, delivery-gate, production-audit, deployment-patterns, docker-patterns, canary-watch, security-review, security-scan, frontend-patterns, seo, accessibility, benchmark, ai-regression-testing, vite-patterns (extra: bundler del proyecto), frontend-a11y (extra). Omitida: react-performance (solo React).
- **agents:** security-reviewer, performance-optimizer, seo-specialist, a11y-architect, e2e-runner, code-reviewer, silent-failure-hunter, build-error-resolver, pr-test-analyzer.
- **commands:** quality-gate, security-scan, test-coverage, build-fix, pr, review-pr, update-docs.
- **rules:** common/, typescript/ (aplica a JS por analogía), web/.

## Origen B — antigravity-awesome-skills
Fuente: `github.com/tacodececina/antigravity-awesome-skills` (`plugins/antigravity-awesome-skills/skills/`)

| Skill | Por qué |
|---|---|
| web-performance-optimization | Core Web Vitals, bundle, caché (sustituye "lighthouse": no existe skill propia) |
| seo-technical | SEO técnico + CWV |
| server-management | Procesos/monitoreo de servidor (sustituye nginx/systemd: no hay skills dedicadas) |
| linux-troubleshooting | Diagnóstico de servicios en el VPS |
| deployment-procedures | Deploy seguro y rollback |
| shader-programming-glsl | Shaders GLSL/WebGL (no hay skill Cesium ni WebGL dedicada) |
| playwright-skill | Automatización de navegador/E2E (no hay skill puppeteer) |
| performance-profiling | Medición y profiling |

Sin equivalente encontrado: letsencrypt/certbot, cesium, puppeteer, lighthouse (nombre exacto).

## settings.json
Hooks de juegos-lol con rutas de este worktree, sin: bloqueo `npm run dev` fuera de tmux, recordatorio tmux, check `tsc`.
