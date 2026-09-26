# Fase visual «Editorial Clean» — Ledger de activos y datos (T1–T2)

Registro de KRÓNOS del 2026-09-25 (UTC). Cada activo nuevo lleva fuente,
licencia, procedencia y SHA-256. Las filas de máquina están en
`docs/eyeinsky/planning/asset-manifest.json` y `sources-ledger.json` (ids
24–31); la atribución pública, en `DATA_SOURCES.md` y en `DATA_CREDITS`
(`src/data/dataCredits.js`).

## 1. Fuentes tipográficas (`public/identity/fonts/`)

Descargadas del repositorio `google/fonts` en la revisión fijada
`0b58fb370093f9a9f4ff785d94405710b79de67c` (la última que toca ambas carpetas
al 2026-09-25). Se sirven en local con `font-display: swap` y alternativa
`'Times New Roman', serif` / `ui-monospace`; sin CDN.

| Archivo                       | Bytes   | SHA-256                                                            | Licencia |
| ----------------------------- | ------- | ------------------------------------------------------------------ | -------- |
| `InstrumentSerif-Regular.ttf` | 70 012  | `498efd461f6ddfcb7a111bf9a565709d2085d48201d501ead960d93e84ffbb88` | OFL 1.1  |
| `InstrumentSerif-Italic.ttf`  | 71 592  | `08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385` | OFL 1.1  |
| `instrumentserif-OFL.txt`     | 4 405   | `129ed7618959716959f2941fdd5b49e0ad6e6c1d78726761786a00253d865521` | —        |
| `IBMPlexMono-Medium.ttf`      | 136 704 | `a9b4c49bb299e05b5f6c481e7fb5e78943d2793249a0c8874ab574a2d1ea6755` | OFL 1.1  |

