# P5 — Ledger de activos y datos (T2–T9)

Registro de KRÓNOS del 2026-09-25 (UTC) para P5 (Tierra–Luna). Cubre la tabla
lunar, sus fixtures de tests, la dependencia de respaldo, el placeholder y la
textura LROC de NASA SVS (§6, licencia verificada en T9).

## 1. Tabla lunar `public/data/moon-de441-2021-2040.bin`

**Atribución:** «NASA/JPL Horizons, DE441».

**Derechos:** la documentación de la API
(`https://ssd-api.jpl.nasa.gov/doc/horizons.html`) y el manual de Horizons
(`https://ssd.jpl.nasa.gov/horizons/manual.html`), consultados el 2026-09-24,
no traen texto de licencia ni condiciones de uso explícitas. **Dominio público
sin verificar**: se atribuye siempre y no se afirma más. Efemérides: Park et
al. 2021, _AJ_ 161:105 (DE440/DE441).

**Consulta** (API pública, sin clave), del 2026-09-25T05:45:26Z al
2026-09-25T05:51:09Z. Parámetros literales comunes:

```text
COMMAND='301' CENTER='500@399' EPHEM_TYPE='VECTORS' MAKE_EPHEM='YES' OBJ_DATA='NO'
REF_SYSTEM='ICRF' REF_PLANE='FRAME' VEC_CORR='NONE' VEC_TABLE='2'
OUT_UNITS='KM-S' CSV_FORMAT='YES' VEC_LABELS='NO' TIME_TYPE='TDB'
```

- `REF_PLANE='FRAME'` no estaba en la orden, pero hace falta. Sin él, Horizons
  entrega el plano eclíptico en lugar del ecuador ICRF. Es el mismo valor que
  usó la investigación (`eval.mjs`).
- Rejilla: `STEP_SIZE='30 m'` de 2021-01-01 00:00 a 2041-01-08 00:00 TDB, en 57
  tramos de 128 d. Salen 350 977 vectores.
- Fronteras y perigeos: `TLIST_TYPE='JD'` con `TIME_DIGITS='FRACSEC'`, en lotes
  de 40 JD. Con 100 JD por petición (URL de unos 2,6 KB), Horizons devuelve 502.
- Las cabeceras de cada respuesta se comprueban: Moon (301) y Earth (399)
  `{source: DE441}`, `GEOMETRIC cartesian states`, `KM-S`, `ICRF` y la escala
  de tiempo.

**Respuestas crudas:** son 114 archivos y 69 417 900 B. Están en
`output/eyeinsky-p5/t2/horizons/` (no versionado). Su `index.json` guarda la
URL literal, el sha256, los bytes y `fetchedAt` de cada una
(`index.json` sha256 `b1ef6f60…f0e1` en el momento del registro).

**Transformación** (`scripts/eyeinsky-moon-ephemeris.mjs`, offline, fuera de
CI):

1. Ajuste Chebyshev por mínimos cuadrados, orden 10, en segmentos de 8 d. Entran
   solo las horas en punto: 175 489 muestras, 193 por segmento.
2. Coeficientes en float32 little-endian.
3. Cabecera `EYMOON1` de 144 B, descrita en `src/layers/moon/ephemerisFormat.js`.
   Lleva la versión 1, `DE441`, t0 y t1, el segmento, el orden, el marco
   «ICRF geocéntrico», las unidades `km` y el sha256 de la carga.

| Campo                         | Valor                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Rango declarado (t0..t1)      | 2021-01-01T00:00 .. 2041-01-01T00:00 TDB (662 731 200 .. 1 293 883 200 s TDB desde J2000) |
| Segmentos                     | 914 (el último cubre hasta 2041-01-08; se valida, pero no se declara)                     |
| Tamaño                        | 120 792 B (144 de cabecera + 120 648 de carga)                                            |
| sha256 del archivo            | `3e7c488061cd56dcb3412deea41b2716a023c945a89076b62c8116b9a86db96d`                        |
| sha256 de la carga (cabecera) | `50717049d51bd1c8b9d579f7d7877389d8a5d32b6b5d100e8f56217059e0c656`                        |

**Validación con muestras NO usadas en el ajuste.** Gate: ≤ 1 km y ≤ 0,01′.
Resumen completo en `output/eyeinsky-p5/t2/summary.json`.

