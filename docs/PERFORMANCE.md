# Performance baseline

This page records one hardware-rendered Apple M5 comparison captured on 22
August 2026 in Chrome 150 at 1440 x 900. It is not a minimum hardware
specification and should not be used to predict performance on untested systems.
The original capture artifacts are not included here, so this page records
results rather than defining a runnable benchmark.

## Test context

The baseline was captured on 22 August 2026 with these conditions:

| Setting | Value |
| --- | --- |
| Renderer | Apple M5 Metal through the hardware ANGLE path |
| Browser | Chrome 150 in a fresh isolated profile |
| Viewport | 1440 x 900 at device pixel ratio 1 |
| Focus | Page foregrounded for controlled scenes |
| Scene sample | 5 seconds of scripted motion, then 5 seconds at rest |
| Startup | Browser cache disabled; three samples |

The capture covered three startup samples, 16 cold layer scenarios with 14
measurements, 23 controlled option and stress scenes, and five
hardware-rendered overlay scenes.

## Startup

| Sample | App ready | Initial settle | Load event | Motion / rest | Used JS heap |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 784.980 ms | 2,035.082 ms | 439.5 ms | 60 / 60 FPS | 102.9 MiB |
| 2 | 604.849 ms | 1,855.836 ms | 442.4 ms | 60 / 60 FPS | 111.6 MiB |
| 3 | 558.527 ms | 1,809.592 ms | 438.8 ms | 60 / 60 FPS | 105.1 MiB |
| Median | 604.849 ms | 1,855.836 ms | 439.5 ms | 60 / 60 FPS | 105.1 MiB |

The initial-settle measurement is the more useful launch reference because it
includes the first visual and data settling window. All three samples reached
the display ceiling during both motion and rest.

## Cold layer activation

Cold activation was measured separately from warm option switching. Live object
counts are included so that future runs can compare source populations before
attributing a difference to the client.

| Layer | Activation | Source count | Motion / rest | Used JS heap |
| --- | ---: | ---: | ---: | ---: |
| CCTV city | 19,608.240 ms | 48 | 60 / 60 FPS | 192.7 MiB |
| Space Missions (report label: Rocket missions) | 3,581.066 ms | 26 | 60 / 60 FPS | 131.3 MiB |
| Radio | 3,458.709 ms | 750 | 60 / 60 FPS | 124.8 MiB |
| Bikeshare | 2,069.498 ms | 633 | 60 / 60 FPS | 157.4 MiB |
| Datacenters | 817.693 ms | 4,362 | 59.6 / 60 FPS | 328.2 MiB |
| Flights | 667.671 ms | 247 | 60 / 60 FPS | 118.4 MiB |
| Submarine cables | 614.727 ms | 2,629 | 60 / 60 FPS | 412.0 MiB |
| Military Flights | 557.113 ms | 68 | 60 / 60 FPS | 118.4 MiB |

CCTV had the largest cold activation cost in this capture. Submarine cables
used the most heap, followed by datacenters. Completed single-layer samples
generally reached 60 FPS, so activation time and heap separate these cases more
clearly than steady-state frame rate.

## Aircraft, detection, and Cockpit

| Scene | Motion / rest |
| --- | ---: |
| Idle globe | 60 / 60 FPS |
| Flights, 2D | 60 / 60 FPS |
| Flights, 3D proximity | 60 / 60 FPS |
| Flights, all 3D models | 60 / 60 FPS |
| Military Flights, all 3D models | 60 / 60 FPS |
| Detection at 25% | 39.3 / 41.1 FPS |
| Detection at 50% | 37.4 / 39.8 FPS |
| Detection at 100% | 34.4 / 35.5 FPS |
| Cockpit | 49.6 / 49.2 FPS |

The clean detection scenes processed 8,169 to 8,170 observations. Selected
labels rose from 14 at 25% density to 28 at 50% and 56 at 100%. The aircraft
rows came from an earlier loaded, foreground-controlled pass because the clean
rerun received no live aircraft rows.

## Visual styles and combined stress

