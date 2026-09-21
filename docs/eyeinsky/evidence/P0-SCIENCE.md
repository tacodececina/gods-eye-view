# P0-05 · spike científico acotado

Ejecución reproducible:

```powershell
node scripts/eyeinsky-p0-science.mjs C:/Users/Alex/orca/gods-eye-view/output/eyeinsky-immersive/p012/continuation/p0-science
```

La primera captura pública se realizó con `--refresh`; las ejecuciones posteriores usan los fixtures crudos conservados en esta carpeta. `public-retrieval.json` registra fecha, URL y HTTP real. No se integró Luna, un renderer nuevo, SPICE ni datos masivos al producto.

## Luna y escalas temporales

La referencia independiente es NASA/JPL Horizons: cuerpo `301` (Moon), centro `500@399` (geocentro terrestre), ejes ecuatoriales ICRF, vectores geométricos (`VEC_CORR=NONE`), entrada UTC y salida km/km·s⁻¹. Se consultaron tres épocas fijas entre 2026-09-18T00:00Z y 2026-09-21T00:00Z. La respuesta original está en `horizons-response.json` y la URL exacta queda en `science-result.json`.

La implementación candidata fue `Cesium.Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame`, cuya salida en metros se convirtió explícitamente a km. La tolerancia de posición de **100 km** se declaró en el verificador antes de recuperar la referencia. Los errores obtenidos fueron 243.770 km, 52.608 km y 214.374 km. Por tanto, el candidato queda **rechazado** para el rango declarado; no se amplió la tolerancia y no se presenta como función lunar implementada.

Para cada época se registra UTC→TAI con la tabla de segundos intercalares de Cesium, `TT−TAI = 32.184 s`, y TT→TDB con la aproximación periódica documentada por SPICE/Cesium. `science-result.json` conserva JD UTC, JD TAI, JD TT, `TDB−TT` y JD TDB. El ensayo caduca si cambia la versión/modelo o se amplía el intervalo.

Fuentes primarias:

- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- JPL Horizons manual: https://ssd.jpl.nasa.gov/horizons/manual.html
- NAIF SPICE time: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/time.html
- IAU SOFA time scales: https://www.iausofa.org/2023_1011_C/sofa/sofa_ts_c.pdf

## OMM, TLE y SGP4

La referencia independiente es el caso `00005` de Vallado et al., AIAA 2006-6753 Rev. 3, apéndices D/E, con vectores TEME WGS-72/AFSPC a 0, 360 y 720 minutos. El mismo conjunto físico se ingresa por dos rutas distintas: `twoline2satrec` para TLE y `json2satrec` para OMM. El máximo error de posición fue `6.82e-9 km`; los errores completos de posición, velocidad y round-trip km↔m están en `science-result.json`. Las tolerancias declaradas fueron 0.02 km, 0.00002 km/s y `1e-12 km` para redondeo numérico de unidades.

El objeto público de seis dígitos `100719` se recuperó de CelesTrak en OMM/JSON y `satellite.js` conservó exactamente `100719`. El endpoint TLE respondió HTTP 404 (`No GP data found`), por lo que el verificador rechaza fabricar o truncar columnas TLE y documenta OMM como la ruta válida.

Fuentes primarias:

- Vallado SGP4 Rev. 3: https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753-Rev3.pdf
- CelesTrak GP data formats: https://celestrak.org/NORAD/documentation/gp-data-formats.php

El resultado valida el contrato de unidades, marcos, rutas de parser y precisión del algoritmo frente a vectores publicados. No demuestra precisión orbital real futura ni una función lunar P5.