| Conjunto                                 | Muestras | Máx. km | RMS km | Máx. ′   |
| ---------------------------------------- | -------- | ------- | ------ | -------- |
| Medias horas, 2021–2041-01-08            | 175 488  | 0,0292  | 0,0097 | 0,000246 |
| Fronteras de segmento ±60 s (913)        | 1 826    | 0,0350  | 0,0134 | 0,000276 |
| Perigeos (todos, 2021-01-09..2040-12-06) | 265      | 0,0196  | 0,0090 | 0,000154 |

- El mayor salto entre segmentos contiguos en su frontera es de 0,043 km.
- El peor año es 2030, con 0,0292 km de máximo. La tabla por año está en
  `summary.json` (`halfHours.perYear`).

**Hashes del generador** en la corrida que produjo el `.bin` registrado, ya
pasado por Prettier. Son los de `summary.json` → `generator`; el sha256 de
`summary.json` es `f684768e…526b`.

| Archivo                                 | sha256                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| `scripts/eyeinsky-moon-ephemeris.mjs`   | `590c25617bc517b357a31395527a13e7f26cd3fbd40fc9913581d0360082b158` |
| `scripts/lib/eyeinsky-moon-table.mjs`   | `dca0ebc16f52cc775ac139c2b6eae74b5676e42ea1a85607c3b8ed2983718550` |
| `scripts/lib/eyeinsky-horizons.mjs`     | `5f4489972b73085e08e311219c5ecfa3f2f6068244b8086684bb18cc3563aa83` |
| `scripts/lib/eyeinsky-moon-fixture.mjs` | `028e3ff080d238af752659b69c48dd81951984597ec6b2b88bffc00d8e70c487` |
| `src/layers/moon/ephemerisFormat.js`    | `e8e248feff050893e7266564233f65c0851c9563275c993f20933842cf43f35a` |

La salida es determinista: cinco corridas sobre la misma caché dieron el mismo
sha256 del `.bin`.

## 2. Fixture de tests `src/data/fixtures/moon-horizons-icrf.json`

Rotulado como FIXTURE: no son datos en vivo. Tiene 23 928 B y su sha256 es
`4de038233a4a33216cc82160da2545209ce683d63f7f03cfed2aeca79795b533`.

- `icrfTdb`: 40 vectores ICRF en medias horas TDB de 2021 a 2040 que no
  entraron en el ajuste. Guarda el sha256 del tramo crudo de cada uno.
- `icrfUt`: 10 vectores ICRF con `TIME_TYPE='UT'` (TLIST de JD UT). Son las
  épocas UTC de 2021 a 2040, incluida 2026-09-25 18:45.
- `subMoonItrf`: 10 puntos sublunares ITRF93 en esas mismas épocas. Se piden
  con `COMMAND='399'`, `CENTER='500@301'`, `EPHEM_TYPE='OBSERVER'`,
  `QUANTITIES='14,20'` y `ANG_FORMAT='DEG'`, y se añade la velocidad
  baricéntrica de la Tierra (`COMMAND='399'`, `CENTER='500@0'`, ICRF, UT).
  - Horizons no da vectores en el marco fijo terrestre. El equivalente
    verificable es el punto sublunar.
  - Modelo verificado el 2026-09-25: tiempo de luz sin aberración. La dirección
    es `R_ICRF→ITRF(t−τ)·(r_Luna(t) + v_Tierra·τ)`.
  - Residuo con Cesium XYS: ≤ 2,3″ y solo en longitud, que es UT1−UTC porque
    Cesium no tiene EOP. La latitud da 0,00″.

## 3. Dependencia de respaldo `astronomy-engine` 2.1.19

Autorizada por Alex el 2026-09-25 como respaldo fuera de rango (opción b).

- Licencia **MIT**, © 2019-2023 Don Cross. El texto completo viene en la
  cabecera de `node_modules/astronomy-engine/esm/astronomy.js`. Repositorio:
  `https://github.com/cosinekitty/astronomy`.
- Integridad npm:
  `sha512-8yWKNf7UeNbH458h3sAJ6ZgAjE5jTXp/mNNRFoC20j2SHwZIjAQeEsBB2Q3uCFRaTCCJRv33K2XhkhZQMXoX6w==`.
- Uso: `GeoMoon`, en el marco EQJ, que es ≈ ICRF con un sesgo menor de 0,03″.
- ΔT = 32,184 s + (TAI−UTC) de `JulianDate.leapSeconds`, con UT1≈UTC. No se usa
  un valor fijo.