| Scene | Motion / rest |
| --- | ---: |
| Normal | 60 / 60 FPS |
| CRT (report label: Retro) | 60 / 60 FPS |
| NVG (report label: Surveillance) | 60 / 60 FPS |
| FLIR (report label: Thermal) | 49 / 60 FPS |
| Anime | 60 / 59.8 FPS |
| Noir | 47 / 56.6 FPS |
| Snow | 42.3 / 45.8 FPS |
| Combined static | 57.6 / 60 FPS |
| Combined operational | 39.9 / 43.1 FPS |

The combined static scene rendered 11,575 objects, used 872.2 MiB of JavaScript
heap, and issued 48,665 text draws during motion and 54,106 at rest. The combined
operational sample contained 3,909 observations and two selected labels, but its
live aircraft and traffic rows were empty, so it remains a limited stress case.

Snow, Noir, dense detection, and text-heavy combined layers are the clearest
controlled comparison points for later optimization work.

## Keyed live sources

NASA FIRMS, AISStream, and TomTom were captured in a separate hardware-rendered
pass. The page was visible but was not the focused window, so these frame rates
must not be compared directly with the foreground-controlled scenes above.

| Source | Point-in-time population | Activation or coverage | Motion / rest |
| --- | ---: | --- | ---: |
| NASA FIRMS | 100,430 detections in 3,557 cells | 30.0 s activation | 32.1 / 55.2 FPS |
| AISStream | 12,000 vessels | 6.4 s activation | 22.1 / 29.8 FPS |
| TomTom Traffic | 4,222 road dots | 70% coverage, 2 decoded tiles | 45.0 / 51.7 FPS |

These populations change continuously. A future comparison must record the
live counts again and match the focus conditions.

## Controls for a future capture

Use the same controls before attributing a difference to the application:

1. Record the exact GPU renderer and reject software-rendered or unavailable GPU
   strings.
2. Use a 1440 x 900 viewport at device pixel ratio 1 and keep the page focused.
3. Measure cache-disabled startup separately from cold layer activation and warm
   option switching.
4. Repeat startup three times and compare medians.
5. Sample each option for 5 seconds in scripted motion and 5 seconds at rest.
6. Record live object counts before attributing a difference to the client.
7. Treat a live-source outage as missing coverage, not as evidence of low client
   rendering cost.

## What is not established yet

- This report does not establish Windows performance.
- The report does not record machine memory capacity, so it cannot support a
  minimum-memory recommendation.
- The report does not cover other GPU renderers or viewport configurations.
- Military Installations is outside this comparison because it requires close
  camera context.
- The keyed pass has no controlled rerun suitable for comparison with the
  option scenes.

Use this page as a regression baseline for one known hardware and browser
configuration, not as a compatibility guarantee.

## P4 satélites 3D (2026-09-24, GPD Win 4)

La sesión anterior (`output/eyeinsky-p4/t7/perf/` y `t7/repair-perf-1/`) se
descartó por contaminación: League of Legends abierto, modo `gaming` y CPU a
85–93 °C. Los valores de abajo son de la sesión limpia.

Arnés: `output/eyeinsky-p4/t7/perf-clean/measure-clean.mjs`. Es una copia de
`scripts/eyeinsky-p4-perf.mjs` @ `64880d1` que añade la escena E2 (un segundo
ciclo) y telemetría. Usa el mismo método que la línea base T0
(`output/eyeinsky-p4/baseline/`):

- Chrome 153 headless con ANGLE/D3D11 sobre la GPU real (`AMD Radeon(TM) 890M`,
  no SwiftShader);
- 1366x768 a DPR 1;
- 60 s por escena;
- CPU del frame de Cesium (`preUpdate` → `postRender`), `commandList` (API
  privada) y heap de JS tras GC.

Condiciones: modo `windows`, AC y ningún proceso de Riot o LoL. Antes de cada
modo, una compuerta térmica esperó a tener CPU ≤ 78 °C durante 60 s. Durante
las escenas la CPU estuvo a 70,5–75,8 °C y el package a unos 14–16 W; en T0,
75–77 °C. La evidencia completa está en `output/eyeinsky-p4/t7/perf-clean/`
(`README.md`, `summary.json`, `<modo>/raw-results.json` y `calib-api/`). No se
miden FPS.

