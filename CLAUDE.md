# CLAUDE.md — EYEINSKY (fork de God's Eye View)

## Qué es

EYEINSKY es el rediseño del fork `tacodececina/gods-eye-view` (upstream
`bilawalsidhu/gods-eye-view`): un globo 3D con capas de datos públicos (vuelos,
barcos, satélites, sismos, FIRMS, CCTV, radio, tránsito...).

- Stack: **Cesium + Vite 6, JavaScript puro (ESM), sin framework, sin base de datos.**
- Los feeds públicos pasan por rutas Node en `server/providers/` (proxies/caché);
  la composición local vive en `server/standalone/`.
- Node `>=24.14.0 <25` o `>=26 <27`. Tests con `node:test`.
- `package.json` es el inventario autoritativo de `exports`: importa por export
  declarado, nunca alcanzando archivos internos (ver `docs/CODE-BOUNDARIES.md`).

## Comandos

Todos los scripts de Vite usan la config EYEINSKY
(`server/standalone/eyeinsky.vite.config.js`):

```sh
npm run dev               # servidor Vite de desarrollo
npm run build             # bundle de producción
npm run preview           # sirve el build
npm test                  # node scripts/run-unit-tests.mjs (node:test)
npm run doctor            # comprobaciones de setup (CI: npm run doctor -- --json)
npm run format:check      # Prettier fijado; `npm run format` escribe
npm run check:boundaries  # dirección de imports + fronteras de paquete
node --test ruta/al/archivo.test.mjs   # test puntual
```

Arneses Puppeteer de navegador: `scripts/eyeinsky-*.mjs` (p5, p4, p31, p3,
p012, camera-adverse, p012-cockpit, smoke, ...). Nunca arrancan servidor;
apúntalos a uno vivo. Los antiguos leen `EYE_URL` (y `EYE_OUT`); los de fase reciben URL y
directorio de salida por argv:

```sh
EYE_URL=http://127.0.0.1:4204/ node scripts/eyeinsky-smoke.mjs
node scripts/eyeinsky-p31.mjs http://127.0.0.1:4204/ output/eyeinsky-p31/run-1
```

Atajos de teclado de P5 (sin Ctrl/Meta/Alt y nunca al escribir en un campo,
salvo Esc): **L** apuntar a la Luna, **Shift+L** sistema Tierra–Luna, **P**
pausa/reanudar, **N** ahora (vivo), **Esc** cierra el campo FECHA o la hoja TIEMPO y devuelve el foco. Espacio es
«mantener para hablar» de la voz; no lo reasignes.

Servidor canónico compartido: `http://127.0.0.1:4204/` (Vite dev local, no es
deployment). Compruébalo con `curl` antes de usarlo; no lo mates ni lances otro
sin orden.

Los arneses heredados `eyeinsky-focus`, `-journey`, `-mobile` y `-states` se
repararon el 2026-09-24 y deben seguir en verde.

## Gates obligatorios antes de cerrar cualquier tarea

Regla de Alex: **cero defectos**. Nada se declara terminado sin evidencia fresca,
en este orden:

1. `npm run build`
2. `npm run doctor`
3. `npm run format:check`
4. `npm run check:boundaries`
5. `npm test` (0 fail; los skip se justifican)
6. Arneses Puppeteer afectados por el cambio, contra un servidor vivo.

CI (`.github/workflows/ci.yml`) corre doctor, format, boundaries, test y build en
Node 24.14.0 y 26.x, más un job Windows de onboarding. Si un gate falla, se
arregla la causa; no se salta ni se silencia.

## Reglas del proyecto

- **Un solo escritor por fase**, en su propio worktree creado desde `main`
  actualizado. No tocar worktrees ajenos.
- **RED → GREEN:** primero un test que falla por el motivo correcto, luego el fix.
  Cada hallazgo de auditoría se reproduce en RED antes de repararse.
- **No afirmar FPS** ni rendimiento sin una medición comparable (mismo equipo,
  viewport, escena y método). Headless usa SwiftShader: sólo evidencia relativa.
- **No inventar datos "live" ni telemetría.** Las ausencias se muestran como
  ausencias; sin denominador no hay porcentaje; fixtures se etiquetan como tales.