- Error medido: frente al fixture (50 épocas), máximo 13,89 km; barrido denso
  contra la tabla DE441 (≤0,03 km de Horizons) cada 30 min en 2021–2040
  (350 641 muestras), máximo **16,07 km** (2040-07-30T23:30Z), con un 1,8 % de
  muestras por encima de 14 km; 74 épocas Horizons 1975–2100, máximo 13,13 km.
  El rótulo previo «≤14 km» (propuesta §2) era falso y se sube.
- Tolerancia pública: «modelo analítico **≤20 km**» (`FALLBACK_TOLERANCE_KM`).
  `ephemerisFallback.test.mjs` barre respaldo contra tabla cada 6 h en
  2021–2040 y exige que el máximo quede por debajo; si otra época lo supera, se
  sube el rótulo, no se oculta.

## 4. Fixture de fase y orientación `src/data/fixtures/moon-horizons-phase.json` (T5)

Rotulado como FIXTURE: no son datos en vivo. Tiene 3 431 B y su sha256 es
`be6fbd39fad64af5218d8752f2bd4756c7ef251da509bafd6b2a0bcd9918012a`.

- **Consulta** (API pública, sin clave), 2026-09-25T06:39:34Z, generada por
  `scripts/eyeinsky-moon-phase-fixture.mjs` (offline, fuera de CI). Parámetros
  literales:

  ```text
  COMMAND='301' CENTER='500@399' EPHEM_TYPE='OBSERVER' QUANTITIES='10,13,14'
  ANG_FORMAT='DEG' CSV_FORMAT='YES' TIME_TYPE='UT' TIME_DIGITS='FRACSEC'
  EXTRA_PREC='YES' TLIST_TYPE='JD' OBJ_DATA='NO' MAKE_EPHEM='YES'
  ```

  Las 10 épocas UT son las de `FIXTURE_UTC_EPOCHS` (las mismas del fixture
  ICRF). La cabecera se comprueba: Moon (301) `{source: DE441}`,
  `Target pole/equ: MOON_ME {East-longitude positive}`, radio 1737,4 km.

- **Respuesta cruda:** `output/eyeinsky-p5/t5/horizons/fixture_phase_me.txt`
  (no versionado), sha256
  `e8dd21abbe30ebf9440ac75cea3e2f03d52ee276ef6e1cf19d78e8241442c284`; URL
  literal en `output/eyeinsky-p5/t5/horizons/index.json`.
- **Uso:** Illu% (fase ±1 %), Ang-diam (diámetro aparente) y el punto
  sub-Tierra en MOON_ME (orientación ≤ 1°) en `lunarPhase.test.mjs`,
  `pose.test.mjs` y `celestialState.test.mjs`.
- **Medido** (`output/eyeinsky-p5/t5/phase-check.json`,
  `orientation-check.json`): fase máx. 0,0055 puntos porcentuales; diámetro
  máx. 1,0e-4 relativo; orientación IAU (Cesium `IauOrientationAxes`) frente a
  MOON_ME máx. 0,0091°.
- Generador: `scripts/eyeinsky-moon-phase-fixture.mjs` sha256
  `5047c6c856119d4ff01fc72b5741c430e468c5afa1616e40455de0682b59764d` (ya pasado por Prettier; la salida no depende del formato).

## 5. Textura placeholder `public/models/moon/placeholder.png` (T6)

- **Qué es:** un mapa equirectangular GRIS de 512×256 generado por código, sin
  fuente externa (obra propia). Lleva retícula cada 30°, meridiano 0° al centro
  (s = 0,5), ecuador y los rótulos «PLACEHOLDER SIN TEXTURA», «0», «90E»,
  «90W» y «180» para comprobar la orientación. **No es una imagen de la Luna.**
- **Generador:** `scripts/eyeinsky-moon-placeholder.mjs`, determinista (PNG gris
  de 8 bits, sin metadatos, zlib nivel 9). `scripts/eyeinsky-moon-placeholder.test.mjs`
  regenera los bytes y exige el mismo sha256 que el archivo versionado.
- sha256 del generador (con Prettier): `feb5e27cc85cd584af2ca06bcafc19eb6004b3710ff0dbc4b36f67a1100d2827`.
- **Archivo:** 1 106 B, sha256
  `e6e67b38d3a529d19437427b2d84703ab68b860490aca839463d8b68ebfe9235`.
- **Licencia:** la del repositorio (MIT); no hay terceros.
- Sigue siendo el respaldo: la Luna nace con él y se queda con él si la
  textura LROC no carga (§6).

