# P3 — Activos de Tierra

Curación de KRÓNOS para uso factual/editorial dentro del expediente «Vista · Tierra». No material promocional, patrocinio NASA, mercancía, logotipos ni licencia comercial universal. NASA permite uso factual sin implicar respaldo, exige reconocer la fuente y advierte que los contenidos de terceros no heredan permiso. En uso comercial editorial se conservan esas restricciones.[1]

## Activos admitidos para este contexto

- `earth-apollo17`: fotografía terrestre tomada por la tripulación Apollo 17. La página específica acredita NASA; la procedencia es la página del activo, no una búsqueda genérica.[2]
  - Archivo: `public/eyeinsky/media/p3/earth-apollo17.webp`
  - Dimensiones: 1041 × 1042; 165418 bytes.
  - SHA-256: `c826b987a985c0fe599848b47cf08527cdd875b0943b40c38736d6975fb87202`
  - Crédito visible: NASA. Autor descriptivo: NASA / tripulación de Apollo 17.
- `earth-apollo8`: fotografía Earthrise tomada desde Apollo 8 por Bill Anders. La página específica acredita NASA.[3]
  - Archivo: `public/eyeinsky/media/p3/earth-apollo8.webp`
  - Dimensiones: 1041 × 1000; 43338 bytes.
  - SHA-256: `62ff2a4f58525ad6a61f2865854cebf63c661823d1502d58824cb1fc8f13d098`
  - Crédito visible: NASA / Bill Anders.

Ambos son fotografías de archivo y su fidelidad es contextual. Asociación admitida únicamente a `earth:view`; no asociar a aeronaves, contactos, streams o datos en directo. La segunda imagen contiene la Tierra y el horizonte lunar; no demuestra implementación de P5/P6.

## Evidencia y transformación

Metadatos medidos, URLs de descarga, autor, términos, fecha UTC, originales SHA y derivados: `output/eyeinsky-p3/t0/assets/asset-manifest.json`.

Derivación reproducible: `output/eyeinsky-p3/t0/prepare-assets.mjs`. Conversión WebP calidad 80, resize inside hasta 1280px sin ampliar ni recortar; no IA generativa. Decodificación de ambos derivados y presupuestos ≤350KiB/1280px comprobados mediante sharp. Originales conservados en esa carpeta de evidencia. La fecha UTC 2026-09-20 corresponde todavía a la noche local del 19 en México.

Las tres páginas oficiales se extrajeron y revisaron en esta sesión. El permiso se documenta como NASA Media Usage Guidelines, NO se etiqueta CC0 ni «dominio público universal». Las páginas específicas no muestran crédito de tercero para estos dos activos. Si se cambia su uso a publicidad, producto promocional o mercancía, hace falta una nueva revisión de alcance.[1]

No existe autorización de publicación de EYEINSKY derivada de esta curación. La aceptación visual de la UI sigue pendiente.

## Sources

[1] https://www.nasa.gov/nasa-brand-center/images-and-media
[2] https://www.nasa.gov/image-article/blue-marble-image-of-earth-from-apollo-17
[3] https://www.nasa.gov/image-article/apollo-8-earthrise
