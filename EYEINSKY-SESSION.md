# EYEINSKY — punto de reanudación

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

Evidencia local de esta fase (no versionada): `output/eyeinsky-p31/`.
Servidor usado: `http://127.0.0.1:4201/` (vite dev). Comprobar por HTTP antes de
asumir que sigue vivo. No es un deployment.

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