Los valores de CPU son p50 / p95 en ms del tiempo de CPU del frame de Cesium. La
última columna es `commandList` p50.

| Escena                                   | T0        | `off`      | `std`          | `low`     | commandList off / std / low |
| ---------------------------------------- | --------- | ---------- | -------------- | --------- | --------------------------- |
| A · core, sin selección                  | 1,8 / 2,7 | 2,7 / 4,3  | 4,4 / 6,8      | 2,0 / 3,3 | 22 / 22 / 22                |
| B · ISS en ÓRBITA                        | 2,7 / 6,4 | 6,1 / 16,1 | 5,1 / 11,0     | 2,3 / 6,0 | 63 / 61 / 42                |
| B2 · ISS en INSPECCIONAR, modelo ≥ 24 px | —         | no aplica  | 7,8 / **18,9** | 3,2 / 7,8 | — / 62 / 54                 |
| E · tras disable/enable                  | —         | 3,7 / 5,8  | 2,7 / 5,2      | 2,3 / 3,7 | 24 / 24 / 24                |
| E2 · 2.º ciclo idéntico                  | —         | 3,7 / 5,8  | 2,4 / 3,7      | 2,3 / 3,6 | 24 / 24 / 24                |
| C · ISS en ÓRBITA, zoom 200 %            | 1,9 / 5,0 | 3,9 / 8,4  | 1,8 / 4,9      | 2,0 / 5,6 | 37 / 26 / 27                |
| D · dense (11.604 puntos)                | 3,2 / 5,3 | 4,7 / 7,2  | 3,5 / 8,7      | 4,0 / 6,2 | 24 / 24 / 24                |

El heap tras GC, en MiB:

| Modo  | A     | E     | E2    |
| ----- | ----- | ----- | ----- |
| `off` | 105,2 | 109,1 | 110,6 |
| `std` | 105,5 | 114,0 | 114,2 |
| `low` | 105,4 | 113,7 | 113,2 |

Hubo 0 long tasks en todas las escenas, salvo B en `off` (1, de 134 ms).

Veredicto por criterio en esta corrida única (A y B2 `std` se repitieron
después; ver «Repetición intercalada» abajo):

- **A, `std` frente a `off` (Δp95 ≤ 1 ms): NO CUMPLE.** El p95 sube +2,5 ms.
  - Los commands (22) y el heap tras GC coinciden, y hay 0 modelos admitidos.
  - El exceso no tiene una causa medida.
- **B2 frente a B (Δp95 ≤ +2 ms y 0 long tasks):**
  - `std`: **NO CUMPLE.** El p95 sube +7,9 ms, con 0 long tasks.
  - `low`: **CUMPLE.** El p95 sube +1,8 ms, con 0 long tasks.
- **E, commands = A-off + 2 (excepción del `EntityCluster` aceptada): CUMPLE**
  en los tres modos.
- **E2 − E, heap ≤ 0,5 MiB: CUMPLE.** `std` +0,25 y `low` −0,45.
  - E − A-off da +8,8 MiB en `std` y +3,9 en `off`. Es una caché única que no
    crece en el segundo ciclo.
- **`low`, tope 1 y sin modelo secundario: CUMPLE.** Solo se admite el 25544.
- **§5, 60 s de órbita (≤ 2 altas + evicciones por minuto):**
  - Con rueda y arrastre reales no se puede ejecutar. El primer gesto suelta el
    seguimiento (`navigationController.interruptHumanNavigation`), la ISS se
    aleja y el modelo se eviciona una vez por LOD.
  - Con el mismo guion por la API de cámara, que no es entrada manual y
    conserva el seguimiento: 1 alta + 1 evicción = **2/min**. Cumple, en el
    límite. Hubo 14 cruces de la línea de 6 px y 4 de la de 3 px.
  - No se tocó `policy.js`.

Limitaciones:

- Una sola ejecución de 60 s por escena y modo, con los modos en serie y sin
  intercalar.
- En escenas sin ningún modelo, la dispersión entre modos es de varios ms de
  p95; por ejemplo, B en `off` es la peor. Eso está por encima de la resolución
  que exigen los criterios de 1–2 ms.