- **Assets:** cada modelo/imagen/dato con fuente, licencia, procedencia y hash en
  `docs/eyeinsky/planning/` (`asset-manifest.json`, `sources-ledger.json`) y en
  el `ASSET-LEDGER.md` de la fase (p. ej. `docs/eyeinsky/p4/ASSET-LEDGER.md`).
  Atribución de fuentes coherente con `DATA_SOURCES.md`.
- **Secretos sólo por nombre de variable** (`GOOGLE_MAPS_API_KEY`,
  `CESIUM_ION_TOKEN`, `OPENAI_API_KEY`, `OPENSKY_CLIENT_SECRET`,
  `AISSTREAM_API_KEY`, ... ver `.env.example`). Nunca imprimir valores, nunca
  commitear `.env`, nunca pegar claves en docs, logs ni evidencia.
- **Evidencia** en `output/eyeinsky-<fase>/` (no versionada): summary JSON,
  capturas, reportes de arneses.
- **Cierre de fase:** actualizar `EYEINSKY-SESSION.md` (punto de reanudación) y
  `docs/eyeinsky/FASES.md` (checklist), con límites honestos de lo no probado.
- Formato mecánico en commit propio, separado del cambio de comportamiento.

## Mapa de carpetas clave

| Ruta                                                     | Contenido                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/layers/<familia>/`                                  | Capas: fuente, registros y recursos Cesium (flights, satellites, vessels, cctv, ...) |
| `src/director/`                                          | Director cinematográfico: cámara, reloj, timeline, playback, packs                   |
| `src/ui/`                                                | Shell, paneles, Mission Dock, navegación, estado visual, restauración                |
| `src/app/`, `src/services/`, `src/sources/`, `src/data/` | Construcción de la app, servicios, contratos de fuente, lifecycle/estado             |
| `server/providers/`                                      | Rutas Node de feeds públicos, cachés por proceso y cierre                            |
| `server/standalone/`                                     | Entorno, key-setup, configs Vite (`eyeinsky.vite.config.js`)                         |
| `scripts/`                                               | Tests runner, doctor, format, boundaries y arneses `eyeinsky-*.mjs`                  |
| `docs/eyeinsky/`                                         | `FASES.md`, `planning/`, `p3/`, entregas y evidencia documentada                     |
| `docs/superpowers/`                                      | `plans/` y `specs/` de cada fase                                                     |

## Estado de fases (al 2026-09-25)

- **P0–P3:** hechas y aceptadas técnicamente.
- **P3.1 (Mission Dock):** hecha y verificada; integrada en `main`.
- **Fase A (infra):** cerrada; staging privado vivo en `staging.eyeinsky.org`.
- **P4 (satélites 3D):** hecha y aceptada (2026-09-24) con excepciones
  aprobadas por Alex; integrada en `main` (PR #5). Matriz: `docs/eyeinsky/p4/PROPUESTA-P4-2026-09-24.md`
  §9. Candidatos P4.1 en `docs/eyeinsky/FASES.md`.
- **P5 (Tierra–Luna):** hecha y aceptada (2026-09-25) con dos criterios de
  rendimiento no resolubles documentados (P5-16: 4/6), en
  `eyeinsky/p5-tierra-luna`; pendiente de integrar en `main` y de release a
  staging. Queda abierta la regresión `p3-11-surface-quality` en móvil (p3
  27/30: texto de 13 px en la tira TIEMPO). Matriz:
  `docs/eyeinsky/p5/PROPUESTA-P5-2026-09-25.md` §9. Candidatos P5.1 en
  `docs/eyeinsky/FASES.md`.
- **P6 (Luna explorable):** siguiente. **P7:** pendiente.
- Bhote Koshi: aplazado; reintroducirlo exige fase propia.

Fuente de verdad del estado: `EYEINSKY-SESSION.md` y `docs/eyeinsky/FASES.md`.

## Producción

- `eyeinsky.org` (placeholder) y `staging.eyeinsky.org` (P3.1, basic-auth) corren
  en un VPS Hostinger compartido (aaPanel, nginx como `www`, Node 22 del sistema).
- `deploy/README.md` es el procedimiento real: `deploy/release.sh` (build local,
  hash, symlink atómico, smoke, rollback), plantillas systemd y nginx.
- **Publicar código (push/merge a `main`) ≠ desplegar.** El deploy sólo se hace
  con una orden separada y explícita de Alex.