## 6. Textura LROC `public/models/moon/lroc-color-{1k,2k}-*.jpg` (T9)

- **Fuente:** NASA Scientific Visualization Studio, «CGI Moon Kit», ID 4720
  (<https://svs.gsfc.nasa.gov/4720>), visualización de Ernie Wright (USRA),
  científico Noah Petro (NASA/GSFC). Datos: LROC WAC Color Mosaic (Hapke
  normalized, Arizona State University) y LOLA/LDAM (polos).
- **Licencia verificada (2026-09-25):** la FAQ del SVS
  (<https://svs.gsfc.nasa.gov/help/>) dice «All of our content is in the public
  domain (unless otherwise noted), meaning that it is free to download, use, and
  redistribute for whatever purposes you see fit». La página 4720 no anota
  ninguna excepción (sin música ni material con licencia) y pide «Please give
  credit for this item to: NASA's Scientific Visualization Studio». El uso sigue
  las pautas de medios de NASA (sin logotipos ni respaldo implícito). Texto
  guardado en `output/eyeinsky-p5/t9/svs-4720-usage.txt` (páginas
  `svs-4720.html`, sha256 `5d00ae99…ca255`, y `svs-help.html`, sha256
  `b1ae0f1e…0513e`; evidencia no versionada).
- **Archivos** (copias byte a byte, renombradas con su sha256 corto):

| Archivo                      | Original                                               | Tamaño    | Bytes   | sha256                                                             |
| ---------------------------- | ------------------------------------------------------ | --------- | ------- | ------------------------------------------------------------------ |
| `lroc-color-1k-b246064f.jpg` | `lroc_color_poles_1k.jpg` (mapa 2019, JPEG progresivo) | 1024×512  | 139 068 | `b246064f217f8d479df78c49c7c8595a8f5fbda008a72fd539978d2e121e0109` |
| `lroc-color-2k-f7130a18.jpg` | `lroc_color_2k.jpg` (mapa 2025, JPEG con EXIF de IDL)  | 2048×1024 | 457 942 | `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170` |

- **Comprobaciones** (`output/eyeinsky-p5/t9/texture-check.mjs` →
  `texture-check.json`, decodificando en Chrome):
  - **Huecos polares:** ninguno. En las filas de ±80–89° la fracción de píxeles
    negros (luminancia < 8) es 0 en ambas: el SVS rellena lo que LROC no ve
    (fuera de ±70°) con el albedo LDAM de LOLA.
  - **Desfase s = 0:** los dos mapas están centrados en 0° de longitud (lo dice
    la página y se mide). Mare Crisium (17°N 59°E) sale oscuro en su sitio
    (luminancia 83 en 1k y 134 en 2k) frente a 17°N 121°O (175 y 207); Oceanus
    Procellarum (18°N 57°O) da 71 y 121 frente a 18°N 123°E (167 y 202). Encaja
    con `MOON_TEXTURE_FIX` de `pose.js` (s = 0 de EllipsoidGeometry en 180°).
  - **Aviso:** 1k y 2k salen de versiones distintas del mapa (2019 y 2025) y la
    2k es más clara, así que al subir de 1k a 2k cambia algo el tono. La página
    solo publica en JPEG la 1k de 2019 y la 2k de 2025; el resto son TIFF o EXR.
- **Uso en la app** (`src/layers/moon/textureBudget.js` y `texture.js`): la
  primitiva nace con el placeholder; la 1k se precarga y lo sustituye al llegar.
  La 2k solo se pide en escritorio (sin puntero grueso ni ≤ 760 px), sin
  `save-data` y con la Luna > 300 px en pantalla, una vez y sin volver a bajar.
  Nunca más de 2k (P6). Si no carga, se queda el placeholder, nunca una Luna
  blanca.
- **Crédito en la app:** mientras se ve la textura, el panel «Data attribution»
  muestra «Moon texture: NASA's Scientific Visualization Studio, CGI Moon Kit
  (LRO LROC WAC color mosaic, LOLA), public domain.» (`MOON_TEXTURE_CREDIT`).
- **Guarda:** `src/layers/moon/textureBudget.test.mjs` exige los bytes y el
  sha256 de los dos archivos publicados.
- **Medida del terminador:** con la textura, los mares desplazan el umbral de
  luminancia; el arnés mide el terminador con el albedo uniforme del placeholder
  (`debugTexture('placeholder')`) y vuelve a LROC después.