- Headless con GPU real, sin tiempo de GPU.

### Repetición intercalada de A, B y B2 (`perf-repeat`, n = 3)

Evidencia: `output/eyeinsky-p4/t7/perf-repeat/` (`README.md`, `summary.json`,
`round-<n>/`). Mismo HEAD `64880d1`, mismo renderer (Radeon 890M, ANGLE/D3D11),
1366x768 a DPR 1, 45 s por escena tras 8 s de asentamiento, un navegador nuevo
por escena y orden intercalado y alternado entre rondas (R1 off-A → std-A →
std-B → std-B2 → off-B; R2 al revés; R3 como R1). Compuerta térmica ≤ 78 °C
antes de cada escena; CPU a 70,4–72,6 °C durante las ventanas. Modo `windows`,
sin escribir hardware. 0 errores de página, 0 long tasks.

Medianas y rangos de la CPU del frame de Cesium, en ms:

| Escena | p50: mediana [mín–máx] | p95: mediana [mín–máx] | commandList p50 |
| ------ | ---------------------- | ---------------------- | --------------- |
| off-A  | 2,2 [2,1–2,5]          | 3,5 [3,4–4,3]          | 22              |
| std-A  | 2,0 [1,9–2,0]          | 3,1 [3,1–3,2]          | 22              |
| std-B  | 2,4 [2,3–2,5]          | 6,1 [6,0–6,3]          | 51–56           |
| std-B2 | 2,6 [2,5–2,7]          | 6,1 [6,1–6,1]          | 56–59           |
| off-B  | 2,4 [2,3–2,5]          | 6,1 [6,0–6,3]          | 51–57           |

Veredicto:

- **A, `std` frente a `off`: CUMPLE.** Δp95 de medianas −0,4 ms (intra-ronda
  −0,4 / −0,3 / −1,1), mismos 22 comandos. No se atribuye mérito a `std`: en A
  no hay ningún modelo.
- **B2 frente a B en `std`: CUMPLE.** Δp95 de medianas 0,0 ms (intra-ronda
  0,0 / +0,1 / −0,2), p50 +0,2 ms en las tres rondas, 0 long tasks, 0 frames de
  rAF > 33 ms, +2–3 comandos por el modelo de la ISS (264–268 px).
- El +2,5 ms y el +7,9 ms de `perf-clean` no se reproducen. Posibles causas
  (sin verificar): estado acumulado de la sesión larga o una perturbación
  puntual de aquella corrida.
- E, E2, `low` y §5 no se repitieron: siguen como en `perf-clean`. E = A-off +
  2 comandos (`EntityCluster`) es una excepción aprobada por Alex.

Límites: n = 3 no da intervalo de confianza formal; escenas en frío en navegador
nuevo, no la secuencia de una sesión; sólo CPU del hilo principal, sin GPU; sin
FPS.

## P5 Tierra–Luna (2026-09-25, GPD Win 4)

Evidencia: `output/eyeinsky-p5/perf/` (`README.md`, `summary.json`,
`round-<n>/`, `run.log`). Arnés `measure-p5.mjs`, derivado de P4
`perf-repeat`. Mismas funciones de página: CPU del frame de Cesium
(`preUpdate` → `postRender`), `commandList` (API privada), long tasks y heap.
Añade heap tras GC forzado por CDP antes y después de cada ventana.

Condiciones de captura:

- HEAD `5ee9868` más el árbol de trabajo de T8/T9.
- Chrome 153 headless con ANGLE/D3D11 sobre la GPU real (`AMD Radeon(TM) 890M`).
- 1366x768 a DPR 1 y `?satModels=std`.
- 45 s por escena tras 8 s de asentamiento, con un navegador nuevo por escena.
- n = 3 rondas intercaladas: R1 A → A′ → M1 → M2 → S → E; R2 al revés; R3
  como R1.

Vista fija durante todo el plan: lat 20°, 20 000 km, lon 152°. Deja la Luna a
la espalda de la cámara (150–155° del eje). La vista de P4 (lon −30°) se
descartó porque la Luna entraba en cuadro según la hora.

