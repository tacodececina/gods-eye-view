# EYEINSKY — Roadmap y pendientes (fuente única, al 2026-09-26)

> Léelo primero al retomar. Detalle por fase en `docs/eyeinsky/FASES.md`; punto de reanudación en `EYEINSKY-SESSION.md`; decisiones de Alex en `docs/eyeinsky/p*/PROPUESTA-*.md` §0. Copia en el vault: `GOD.INC/06-OPERACIONES/eyeinsky-roadmap-y-pendientes-2026-09-26.md`.

## Estado por fase

| Fase                                                   | Estado                           | Evidencia canónica                                                                           |
| ------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------- |
| P0–P3.1                                                | hechas y aceptadas               | `docs/eyeinsky/FASES.md`                                                                     |
| Fase A infra (herramientas, arneses, runtime, staging) | hecha 2026-09-24                 | `EYEINSKY-SESSION.md`                                                                        |
| P4 satélites 3D (ISS, Hubble, CubeSat 1U)              | aceptada 2026-09-24              | `docs/eyeinsky/p4/PROPUESTA-P4-2026-09-24.md` §9                                             |
| P5 Tierra–Luna (DE441, reloj único, Luna real)         | aceptada 2026-09-25              | `docs/eyeinsky/p5/PROPUESTA-P5-2026-09-25.md` §9                                             |
| Fase visual Editorial (piel, globo, revelación, móvil) | en producción 2026-09-26 (PR #7) | `docs/superpowers/plans/2026-09-25-eyeinsky-fase-visual-editorial.md`, `docs/PERFORMANCE.md` |
| P6 Luna explorable                                     | propuesta borrador, NO iniciada  | `docs/eyeinsky/p6/PROPUESTA-P6-2026-09-26.md`                                                |
| P7 integración y aceptación final                      | no iniciada                      | plan maestro §P7                                                                             |

## Producción y staging

- **eyeinsky.org**: release `20260926T1658Z-visual-prod2` (commit `ae1760b` de `main`). Cabeceras `X-EYEINSKY-Phase: beta` y `X-Robots-Tag: noindex` hasta que Alex ordene indexar (una línea en el vhost). Sin claves de proveedores en `/opt/eyeinsky/shared/eyeinsky.env` (sin Google 3D Tiles, Cesium ion, OpenAI, AIS, TomTom, FIRMS).
- **staging.eyeinsky.org**: basic-auth (usuario `alex`; contraseña solo en el VPS: `/root/eyeinsky-staging-credential.txt`), `/mockups/` con las tres maquetas de dirección visual.
- **VPS**: Hostinger 195.35.32.233, aaPanel, nginx como `www`, vhosts en `/www/server/panel/vhost/nginx/`, snippet en `/www/server/nginx/conf/snippets/`, Node 22 del sistema compartido con otras apps (no reemplazar), servicios `eyeinsky` (4173) y `eyeinsky-staging` (4174) con `WorkingDirectory` en `shared/runtime`. Procedimiento y rollback: `deploy/README.md`; placeholder como release de rollback `20260917T2033Z-iris-orbital`.
- **Release**: `deploy/release.sh` con `EXPECTED_SHA` del commit auditado; producción exige `APP_ROOT=/opt/eyeinsky SERVICE=eyeinsky RUNTIME_PORT=4173 VHOST=/www/server/panel/vhost/nginx/eyeinsky.org.conf`.

## Pendientes ordenados

1. **Alex prueba producción** y dicta correcciones de la fase visual; decidir cuándo quitar `noindex`.
2. **Claves de proveedores** en `eyeinsky.env` de producción (por SSH, nunca en documentos).
3. **Menores de la fase visual**: margen superior de rótulos frente a la barra; encuadre nocturno del seguimiento (que se vea el limbo o el terminador); hechos del TLE (inclinación, periodo) en el panel de la ISS; repintado del titular en simulación; `satelliteLabelBudget` conectado; hover en sismos.
4. **P4.1**: órbita manual alrededor del modelo en INSPECCIONAR (hoy los gestos sueltan el seguimiento por diseño P3.1: decisión de producto), huella y pases, GEO (TDRS/GOES), atribuir los +2 comandos del EntityCluster y el heap residual.
5. **P5.1**: tono uniforme de textura LROC 1k/2k, +2 comandos con Luna fuera de cuadro, carrera con navegación entre ciudades, enlace fuera de rango con Luna apagada.
6. **Arneses**: el paso P4-20 abre una segunda página y agota 120 s al final de un recorrido largo (carga en 4 s aislado); correr regresiones en secuencia o contra `npm run preview`; `mobile-keyboard-focus` inestable en 390 px.
7. **P6 Luna explorable**: panel de diseño (tres propuestas, jueces) y validación de fuentes (LROC WAC, LOLA, IAU) antes de ejecutar T0–T6 de la propuesta.
8. **P7**: recorridos R01–R10, paridad con upstream, teléfono físico, medición completa, aceptación de Alex, quitar `noindex`, tag `v1.0.0-eyeinsky`.

## Cómo retomar una sesión

1. Leer este archivo, `EYEINSKY-SESSION.md` y `CLAUDE.md`.
2. Worktrees: `C:/Users/Alex/orca/eyeinsky-p6` (rama `eyeinsky/p6-luna-explorable`) para P6; crear uno nuevo desde `main` para cualquier otra fase (un solo escritor por worktree).
3. Servidor de desarrollo: `npx vite --config server/standalone/eyeinsky.vite.config.js --port 4204 --strictPort --host 127.0.0.1` desde el worktree activo; los arneses apuntan a `http://127.0.0.1:4204/`.
4. Gates antes de cerrar: `build`, `doctor`, `format:check`, `check:boundaries`, `npm test`, arneses afectados en secuencia (`eyeinsky-visual`, `p012`, `p3`, `p31`, `p4`, `p5`, `mobile/focus/journey/states`, `smoke`).
5. Rendimiento en la GPD: modo `windows` de gpd-forge, sin juegos, CPU ≤ 78 °C, n=3 rondas intercaladas, método `output/eyeinsky-p4/t7/perf-repeat/measure-repeat.mjs`; nunca FPS.
6. Cierre de fase: `FASES.md`, `EYEINSKY-SESSION.md`, este roadmap, vault `06-OPERACIONES/` + `09-AGENTES/kronos/MEMORIA.md`, `git push`.

## Decisiones vigentes de Alex

- P4–P7 completas antes de la publicación definitiva; `eyeinsky.org` está en beta pública sin indexar por su orden del 2026-09-26.
- Dirección visual: Editorial Clean (2026-09-25). Pose TILT en escritorio con deriva sutil, SOLAR en móvil (2026-09-26). Sin dock en reposo, USGS bajo demanda, datos avanzados ocultos, cielo real, copy «Reloj en vivo».
- Hubble incluido en P4; excepción P4-24 (EntityCluster +2 comandos, caché de shaders única).
- Respaldo `astronomy-engine` (≤20 km) fuera de 2021–2040; textura NASA SVS 1k/2k.
- SSH al VPS y cambios de modo de la GPD autorizados con aviso de una línea.
