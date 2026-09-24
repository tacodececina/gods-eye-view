# EYEINSKY — punto de reanudación

## Actualización 2026-09-24 — Fase A cerrada: herramientas, arneses, runtime y staging privado

Rama `eyeinsky/fase-a-herramientas` (worktree `C:/Users/Alex/orca/workspaces/gods-eye-view/coney`), sobre `fe31165`. Roadmap aprobado por Alex el 2026-09-23: **P4→P5→P6→P7 completas antes de publicar**; la infraestructura se ejercita en staging privado desde ya.

Qué cambió:

- **Bug de producto corregido** (`src/ui/eyeinskyShell.js`): en móvil (≤650 px) inspeccionar un sismo dejaba el Mission Dock suspendido sin lista ni ficha. Ahora se retira la razón `mobile-workspace` al mostrar la ficha; cerrar sigue volviendo a inicio.
- **Los cuatro arneses heredados** (`eyeinsky-focus/-journey/-mobile/-states`) vuelven a verde contra 127.0.0.1:4204, junto a P3.1 15/15. Suite unitaria: 4.311 tests, 4.301 pass, 0 fail, 10 skip.
- **`CLAUDE.md` del proyecto** y **toolkit `.claude/`** (everything-claude-code + 8 skills de antigravity; mapa en `.claude/MAPA-HABILIDADES.md`).
- **Runtime de producción endurecido** (`server/production-runtime.js`, 10 tests): MIME completo, límite de body 1 MiB en /api, timeouts, errores de stream, guards de proceso, arranque correcto vía symlink `current/`.
- **`deploy/` real**: `release.sh` construye desde el commit auditado, empaqueta dist + runtime + node_modules de producción, verifica sha256 en remoto, cambia symlink atómicamente, smoke y rollback automático. Plantillas systemd (hardening + EnvironmentFile), nginx con HSTS/CSP/limit_req y snippet compartido, vhost de staging con basic-auth. Rutas adaptadas al aaPanel del VPS (`/www/server/...`).
- `ws` pasa a dependencia de runtime (lo necesita el proveedor AIS).

**Staging vivo:** https://staging.eyeinsky.org/ (basic-auth, `noindex`, `X-EYEINSKY-Phase: staging`). VPS Hostinger compartido, árbol `/opt/eyeinsky-staging`, servicio `eyeinsky-staging` en 127.0.0.1:4174 con el Node 22 del sistema. Release activa `20260924T1436Z-staging`. Credencial de basic-auth en el servidor, `/root/eyeinsky-staging-credential.txt` (root, 600); nunca en el repo ni en el vault. `eyeinsky.org` sigue siendo el placeholder `preparacion-https`, intacto.

Límites honestos del staging: sin claves de proveedores (`/opt/eyeinsky-staging/shared/eyeinsky.env` está vacío: sin Google 3D Tiles, ion, OpenAI, AIS, TomTom, FIRMS); dos violaciones CSP `script-src eval` de sondas de capacidad que no afectan al render; `/api/realtime/debug-log` responde 400 sin clave OpenAI. El release se ejercitó tres veces: el primero falló y hizo rollback automático (bug de arranque vía symlink, corregido).

Siguiente: **P4 (satélites 3D)** con `docs/superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`, en worktree propio desde `main` tras integrar esta rama. Cada fase termina con release a staging.

## Actualización 2026-09-21 — P3.1 (Mission Dock) implementada y verificada; P4 sigue sin iniciar

P3.1 está implementada en `eyeinsky/p3.1-mission-dock`
(`C:/Users/Alex/orca/eyeinsky-p31-mission-dock`), sobre la base `8811666`, con
`claude-opus-5` como único escritor. Es un corte de presentación y autoridad
sobre P3; no añade fuentes de datos nuevas.

Qué cambió, en una línea cada uno:

- El expediente lateral derecho es ahora un **Mission Dock inferior**: riel
  siempre visible (identidad, estado de cámara, valores medidos, brújula,
  SEGUIR/CENTRAR/NORTE/MÁS) y cuerpo desplegable con OBJETIVO, MEDIOS y OPS.
- La cápsula de Actividad es ahora la terminal **`EYEINSKY OPS // LIVE`**,
  tercer panel del dock, sobre el mismo modelo y las mismas fuentes de P3.
- **Autoridad de cámara ≠ identidad de selección.** Un gesto físico suelta la
  cámara y conserva el objetivo: `releaseCameraOwnership({origin})` frente a
  `stopTracking({origin})`, y `refocusTrackedById` para volver a engancharla.
