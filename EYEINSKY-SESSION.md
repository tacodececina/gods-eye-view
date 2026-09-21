# EYEINSKY — punto de reanudación

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