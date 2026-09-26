# Propuesta P6: Luna explorable (borrador 2026-09-26)

> Borrador redactado por KRÓNOS a mano (sin panel de diseño ni investigación con subagentes, por el límite semanal de la cuenta hasta el 1 de octubre). Antes de ejecutar: panel de tres propuestas, jueces y validación numérica de fuentes, como en P4 y P5. Base: `main` `ae1760b` (P0–P5 + fase visual Editorial en producción).

## 1. Decisión recomendada (a validar)

1. **La Luna se explora en la misma escena de Cesium, cambiando el globo**: al entrar en modo Luna, `scene.globe` pasa a un `Globe(Ellipsoid.MOON)` con imagen y terreno lunares, y al volver se restaura el globo terrestre. Nunca se toca `Ellipsoid.default` (lección de P0-04). Alternativa a evaluar en el panel: un segundo `Viewer` en un canvas aparte (más memoria, aislamiento total).
2. **Superficie**: mosaico global **LROC WAC** (USGS Astrogeology, dominio público, 100 m/px nativo) reducido y teselado por nosotros a niveles 0–7 (≈ 1,2 km/px en el nivel 7) servido desde el VPS o CDN propio; resolución y cobertura declaradas en pantalla.
3. **Relieve**: **LOLA LDEM** (64 ppd ≈ 474 m/px) convertido a teselas de terreno Cesium (heightmap o quantized‑mesh) con exageración vertical explícita y rotulada; el terreno es lo que permite "explorar" y no una esfera decorativa.
4. **Iluminación**: Sol de escena (reloj único de P5) sin atmósfera terrestre; terminador y sombras largas reales; sin luces de ciudad ni cielo terrestre.
5. **Coordenadas**: selenográficas en el marco medio de la Tierra (ME) con datum declarado; picking sobre el terreno; puntos de interés con fuente (IAU Gazetteer of Planetary Nomenclature, sitios Apollo/Luna/Chang'e con coordenadas publicadas).
6. **Retorno a Tierra** restaurando cámara, capas, selección, seguimiento y reloj, sin listeners, primitivas ni texturas huérfanas (20 ciclos medidos como en P5).

## 2. Fuentes candidatas (verificar licencia, tamaño y datum en T0)

| Dato                 | Fuente                                                                     | Resolución                 | Notas                                                                |
| -------------------- | -------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Mosaico color/albedo | LROC WAC Global Morphologic Mosaic (USGS Astrogeology)                     | 100 m/px (equirectangular) | Dominio público; el original pesa GB: se reduce a 16k×8k y se tesela |
| Relieve              | LOLA LDEM (GSFC/PDS) 64 ppd o 16 ppd                                       | 474 m / 1,9 km por px      | Dominio público; convertir a metros sobre esfera de 1737,4 km        |
| Sombreado            | LOLA hillshade o cálculo propio desde el DEM                               | —                          | Solo si el terreno real no basta en la GPD                           |
| Nomenclatura         | IAU Gazetteer of Planetary Nomenclature                                    | —                          | Dominio público; cráteres, mares, montes                             |
| Sitios               | Apollo 11–17, Luna, Chang'e, Artemis (coordenadas publicadas por NASA/JPL) | —                          | Con fuente y fecha                                                   |

## 3. Escena y cámara

- Entrada: desde SISTEMA TIERRA–LUNA (P5) o desde el panel de la Luna, acción **EXPLORAR LA LUNA** con vuelo de la cámara hasta órbita lunar (2.000 km) y cambio de globo al llegar; salida con **VOLVER A TIERRA** (P5) ampliada.
- Cara lejana, polos y antimeridiano navegables; límites de cámara (mínimo 2 km sobre el terreno, colisión contra relieve).
- LOD: teselas por distancia; presupuesto de memoria de texturas medido en la GPD; `low` en móvil (niveles 0–5).
- Estado en `body[data-eye-body="earth|moon"]` para la interfaz, arneses y estilos.

## 4. Interfaz (continuidad con la fase visual)

- Titular de entrada «La Luna, ahora.» con kicker y línea honesta (mosaico WAC 2011–2013, no en vivo).
- Panel contextual Luna: coordenadas selenográficas del punto elegido, elevación LOLA, nombre IAU si lo hay, fuente y resolución del mosaico bajo la cámara.
- Telemetría del pie: coordenadas selenográficas, altura sobre el datum lunar, rumbo; mapa «LROC WAC · LOLA».
- Capas terrestres suspendidas con aviso mientras se explora la Luna; el reloj sigue siendo el mismo.
- Móvil: misma hoja única; sin cambios de contrato.

## 5. Plan de tareas (estimación 8–10 jornadas)

| #   | Tarea                                                                                                                                                                                                                                                 | Jornadas |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T0  | Investigación y curación: descargar WAC reducido y LDEM, verificar licencias, datum y tamaños; generador de teselas de imagen y de terreno reproducible con hashes y ledger; spike de `scene.globe` intercambiable vs segundo Viewer medido en la GPD | 2        |
| T1  | Arnés `eyeinsky-p6.mjs` en RED (entrar/salir, cara lejana, polos, antimeridiano, picking, coordenadas, retorno sin restos)                                                                                                                            | 0,5      |
| T2  | Servicio de teselas (proxy con caché y presupuesto) y ledger de fuentes                                                                                                                                                                               | 1        |
| T3  | Globo lunar: imagen + terreno, iluminación, límites de cámara y colisión                                                                                                                                                                              | 2        |
| T4  | Coordenadas selenográficas, picking, POIs y panel Luna                                                                                                                                                                                                | 1,5      |
| T5  | Entrada/salida (EXPLORAR LA LUNA / VOLVER A TIERRA), suspensión de capas, titular, telemetría, móvil                                                                                                                                                  | 1,5      |
| T6  | Regresión completa, rendimiento en la GPD y teléfono físico si hay, cierre documental y release                                                                                                                                                       | 1        |

## 6. Matriz de aceptación (P6-01…)

- P6-01 mosaico y relieve reales con resolución, cobertura y datum declarados en pantalla.
- P6-02 cara lejana, polos y antimeridiano navegables sin costuras visibles ni saltos.
- P6-03 picking devuelve coordenadas selenográficas y elevación coherentes con LOLA (±1 px de tesela).
- P6-04 iluminación desde el Sol de escena; terminador coherente con la fase P5 (±1°).
- P6-05 colisión/altura mínima sobre el relieve; sin atravesar la superficie.
- P6-06 POIs con fuente; nomenclatura IAU.
- P6-07 retorno a Tierra restaura cámara, capas, selección, seguimiento y reloj; 20 ciclos sin fugas.
- P6-08 `Ellipsoid.default` y WGS84 intactos; P0–P5 y fase visual en verde.
- P6-09 rendimiento comparable en la GPD (método perf‑repeat); presupuesto de texturas declarado; móvil en perfil low.
- P6-10 pérdida de red: la Luna ya cargada sigue navegable; sin red no se promete más resolución.

## 7. Riesgos y qué NO haremos

- Generar terreno global a 64 ppd puede superar el ancho de banda y el disco del VPS: se fija un presupuesto (p. ej. ≤ 300 MB de teselas) y se declara la resolución resultante.
- `scene.globe` intercambiable puede dejar estado terrestre (imagery, terrain provider, listeners): el spike de T0 lo mide antes de decidir.
- No haremos: aterrizaje ni vista a ras de suelo con detalle métrico, modelos 3D de bases, datos "en vivo" lunares, ni superficie sin relieve presentada como exploración.
