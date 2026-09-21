# EYEINSKY · Ejecución autorizada P0–P2

Autor y supervisor: KRÓNOS / GPT-6-Astra. Constructor y auditor: GPT-5.6-Sol en contextos distintos. Estado: corte local P0–P2 verificado y disponible para prueba de Alex; sin aceptación estética automática ni publicación. Recap y límites: `output/eyeinsky-immersive/p012/ENTREGA.md`; evidencia final: `output/eyeinsky-immersive/p012/supervisor/focus-fix/green/verification.json`.

P0 cerró como spike/decisión: la aproximación lunar evaluada no cumple la tolerancia; usar y validar efemérides precisas antes de P5. Se mantiene separada la paridad global pendiente. Los requisitos originales siguientes se conservan como contrato, no se reescriben para esconder hallazgos históricos.

## Autorización y contrato

Alex autorizó iniciar P0–P2 del plan maestro de Universo y delegó el flujo de agentes. Su corrección vigente: conservar ventanas hacking/espías, globo protagonista, gráficos interactivos presentes, mucha mayor simplicidad y más comunicación visual. Los bocetos del PDF son aproximados y NO son una aprobación estética. No se repite la elección A/B/C.

Referencia: `docs/superpowers/plans/2026-09-18-eyeinsky-universo-plan-maestro.md`, P0–P2. Se conserva íntegro como documento de propuesta original; este archivo registra autorización y ejecución. No se autoriza P3–P7, publicación, compras, commit, push, reemplazar Cesium ni borrar trabajo previo. Este plan de ejecución complementa el PDF; no promete fechas a partir de jornadas teóricas.

Producto: `C:/Users/Alex/AppData/Roaming/orca/codex-runtime-home/home/worktrees/ea9e/gods-eye-view` (dirty worktree previo, HEAD detached). Supervisión y evidencia: `C:/Users/Alex/orca/gods-eye-view/output/eyeinsky-immersive/p012`. Preview existente: `http://127.0.0.1:4197/`; es desarrollo, no entrega P2 hasta verificarla. No crear worktree limpio que pierda las modificaciones no confirmadas V3/V4.

## Dirección visual ejecutable

- Cesium a pantalla completa; universo negro estelar de lejos, tinte verde mineral únicamente en zoom cercano mediante responsabilidades separadas de cielo/atmósfera/máscara. Mantener textura, relieve, retícula y selección legibles.
- Cápsula de navegación compacta en el antiguo buscador: Explorar / Vistas / Instrumentos / Más. Búsqueda como botón derecho desplegable; no tira superior tipo dashboard. Botones planos y claros, no extrusión ni botones 3D.
- Izquierda: lista de capas realmente activas, vacía al entrar sin estado compartido, con Agregar. Catálogo contextual con descripciones breves, iconografía coherente, estados y volver. Más información por descubrimiento progresivo, no pared de tarjetas o prosa.
- Glass oscuro con borde fino y profundidad contenida. Negro, gris mineral y acentos verdes; conservar Space Grotesk / IBM Plex Mono y la identidad Iris. Menos superficies simultáneas, texto esencial legible, foco inequívoco. No animación decorativa constante que compita con el mundo.
- Gráficos interactivos dentro de P1/P2: orientación/escala vinculadas a cámara; representación visual de capas/estados vinculada al manager; cuando haya datos, una vista compacta de su distribución permite filtrar o enfocar y ofrece equivalentes de teclado/tacto. Reutilizar capacidades existentes. Sin datos, estado vacío explícito: no inventar históricos, conteos, radar de contactos ni latidos de actividad. Los gráficos deben tener una acción comprobable, no SVG decorativo presentado como instrumento.
- Simplificar composición y duplicados SIN ocultar funciones upstream. El expediente enriquecido, marcas, fotos/slider y popup detallado de carga pertenecen a P3; conservar el inspector/cargas actuales operativos y acceso visible a Instrumentos en este lote.
- Desktop y táctil: targets móviles >=44px; texto esencial >=13px desktop y >=14px móvil; contraste >=4.5:1; safe areas, foco/Escape, scroll interno y reduced-motion. Atribuciones siempre visibles y pulsables, también bajo hojas, cabina y Vista limpia.

