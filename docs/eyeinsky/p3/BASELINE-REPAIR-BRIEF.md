# Corrección de supervisión: base incompleta, diagnóstico primero

Esta adenda de KRÓNOS corrige el dispatch local. Alex autorizó construir P3 («Inicia»); no autorizó omitir pruebas, publicar o cambiar de modelo. Se inicia al único constructor `claude-opus-5` para resolver el bloqueo T0 y después continuar el plan, NO se declara que la base pasó.

## Hechos medidos

- `output/eyeinsky-p3/t0/baseline-progress.json`: unit4204/4194pass/0fail/10skip, build, boundaries, formato y medición layout terminaron exit0. `backup-manifest.json` conserva la base exacta y hashes.
- `output/eyeinsky-p3/t0/p012/p012-journey.json`: estado error, espera30s de activación `local-datacenters` en el recorrido (`scripts/eyeinsky-p012.mjs:331`); ocho checks anteriores pasaron. El supervisor exterior agotó420s. No es una baseline aprobada.
- `output/eyeinsky-p3/t0/repro-layer/result.json`: `reproduced:true`, timeout15s, cero pageerrors. Estado `settled` muestra enabled=true DESPUÉS del timeout. La sonda volvió a pulsar y el evento capturado dice «Apagar», por lo que volvió a enabled=false. `stableLocatorWorked:false` no demuestra que el locator falle: el segundo clic apagó una capa ya encendida. El proceso devolvió0 porque su código sólo fallaba ante `fatal`; EXIT0 NO ES PASS DE ESTA SONDA.
- El primer recovery supervisor ni ejecutó tests: se detuvo por assert `reproduced is False`. Preservar todo. El directorio vacío retry-1 no contiene ejecución.
- No hay pruebas de causa transitoria concreta ni razón para culpar CPU/GPU/red. El click llegó al botón correcto; el estado pasó por disabled antes de completar enabled.

## Primer trabajo del constructor

1. Lee los informes completos, `output/eyeinsky-p3/t0/repro-layer.mjs`, manager/lifecycle/registry y módulo real de local-datacenters. Traza la activación; no adivines.
2. Instrumenta UNA reproducción acotada en `output/eyeinsky-p3/build/` con tiempos monotónicos, carga/init/request/visibility y eventos reales. No hagas segundo toggle por un timeout: vuelve a observar primero; identifica explícitamente ready, failed, pending/late. Exit0 sólo con aceptación funcional explícita. No amplíes silenciosamente umbrales ni cambies pruebas originales para verde.
3. Aísla la causa antes de editar. Si es producto, corrige lo mínimo con prueba RED→GREEN; estos archivos relacionados quedan permitidos adicionalmente a los paths P3 sólo si la causa está demostrada. Si es instrumentación, repara sólo tu harness y deja comparativa con la prueba original. Si falta un dato externo imprescindible, registra bloqueo preciso, no inventes datos.
4. Ejecuta las rutas de base pendientes USGS/selección y vuelo/cabina contra4198, sin repetir suites completas ya verdes sin necesidad. Puedes reusar geometrías ya medidas distinguiéndolas de verificaciones nuevas. No declares23/23 sin23IDs únicos respaldados.
5. Entrega `output/eyeinsky-p3/build/BASELINE-REPAIR.md` y `baseline-repair.json` con causa/evidencia/comandos/resultados/cambios y status `pass|blocked|fail`. No reescribas t0. Sólo después de resolver y verificar este bloqueo procede T1–T6 según diseño/plan/BUILD-BRIEF. Si no se resuelve con un diagnóstico y reparación acotados, reporta bloqueo sin bucle de retries.

## Alcance invariable

Worktree `C:/Users/Alex/orca/eyeinsky-p3-opus5`, rama eyeinsky/p3-opus5, preview4198. Un escritor, exacto Opus5 sin subagentes/fallback. Sin tocar4197, ea9e, main, credenciales, permisos globales, producción. Sin commit/push/deploy ni P4–P7. No relajar aceptación final. No cambiar cantidad de tests para maquillar estado. Modelos, artefactos y pruebas reales en HANDOFF/result.json.

La excepción cambia sólo el ORDEN: el constructor entra para REPARAR una baseline incompleta en vez de esperar que el supervisor la declare verde. No es excepción a los criterios de entrega. Lee esta adenda ANTES del dispatch histórico para resolver la contradicción de su requisito baseline-complete.
