# P4 — Ledger de activos satelitales (T0)

Curación de KRÓNOS del 2026-09-24 para P4 (satélites 3D). Tres modelos NASA
admitidos como copias byte a byte: ISS (específico, NORAD 25544), Hubble
(específico, NORAD 20580) y CubeSat 1U (familia, solo el grupo CelesTrak
`cubesat`). Descriptor ejecutable: `public/models/satellites/manifest.json`.

## Procedencia y derechos

- Repositorio: `github.com/nasa/NASA-3D-Resources`, revisión fijada
  `11ebb4ee043715aefbba6aeec8a61746fad67fa7` (nunca `master`).
- El README del repositorio dice que los activos son «free and without
  copyright» y remite a las guías de uso de NASA. No son CC BY 4.0. La licencia
  MIT del código de EYEINSKY tampoco los cubre.
- Condiciones que se aplican
  (https://www.nasa.gov/nasa-brand-center/images-and-media/):
  - sin insignias ni logotipos de NASA;
  - sin sugerir respaldo de NASA;
  - crédito visible «Source: NASA 3D Resources» mientras haya un modelo activo.
- Metadatos glTF: `asset.generator` = «Khronos glTF Blender I/O v4.2.57» en los
  cuatro candidatos, y `asset.copyright` ausente. Ningún GLB declara un
  contribuidor ni un tercero.
- Los nombres de material del CubeSat («ICECube-\*», «Afta-solar\*») apuntan a
  que el modelo deriva de una misión concreta. Se usa solo como familia genérica
  1U, sin afirmar la identidad de ningún satélite.
- Verificación HTTP del 2026-09-24: las tres `sourceUrl` del manifiesto
  (codificadas como URL) respondieron 200. Los bytes descargados tienen el mismo
  SHA-256 que las copias de `public/models/satellites/`.

## Transformaciones

**Ninguna.** Cada archivo es una copia exacta del original y solo cambia de
nombre, con el hash corto:

| Archivo publicado                                  | Original en la revisión fijada                                                              | Bytes     | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `public/models/satellites/iss-70d0619a.glb`        | `3D Models/International Space Station (ISS) (A)/International Space Station (ISS) (A).glb` | 39.708    | `70d0619a69312a45cbf740ba9a491fad854e10226dc5936c213fb1f93f063678` |
| `public/models/satellites/hubble-e5ba4de1.glb`     | `3D Models/Hubble Space Telescope (A)/Hubble Space Telescope (A).glb`                       | 1.694.988 | `e5ba4de15c7d359ac8fa1ab7e286aff42dec09c0fadae3db99252587f39fa384` |
| `public/models/satellites/cubesat-1u-bae308ea.glb` | `3D Models/CubeSat - 1 RU Generic/CubeSat - 1 RU Generic.glb`                               | 149.424   | `bae308ea2e33778c93675909f7dc2e0d5d6916cd685668a463566c61224b1e85` |

La escala real se aplica en tiempo de ejecución con `scaleMeters`. No se hornea
en el archivo.

## Mediciones (`scripts/eyeinsky-glb-inspect.mjs`)

Unidades del modelo en «u». El bbox se mide en el espacio de la escena, con las
transformaciones de nodo aplicadas.

Método del bbox: esquinas de los min/max de cada accessor, porque la geometría
Draco no se puede leer sin decodificar. En estos cuatro GLB el resultado es
exacto:

- todas las rotaciones de nodo son de ±90° sobre X, es decir, permutaciones de
  ejes;
- las escalas son uniformes.

| Métrica                     | ISS (A)                     | ISS (B)                     | Hubble (A)                                 | CubeSat 1U               |
| --------------------------- | --------------------------- | --------------------------- | ------------------------------------------ | ------------------------ |
| Bytes                       | 39.708                      | 476.992                     | 1.694.988                                  | 149.424                  |
| Nodos / meshes              | 1 / 1                       | 11 / 10                     | 2 / 1                                      | 2 / 1                    |
| Primitivas dibujadas        | 6                           | 36                          | 5                                          | 18                       |
| Triángulos                  | 6.642                       | 174.440                     | 7.672                                      | 23.570                   |
| Materiales                  | 6                           | 19                          | 5                                          | 18                       |
| Texturas / imágenes         | 0 / 0                       | 0 / 0                       | 5 / 10 (WebP + PNG de respaldo)            | 0 / 0                    |
| Arista máxima de textura    | —                           | —                           | 1024 (4 × 512×1024, 1 × 512×512)           | —                        |
| Extensiones requeridas      | Draco                       | Draco                       | Draco (`EXT_texture_webp` usada)           | Draco                    |
| bbox (u)                    | 25,6142 × 15,9625 × 15,3736 | 14,4177 × 45,4324 × 45,5444 | 458,2472 × 525,4886 × 501,3059             | 5,1928 × 2,6015 × 2,1971 |
| Radio, media diagonal (u)   | 16,9355                     | 32,9631                     | 429,3706                                   | 3,1048                   |
| GPU estimada (decodificada) | 0,28 MB                     | 3,52 MB                     | 13,37 MB (0,78 geometría + 12,58 texturas) | 1,84 MB                  |

La estimación de GPU cuenta los accessors dibujados más las texturas RGBA8 con
su cadena completa de mipmaps (factor 4/3). Es un orden de magnitud, no una
medición de Cesium.

## Escala real

- **ISS (A):** la dimensión mayor, 25,6142 u en X, es la celosía con los paneles
  (envergadura real de unos 109 m).
  - `scaleMeters = 109 / 25,6142 = 4,2554456`.
  - Medidas escaladas: 109,0 × 67,9 × 65,4 m.
  - `radiusM = 72,068`.
- **Hubble (A):** la dimensión mayor, 525,4886 u, es el eje del tubo (13,2 m
  reales).
  - `scaleMeters = 13,2 / 525,4886 = 0,0251195`.
  - Comprobación cruzada: la primitiva del tubo mide 168,0 u de diámetro, que
    escaladas dan 4,22 m (real, 4,2 m). Además, 525,49 u equivalen a 13,35 m si
    la unidad fuera la pulgada, lo que sugiere que el modelo está en pulgadas.
  - `radiusM = 10,786`.
- **CubeSat 1U:** la dimensión mayor, 5,1928 u, **no** es el cuerpo. Es la
  envergadura de las antenas desplegadas (primitiva en y ≈ 1,12 u con x de
  −2,60 a 2,59). Escalar por ella dejaría el cuerpo en unos 4 cm, así que se
  descarta.
  - La escala sale de la arista del cuerpo (primitiva de estructura, 2,0836 u
    en X) igualada a 0,10 m: `scaleMeters = 0,10 / 2,0836 = 0,0479943`.
  - Medidas escaladas: cuerpo de 0,100 × 0,124 × 0,098 m y antenas de 0,249 m.
  - `radiusM = 0,149`.
  - Incertidumbre de alrededor del 10 %: tomar el eje Z de la estructura
    (2,0455 u) daría 0,0489.

## Ejes (espacio glTF del nodo)

El inspector propone de forma heurística forward = extensión mayor y up =
extensión menor. En la ISS, el Hubble y la ISS (B) marca `ambiguous: true`. Los
valores del manifiesto salen de la estructura, no de esa heurística:

- **ISS:** `upAxis +Y`, `forwardAxis +Z`. Coincide con la convención glTF y con
  los valores por defecto de `Cesium.Model`. Extensiones en mundo, ya escaladas
  (m):

  | Material      | X    | Y    | Z    | Lectura                              |
  | ------------- | ---- | ---- | ---- | ------------------------------------ |
  | ISSGray2      | 98,6 | 14,8 | 19,8 | Celosía a lo largo de X, en y 6…21 m |
  | ISSWhiteMetal | 4,5  | 12,0 | 44,9 | Módulos a lo largo de Z, en y −9…3 m |
  | ISSDarkMetal  | 3,2  | 39,0 | 61,2 | Módulos y radiadores a lo largo de Z |

  La celosía va perpendicular a la marcha (normal orbital) y queda por encima
  de los módulos (cénit = +Y), y los módulos van a lo largo de ±Z (marcha). **El
  signo de +Z frente a la velocidad (segmento US delante) no está verificado
  visualmente.** Se confirma con una captura en T3/T5.

- **Hubble:** `upAxis +Y`, `forwardAxis +Z` (convención glTF). El eje óptico va
  a lo largo de +Y glTF, con la abertura hacia +Y. Como la actitud es
  `desconocida-ilustrativa`, no se afirma ninguna orientación real.
- **CubeSat 1U:** `upAxis +Y` (eje de los raíles, con las antenas arriba) y
  `forwardAxis +Z`, por convención. Actitud `desconocida-ilustrativa`.

## Decisión ISS: (A)

Se elige **ISS (A)** (`iss-70d0619a.glb`). El criterio es el presupuesto `std`
(≤ 60k triángulos, ≤ 12 primitivas, texturas ≤ 1024 px) y, dentro de él, gana el
modelo con más geometría:

- **(B) no cabe en el presupuesto:**
  - 174.440 triángulos, 2,9 veces el tope;
  - 36 primitivas, 3 veces el tope;
  - 3,52 MB de GPU estimada;
  - 7 meshes («bendedtru\*», «pCylinder\*») flotan separadas del cuerpo, en
    y 40,8…41,3 u, cuando el cuerpo principal está en y −4,2…25,8 u;
  - su bbox no encaja con las proporciones de la ISS.

  Al quedar fuera, no hay comparación de fidelidad posible.

- **(A) cumple `std` y `low`:**
  - 6.642 triángulos, 6 primitivas, sin texturas y 0,28 MB;
  - proporciones de 109 × 68 × 65 m, coherentes con la ISS y los paneles
    desplegados;
  - la configuración de la ISS que representa (fecha, iROSA) no está
    documentada, y se trata como ilustrativa.

## Presupuesto por activo y decisiones (Alex/KRÓNOS, 2026-09-24)

| Activo     | `std`                                                                        | `low`                                                              |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ISS (A)    | Cumple                                                                       | Cumple                                                             |
| Hubble (A) | **Excede** (GPU estimada 13,4 MB > 6 MB) → **excepción de memoria aceptada** | **Excede** (textura 1024 > 512 y GPU) → **sin modelo, solo punto** |
| CubeSat 1U | **Excede** (18 primitivas > 12) → **aceptado** (1,84 MB, 23.570 triángulos)  | **Excede** (18 > 8) → **aceptado**                                 |

Detalle y justificación en `docs/eyeinsky/p4/T0-FINDINGS.md`, sección
«Decisiones», y en el campo `budget` del manifiesto.

Además, **los cuatro GLB exigen `KHR_draco_mesh_compression`**
(`extensionsRequired`). Esto choca con la línea «ni Draco ni KTX2» de la
propuesta (§5) y con `public/models/README.md`, que dejó los aviones sin
comprimir para no competir con la fotogrametría por los workers de Draco.

Cesium 1.138 incluye `draco_decoder.wasm`, y el CSP de producción ya permite
`'wasm-unsafe-eval'` y workers `blob:`. **Decisión: Draco aceptado**; el
impacto de los workers se mide en T7. Quitar Draco o reducir texturas y
primitivas exigiría una transformación (gltf-transform u otra herramienta) y
dependencias nuevas, que T0 no autoriza. Por eso se registran los originales
tal cual. El campo `budget` del manifiesto deja constancia de cada exceso para
que T2 (`validateSatelliteModelAsset`) decida, sin ocultarlo.

## Sin verificar en T0

- El descarte de `3D Models/Galileo/Galileo.glb` (sonda a Júpiter, no el GNSS):
  no se descargó ni se inspeccionó.
- La carga real en Cesium (decodificación Draco, EXT_texture_webp, iluminación):
  queda para T4/T7 contra el servidor 4204.
- El signo de la marcha de la ISS: queda para T3/T5.

## Cómo re-verificar

```sh
# 1. Hash y tamaño de las copias publicadas
sha256sum public/models/satellites/*.glb

# 2. Original en la revisión fijada (mismo SHA esperado)
curl -sL "<sourceUrl del manifest>" | sha256sum

# 3. Mediciones y escala
node scripts/eyeinsky-glb-inspect.mjs --real-length-m=109 public/models/satellites/iss-70d0619a.glb
node scripts/eyeinsky-glb-inspect.mjs --real-length-m=13.2 public/models/satellites/hubble-e5ba4de1.glb
node scripts/eyeinsky-glb-inspect.mjs public/models/satellites/cubesat-1u-bae308ea.glb

# 4. Servido por el Vite vivo
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4204/models/satellites/manifest.json
```

Evidencia de esta sesión (no versionada): `output/eyeinsky-p4/t0/inspect-*.json`.

## Sources

Cada referencia enlaza con su entrada de
`docs/eyeinsky/planning/sources-ledger.json` (campo `id`):

| Ref. | `sources-ledger.json` | URL                                                                                     |
| ---- | --------------------- | --------------------------------------------------------------------------------------- |
| [1]  | `id: 12`              | https://github.com/nasa/NASA-3D-Resources/tree/11ebb4ee043715aefbba6aeec8a61746fad67fa7 |
| [2]  | `id: 8`               | https://www.nasa.gov/nasa-brand-center/images-and-media/                                |
| [3]  | `id: 13`              | https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=json                   |
| [4]  | `id: 14`              | https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json                    |
| [5]  | `id: 15`              | https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json                  |

[2] son las guías de uso de NASA, ya registradas el 2026-09-18 como `id: 8`
(sin barra final); no tienen entrada nueva. [5] (grupo `stations`) se usa en
`T0-FINDINGS.md` §(d) para situar la ISS y descartar el HST en ese grupo.