## Workflow y propiedad

1. KRÓNOS: preflight de CLI/modelo y procesos; respaldo ZIP de fuente permitida con manifiesto SHA-256 comprobado; documento y contratos.
2. Sol constructor, un único escritor de producto: P0 completo, luego P1 y P2 en el mismo contexto. No detenerse entre hitos para aprobación cosmética. La comprobación científica P0 se mantiene aislada fuera del producto; si requiere nuevo motor o alternativa arquitectónica, informar y no integrar una sustitución silenciosa. Si falta un gate obligatorio, la fase permanece abierta.
3. KRÓNOS: leer handoff, matriz completa y delta contra respaldo, verificar que no faltan entregables antes de auditar. Si parcial, continuar la construcción exacta, no reiniciar ni auditar un stub.
4. Sol auditor fresco, después de que termine el escritor: lectura de fuente, ejecución real y revisión visual del corte P0–P2. Puede escribir evidencia en su carpeta y salidas generadas de test/build, nunca cambiar la fuente de la app. Una pasada global de este corte, no auditorías exhaustivas por cada hito.
5. Reparaciones sólo de defectos reproducibles contra este contrato, serializadas en el constructor. Revisión dirigida de IDs afectados. KRÓNOS ejecuta gates centrales y recorrido propio sobre la fuente final estable; una preferencia estética nueva no genera ciclo infinito.
6. KRÓNOS entrega preview local comprobada y recap. Aceptación estética final corresponde a Alex. Paridad global, teléfono físico, extensión Chrome y publicación permanecen gates distintos.

## P0 · Base, contratos y viabilidad

P0-01. Backup y manifest de base dirty, procesos escritores descartados; registro de base commit y alcance. No leer credenciales ni incluir `.env`, auth, cookies o perfiles en evidencia.
P0-02. Inventario completo a partir del catálogo/registro reales: IDs, controles, instrumentos, fuentes, disponibilidad/configuración y ruta de acceso. Comparar conjuntos programáticamente. No whitelist de tres capas ni incapacitar funciones válidas por comodidad.
P0-03. Baseline reproducible en Chrome GPU nativa: viewport/DPR/renderer, mapa/capas, idle y cámara, frames reales Cesium separados de RAF, latencia de entrada, memoria y cargas disponibles. Escenario cargado rotulado y separado de vacío. Selección superpuesta con propietario al instante del clic y caso aislado de control.
P0-04. Spike lunar desechable: elipsoide explícito, cámara y picking polos/cara lejana, alternancia y retorno de estado terrestre, destrucción de viewer/recursos/listeners. No cambiar `Ellipsoid.default` global ni incorporar Luna como función P2. Registrar qué mide realmente la sonda: destruir referencias no prueba liberación de VRAM física.
P0-05. Unidades km→m, marcos TEME/inercial/fijo, UTC frente a TT/TDB. Muestras de referencia públicas y tolerancias explícitas a la escala de la propuesta; OMM con ID de seis dígitos y TLE heredado sin truncamiento. Política de caducidad/caché y rango temporal para desarrollo posterior; no afirmar precisión científica sin comparación.
P0-06. Contratos de selección, catálogo y director con generación/cancelación. Aprobar el enfoque sobre Cesium sólo con resultado medido; si el spike exige alternativa, no ejecutar esa alternativa sin decisión.

## P1 · Escena, navegación y capas

P1-01. Pruebas RED→GREEN de lejos/cerca/lejos con histéresis; no fondo verde global ni near negro absoluto.
P1-02. Navegación flotante e Instrumentos descubrible; buscador derecho por cursor, clic, teclado y tacto, conserva foco al escribir. Menos elementos persistentes y sin duplicar IDs/componentes nativos.
P1-03. Inicio vacío sólo cuando no hay enlace/operación explícitos. Restore compartido preservado y reanudación local opt-in; no modificar defaults del codec que reinterpretan enlaces históricos.
P1-04. Catálogo completo con disponible / requiere configuración / próximamente diferenciados de apagado / cargando / listo / error. Próximamente no activa funciones falsas; fuentes sin clave que sí funcionan permanecen utilizables.
P1-05. Agregar→lista→catálogo→apagar→restaurar con estado único del manager. No copias durables divergentes de capas. Los parámetros/medios/operaciones/mapas/director/voz siguen accesibles por rutas comprobadas.
P1-06. Instrumentos y gráficos útiles, ligados a fuente/cámara, accionables por ratón y teclado; estados sin datos honestos. Cinco viewports: 1920x1080, 1440x900, 390x844, 360x800, 844x390. Comprobar intersecciones entre controles y texto dentro de hit targets, no sólo overflow global.