- Instrument Serif: © 2022 The Instrument Serif Project Authors
  (https://github.com/Instrument/instrument-serif).
- IBM Plex Mono Medium: © IBM Corp. Su OFL es el mismo texto que el ya
  versionado `ibmplexmono-OFL.txt` (difieren solo en un espacio final), y el
  `IBMPlexMono-Regular.ttf` del repo es byte-idéntico al de esta revisión
  (`6a3412f0…af46`): misma procedencia.
- Space Grotesk ya estaba en el repo (sin cambios).
- Desvío respecto al encargo: el encargo decía `public/fonts/`; se usa
  `public/identity/fonts/`, donde ya viven Space Grotesk y Plex Regular
  (plan §3 y sistema de diseño §3).

## 2. Cielo sobrio (`public/sky/{px,nx,py,ny,pz,nz}.png`) — decisión D4

**Catálogo:** Yale Bright Star Catalogue, 5.ª ed. revisada (versión
preliminar), Hoffleit D. & Warren Jr W.H., Astronomical Data Center,
NSSDC/ADC (1991). Archivo `https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz`,
573 921 B, SHA-256
`3dc44b1e90be8fbe5bcc7656032560f51275f985c7e3f783c9028e1838ec7bed`, 9 110
filas (9 096 con posición y Vmag). No se versiona: el generador lo exige por
hash (`CATALOG_SHA256`).

**Licencia verificada (límite honesto):** ni el ReadMe de CDS V/50, ni la
página de HEASARC (BSC5P), ni la del SAO TDC declaran licencia. Es una
compilación de datos factuales (posiciones y magnitudes) preparada por el
NSSDC/ADC de NASA y redistribuida libremente por NASA HEASARC, CDS y el SAO. Se
atribuye siempre («Star field: Yale Bright Star Catalogue…», `DATA_CREDITS`
`sky-bsc5`) y **no se afirma dominio público explícito**. HYG quedó descartado
por CC BY-SA 4.0: su ShareAlike alcanzaría a las caras generadas.

**Generación:** `node scripts/eyeinsky-skybox.mjs --catalog catalog.gz --out
public/sky` (determinista; tests en `scripts/eyeinsky-skybox.test.mjs`).

- Estrellas con Vmag ≤ 5,0: **1 630**. Posición J2000 precesada (IAU 1976) a
  la época 2026,0, porque el SkyBox de Cesium usa ejes TEME de la fecha y la
  precesión 2000→2026 son ~0,36° (≈ 4 px de cara). Sin nutación (< 20″) ni
  movimiento propio (< 0,03°).
- Caras de 1 024 px en gris de 8 bits, convención GL del cubo con `flipY`
  (Cesium `loadCubeMap`).
- Brillo comprimido `0,45 · 10^(−0,2·(V + 1,46))`: pico de luminancia relativa
  0,45 (Sirio, gris 178) y huella bilineal ≤ 2×2 px.
- SHA-256 de los píxeles (6 caras concatenadas):
  `b14cfb6b9a5fcee61c7de0a4e0bdb491e6895b9f0a9f92784bf8b41fee3cc8da`.

| Cara     | Bytes | SHA-256 del PNG                                                    |
| -------- | ----- | ------------------------------------------------------------------ |
| `px.png` | 2 729 | `86e19112fc1e092d084ee9df02e4956a92c5c6b3b37879f29b9712a9af7d6636` |
| `nx.png` | 2 732 | `8d706e54efd2495baff63c9fa9e9ddd689d0bc8a6bb674c8ee36f7e6feaa5468` |
| `py.png` | 3 919 | `9ac5567e85278265c1ebefcda7cd6e2d0975a26fb7ae480c4b0147dcb25c6d83` |
| `ny.png` | 3 645 | `650c510c25b7de853897d177d13f8c9434da156b645b6cfc179c0a1a2cd7ceae` |
| `pz.png` | 3 318 | `07200853b5b9b576683e7ac635c83520040b53600bee7569d9f964ad16df4e29` |
| `nz.png` | 4 003 | `c1807a4e80cfec8d62e3bb166f5e7407fcf0674d2e57f110c5c7125dde2a828c` |

Total 20 346 B (presupuesto 1,5 MB). El hash del PNG depende de la zlib de
Node; el de los píxeles es el invariante que comprueba el test.

## 3. Luces nocturnas NASA GIBS (en ejecución, no versionadas)

- **Capa fijada con GetCapabilities** (EPSG:3857, `best`, consultado el
  2026-09-25): `VIIRS_CityLights_2012` — «Earth at Night (2012, VIIRS, Suomi
  NPP)», `image/jpeg`, `GoogleMapsCompatible_Level8`, sin dimensión temporal.
  Año verificado: **2012**. Alternativa descartada: `VIIRS_Black_Marble` (PNG,
  años 2012 y 2016): ~36–53 KB por tesela frente a ~7 KB, y luces menos
  legibles en la comparación a z3 (`output/eyeinsky-vis/t2/gibs/*-mosaic.png`).
- **Condiciones:** `Fees none`, `AccessConstraints none`; GIBS pide el
  agradecimiento a ESDIS, que figura en `DATA_SOURCES.md` y en `DATA_CREDITS`
  (`gibs-night`). En la línea de créditos, mientras se ven sus teselas:
  «Luces nocturnas: NASA GIBS · VIIRS 2012 (compuesto, no en vivo)».
- **Proxy propio** `GET /api/gibs/night/{z}/{y}/{x}.jpg`
  (`server/providers/space/gibs.js`): una sola capa y matriz en lista blanca,
  0 ≤ z ≤ 8, enteros canónicos en rango; caché LRU por proceso (512 teselas)
  y en disco (`.gev-cache/gibs-night/`, TTL 30 días), single-flight por
  `z/y/x`, stale ante fallo o 502 honesto, `Cache-Control: public,
max-age=604800`, sin cabeceras del origen, cuerpo validado como JPEG y
  limitado a 2 MB. Montado por `localProviderPlugins()`, que usan Vite y el
  runtime de producción (`server/production-runtime.js`). CSP sin cambios
  (`'self'`).
- **Coste medido en Global** (1600×900, pose solar): 52 peticiones de teselas
  z1–z3 en la primera carga (el objetivo del plan era < 40: **no cumplido**,
  queda como límite para T6).