Las escenas usan clics reales en APUNTAR A LA LUNA, SISTEMA TIERRA–LUNA y
AVANCE (hasta ×3600). En E la Luna se enciende y luego se apaga.

**Límite de condiciones.** gpd-forge estuvo en modo `gaming` (no `windows`) y
no se escribió hardware. La compuerta térmica de ≤ 78 °C no pasó en ninguna de
las 18 escenas: cada una esperó 5 min y se midió igual, con la CPU a
82,5–92 °C y el package a 21–33 W, y con carga ajena. Las cifras absolutas no
son comparables con P4; solo valen los Δ intra-plan. No se miden FPS.

Medianas [mín–máx] de la CPU del frame de Cesium, en ms:

| Escena                                 | p50           | p95           | commandList | Δ heap GC en 45 s (MiB) |
| -------------------------------------- | ------------- | ------------- | ----------- | ----------------------- |
| A · satélites core, Luna OFF           | 1,7 [1,6–1,7] | 2,5 [2,5–2,6] | 22          | +1,28 [+0,36 – +1,29]   |
| A′ · Luna ON, en vivo, fuera de cuadro | 1,7 [1,7–1,8] | 2,7 [2,5–2,8] | 24          | +0,43 [−0,02 – +0,72]   |
| M1 · APUNTAR A LA LUNA, escala física  | 1,1 [1,1–1,1] | 1,7 [1,7–1,7] | 11          | +0,49 [+0,21 – +0,93]   |
| M2 · SISTEMA TIERRA–LUNA               | 1,6 [1,5–1,6] | 2,7 [2,6–2,8] | 13          | +1,47 [+0,22 – +1,94]   |
| S · simulación ×3600, Luna ON          | 1,7 [1,6–1,7] | 2,5 [2,5–3,1] | 24          | +0,42 [+0,40 – +0,92]   |
| E · tras disable de la Luna            | 1,7 [1,7–1,7] | 2,5 [2,5–2,7] | 22          | +0,38 [+0,21 – +0,95]   |

0 long tasks, 0 frames de rAF > 33 ms y 0 errores en las 18 ventanas.

Veredicto (cumple solo si cumplen la mediana y las 3 rondas):

- **A′ − A, Δp95 ≤ 1 ms: CUMPLE.** Δ de medianas +0,2 ms (intra-ronda +0,2 /
  0,0 / +0,2). Hay +2 comandos con la Luna fuera de cuadro; su origen no se ha
  verificado (probablemente la retícula de borde y el marcador).
- **M1 ≤ A + 3 ms de p95: CUMPLE.** Δ −0,8 ms (−0,9 / −0,8 / −0,8). Sale más
  barato porque APUNTAR saca casi toda la Tierra del cuadro; no aísla el coste
  del disco lunar.
- **M2 ≤ A + 3 ms de p95: CUMPLE.** Δ +0,2 ms (+0,1 / +0,1 / +0,3), con la
  Tierra y la Luna en cuadro.
- **S, 0 long tasks y heap tras GC ≤ +2 MiB en 45 s: CUMPLE.** 0 long tasks y
  Δ heap de +0,92 / +0,42 / +0,40 MiB.
  - Hay picos aislados de 19,6–21,7 ms de CPU de frame (máx), frente a
    ≤ 11,2 ms en el resto. No afectan al p95 y su causa no está atribuida:
    no se capturó perfil.
  - A ×3600 la Luna derivó fuera de cuadro.
  - Los satélites siguen visibles, rotulados «puntos SGP4 en hora real, no
    simulados».
- **E = A ± 1 comando: CUMPLE.** 22 = 22 en las 3 rondas. El heap tras GC
  queda en +0,5 MiB sobre A, dentro de la dispersión de A.

Límites:

- n = 3 sin intervalo de confianza formal.
- La vista no es la de P4, así que la comparabilidad con la línea base P4
  (P5-16) queda **no resoluble** en este plan. Para resolverla, hay que
  repetirlo en modo `windows` a ≤ 78 °C.
- M1 y M2 miden la escena de la acción, no la Luna aislada.
- Solo CPU del hilo principal, sin GPU. No se midió en teléfono. Sin FPS.