- **`bhote-koshi-locator` retirado del runtime.** Sin capa, sin registro de
  serialización (token `z` retirado, no reutilizado), sin receta ejecutable y
  sin entrada de interfaz. El módulo y sus pruebas siguen en el árbol.

Evidencia supervisora final de esta fase (local, no versionada):

- `output/eyeinsky-p31/supervisor-static-6/summary.json`: 4.311 tests,
  4.301 pass, 0 fail, 10 skip; 98/98 afectadas; build, boundaries, formato,
  TypeScript, whitespace, secretos y estabilidad de hashes verdes.
- `output/eyeinsky-p31/supervisor-browser-6/summary.json`: P3.1 15/15, P3
  30/30, P0–P2 23/23, cámara adversa 9/9 y cockpit 4/4.
- Las dos `ERR_ABORTED` USGS de P3/P0–P2 ocurren al cerrar/cambiar la página;
  no producen errores de página ni invalidan los fixtures aceptados.

La primera auditoría independiente rechazó el candidato por MEDIOS oculto,
wiring residual Bhote, listeners sin teardown, selección/refollow tautológico,
zoom 200 % simulado y umbral táctil débil. Cada punto se reprodujo en RED, se
reparó y pasó reauditoría independiente. El recorrido final selecciona un vuelo
fixture real en Cesium, dispara un `WheelEvent`, conserva el mismo `contextKey`,
muestra cámara libre y SEGUIR vuelve al mismo entity. El zoom usa CDP,
`visualViewport.scale === 2`, viewport visual 720×450, controles y créditos
hitteables, targets de 44 px y texto esencial de al menos 13 px.

Servidor canónico de navegador: `http://127.0.0.1:4204/` (Vite dev forzado y
local). Comprobar HTTP antes de asumir que sigue vivo. No es un deployment.

Bhote Koshi queda **aplazado**, no cancelado: futura experiencia contextual y
**no permanente**. Reintroducirlo requiere una fase propia con su diseño; no es
un interruptor que volver a encender.

Límites honestos de P3.1: no hay teléfono físico, no se afirma FPS sostenido, y
cuatro arneses heredados (`eyeinsky-focus`, `-journey`, `-mobile`, `-states`)
siguen fallando por selectores obsoletos del rediseño P0–P2. Se comprobó
ejecutándolos contra la base `8811666`: fallan **igual** allí, así que no son
regresiones de P3.1. En esta fase sólo se les parametrizó la URL y se reparó la
ruta de navegación a Señales/Operación.

P4 sigue **sin iniciar** y es lo siguiente. No empezarlo sin orden separada.

## Actualización 2026-09-20 — P3 aceptada; P4 sólo planificada

P0–P3 están implementadas en `eyeinsky/p3-opus5`. P3 fue construida con la sesión Claude Code `32cfb7bc-04f0-47e2-a38c-a6278aacda8b`, modelo efectivo `claude-opus-5`, y aceptada por KRÓNOS después de gates independientes y reparación RED→GREEN. La autoridad final es `output/eyeinsky-p3/supervisor/FINAL-ACCEPTANCE.md` y `.json`, no el handoff anterior del constructor.

La preview local aceptada fue `http://127.0.0.1:4198/`; siempre comprobar HTTP antes de asumir que sigue viva. No representa un deployment público.

Estado de integración al redactar este documento:

- Worktree P3: `C:/Users/Alex/orca/eyeinsky-p3-opus5`.
- Rama: `eyeinsky/p3-opus5`.
- Base P0–P2: `812d75c0833887069e31cc2218d47b728b9cad36`.
- `main` remoto previo: `0d41b6be5490db1f10a171f238be75db4d4ec3b4`.
- Alex autorizó commit, push, PR/merge y publicación del código en el fork público.
- El repositorio no tiene GitHub Pages, deployments, environments, releases ni proveedor de hosting configurado. Publicar el código en `main` no equivale a desplegar una app.

P4 está planificada, NO implementada:

- Plan: `docs/superpowers/plans/2026-09-20-eyeinsky-p4-satellites-3d.md`.
- Alcance: OMM/TLE sin truncamiento, época/caducidad, un modelo específico ISS y uno de familia CubeSat sujetos a curación, máximo dos modelos cercanos, puntos globales, selección/cámara/expediente intactos y actitud sólo aproximada.
- No iniciar P4 sin orden separada. Crear un worktree nuevo desde el `main` ya integrado; un solo escritor.

Límites reales de P3 siguen vigentes: no teléfono físico, no afirmación de FPS sostenido, no paridad global completa y CCTV no inventa porcentajes cuando la fuente carece de denominador.