## P2 · Cámara y motion

P2-01. Director como adaptador de NavigationController/navigationPolicy; una única autoridad. Selección estable preservada. Prioridades: gesto humano > destino explícito > encuadre de activación de capas > motion incidental; cabina/seguimiento conservan su contrato.
P2-02. Cambio de objetivo: pullback→reencuadre→aproximación suave, cancelable y sin atravesar superficie; padding de paneles y encuadre por volumen/FOV/región. Home/Norte/búsqueda/seguimiento no compiten con callbacks tardíos.
P2-03. Tráfico/vuelos/satélites: alejar únicamente si el volumen no cabe, con escalas adecuadas y agrupación de toggles rápidos. Si ya cabe, no mover. Refrescos del feed no disparan nuevos vuelos; no mostrar un anillo ficticio para simular datos ausentes.
P2-04. Gesto, rueda, tacto y Escape interrumpen; nueva intención invalida la vieja; abort/destroy elimina listeners y vuelos. Reduced-motion entrega estado final sin paseo obligado.
P2-05. Binario→texto breve en presentación, sin demorar/alterar IDs y datos esenciales, sin aria-live de caracteres aleatorios. Aladino al apagar regresa visualmente al catálogo; estado funcional inmediato, undo y foco correctos, sin estilos parciales al interrumpir.
P2-06. Probar selección aislada y superpuesta, cambio rápido A→B, búsqueda tardía, capas en lote, cabina→Home, Vista limpia ida/vuelta, reentrada de animaciones y no robo de cámara al leer.

## Evidencia y cierre

Constructor debe entregar `build/HANDOFF.md`, `build/result.json`, manifiesto de delta, `p0/` con inventario/baseline/spike/referencias y pruebas/browser repetibles. `result.json`: phaseStatus P0/P1/P2, requirementChecks con IDs únicos anteriores y estado/evidencia, commands con argv/exitCode/log, changedFiles, unresolved, source fingerprint, preview, publication=blocked-pending-acceptance. No `passed` si el código sólo fue escrito o el comando no se ejecutó. Registrar la salida nativa antes de cualquier logging.

Gates de cierre: tests nuevos y afectados + `npm test`, `npm run build`, `npm run format:check`, `npm run check:boundaries`, TypeScript local ya instalado con `tsconfig.eyeinsky-immersive.json`, recorrido real del corte con capturas cinco viewports y reduced-motion. No ejecutar formateo global con escritura ni instalar compiladores por npx en una verificación offline. Cada gate tiene resultado real, no inferido de un resumen. Analizar conteos exactos con código.

Conservar V4 original 10/11, fallo de picking por contacto móvil superpuesto y sonda nativa aislada 4/4 como antecedentes separados, no supuestos defectos nuevos ni excusas para omitir prueba superpuesta P2. No afirmar más FPS por menos mutaciones HUD o una captura. No datos sintéticos presentados como directo. No revisar correo, DNS, producción o terminal oculta en este lote.

Rollback: fuente previa en ZIP y manifest. Para reparar o revertir, identificar sólo el delta del lote y respaldarlo; no `git reset --hard`, `git clean`, checkout masivo ni sobrescribir trabajo posterior. Features pequeñas y adaptadores reversibles; no bifurcación de renderer.

## Recap al entregar

Comunicar URL verificada, qué puede probar Alex y recorrido corto; P0/P1/P2 realmente cerradas o limitaciones precisas; cambios visuales y funcionales, evidencias verificadas y no implementado. Resumen siguiente: P3 expediente/medios/carga, P4 satélites 3D bajo demanda, P5 sistema Tierra–Luna, P6 exploración lunar/relieve, P7 integración/paridad/QA y revisión previa a cualquier publicación. No iniciar P3 automáticamente.
