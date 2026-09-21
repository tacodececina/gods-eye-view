# EYEINSKY Fase 2 — contrato de aceptación para ambas entregas

Fecha: 2026-09-17. Estado: IMPLEMENTACIÓN AUTORIZADA; aceptación técnica y revisión visual pendientes. Este contrato complementa, no reduce, `docs/superpowers/plans/2026-09-17-eyeinsky-fase-2-iris-orbital.md`.

## Orden vigente de Alex

> Crea primera y segunda entrega, audita con GPT 5.6 Sol segun tu plan de auditoria para entregarme directo hasta la segunda entrega poder revisarla yo completa y quede plenamente satisfecho con el resultado hasta esta 2da Fase.

La autorización posterior sustituye las notas históricas «sólo plan, no implementar» del documento original. Se mantienen la prohibición de commit/push no solicitado, la puerta de publicación después de la revisión de Alex y la cancelación del formulario/terminal oculta. La satisfacción estética final sólo la determina Alex: no se acredita con una autoevaluación del agente.

## Entrega y responsables

- Constructor: Codex CLI, modelo `gpt-6-astra`, sesión aislada y un único escritor de producto.
- Auditor independiente requerido: Codex CLI, modelo exacto `gpt-5.6-sol`, contexto nuevo DESPUÉS de la construcción, sin aceptar los resultados del constructor como prueba.
- Ambos modelos figuraron en el catálogo del CLI y aceptaron una invocación real read-only el 2026-09-17; evidencia `output/eyeinsky-phase2/preflight-*.json` en el repo principal. Esto acredita acceso al modelo, no auditoría realizada.
- KRÓNOS: supervisión, reproducción de gates/recorrido, revisión del resultado y entrega de una versión completa abrible por Alex.
- Artefacto final: aplicación EYEINSKY real con ambas entregas integradas, URL local de revisión comprobada y reproducible, build, kit de identidad, matriz R01–R12, evidencia y limitaciones concretas. No una maqueta nueva en docs/design ni un informe en lugar de app.

## Dirección no negociable

- EYEINSKY, Iris orbital; negro verdoso, verde mineral, blanco cálido y ámbar funcional. Space Grotesk e IBM Plex Mono locales con licencias.
- Globo Cesium 3D dominante, realmente rotable/zoomeable. Al abrir, planeta bien encuadrado y controles legibles; no imagen del planeta, mapa plano ni interfaz de tarjetas reemplazando el lienzo.
- Consola de vigilancia/hacking cinematográfica, imponente y moderna: instrumentación precisa y retículas útiles, no lluvia de código, neón excesivo, timers de teatro, afiliación militar o telemetría inventada.
- Composición y componentes propios. Reutilizar motor, datos, contratos y listeners no significa conservar el dock y paneles upstream debajo de una capa verde.
- Preservar MIT, autoría y atribuciones de mapas/modelos/datos. No afirmar que MIT autoriza todos los feeds comerciales.
- Idioma principal español profesional. Nombres propios, IDs y nombres de proveedores conservados. Estados, diálogos, errores y ayudas coherentes.

## Primera entrega — consola real

A01 Identidad: símbolo refinado y versiones micro/monocromo, favicon, lockup horizontal/compacto; tokens aplicados y pequeño manual PDF con ejemplos reales de la aplicación. Contraste normal objetivo AA 4.5:1; controles/foco 3:1 donde aplica. No eliminar detalles para fingir legibilidad a 16px.

A02 Integración: modificar la aplicación existente, trazando src/main.js -> src/standalone/application.js -> createApplication. Un viewer, una instancia standalone y un propietario por recurso/listener. Mantener fronteras de paquetes y limpieza al desmontar. No esconder la implementación en un prototipo ajeno al entrypoint real.

A03 Navegación: Explorar / Señales / Operación con Inspeccionar como panel contextual. Cámara, zoom, orientación/home, retícula y vista limpia operan sobre viewer real. Escape y foco funcionan, incluido volver al disparador de un diálogo. Ningún botón decorativo sin destino ni panel vacío presentado como capacidad terminada.

A04 Señales: conectar USGS mediante el contrato ya existente, con atribución/términos documentados; mostrar fuente, hora del evento, última consulta y estado. Listado filtrable, selección entre al menos dos IDs distintos y sincronización globo-expediente. No cambiar silenciosamente la semántica del feed M2.5+/24h; rotular el conjunto realmente consultado.

A05 Estados: carga, vacío, error, retraso/parcial si aplica y reintento medidos. Conservar señales anteriores como antiguas cuando corresponde; no hacerlas desaparecer como si ya no existieran. Los tests deterministas pueden usar fixtures identificadas; el smoke de integración real debe consultar un feed vivo y nunca sustituirse por fixtures disfrazadas.

A06 Móvil inicial: el mismo recorrido funciona desde la primera entrega a 390px; sheets cerrables y lienzo operable, no cuatro columnas encogidas. Teclado/touch y reduced-motion funcionales, audio sólo por acción expresa.

## Segunda entrega — trabajo recuperable y cierre visual

B01 Operaciones versionadas: guardar/listar/renombrar/reabrir/eliminar con confirmación. Persistir nombre, cámara/sector, capas, filtros, selección y notas dentro de límites explícitos. Comunicar «guardado en este dispositivo»; sin cuentas ni sincronización inventadas.

B02 Restauración: guardar -> recargar página -> abrir -> mismo sector/cámara/filtros/notas; refrescar datos reales y respetar tiempos originales de notas. Contacto ausente o fuente no configurada debe quedar explicado, no romper el globo ni encender todos los proveedores. Probar corrupción, esquema incompatible, storage denegado/cuota, nombres/notas maliciosos y cambios rápidos.

B03 Privacidad: compartir sólo vista pública por acción expresa, nunca notas privadas/tokens por defecto. No eval/shell/URL arbitraria por comandos de aplicación. Texto introducido y procedente de proveedores tratado como texto seguro, con límites y validación.

B04 Superficies: auditar todas las R01–R12 de la tabla inferior. Conservar capacidades útiles mediante componentes migrados; cualquier restricción por fuente/credenciales/licencia debe ser visible y documentada, no una eliminación silenciosa o un botón muerto. Ninguna superficie accesible con look viejo pasa como «rediseño total».

B05 Responsive/calidad: 360/390/768/1440/1920px, zoom de texto 200%, teclado, foco, targets y reduced-motion. Revisar geometría de controles además de scrollbar. Sin errores de consola causados por nuestra implementación ni requests abortadas ocultadas con filtros amplios.

B06 Rendimiento: medir arranque hasta globo utilizable, requests y recursos disponibles antes/después bajo condiciones comparables. Documentar hardware/renderer/software y límites de medición; no inventar FPS ni usar otra máquina como baseline. Fuentes bajo demanda y trabajo oculto pausado donde el contrato lo permite.

## Matriz obligatoria de superficies

Crear una fila con estado, archivos, interacción verificada y evidencia por cada una. Los estados aceptables distinguen implementado de restringido por configuración/licencia y de defecto pendiente; una superficie priorizada no elimina las otras.

| ID | Superficie |
|---|---|
| R01 | Marca, entrada, onboarding breve, carga |
| R02 | Navegación, búsqueda/acciones acotadas, ayuda y foco |
| R03 | Globo, HUD, retícula, créditos y selección |
| R04 | Catálogo de capas, configuración permitida y estados |
| R05 | Inspector/contactos, seguimiento y tiempos |
| R06 | Cámaras/radio autorizados y estados de indisponibilidad |
| R07 | Cockpit/modos útiles retenidos |
| R08 | Anotaciones y operación |
| R09 | Director/compartir y privacidad de notas |
| R10 | Voz opcional/preferencias, sin configuración sensible pública |
| R11 | Feedback, errores, vacíos, carga, accesibilidad y recuperación |
| R12 | Móvil, favicon/metadata, superficies públicas y pie legal |

## Exclusiones expresas

Formulario de inscripción, terminal oculta de autenticación, usuarios/contraseñas, SaaS por invitación, cobros/ads/premium, backend de vigilancia continuo, historial global, avisos con navegador cerrado, acceso a cámaras privadas, nueva arquitectura React/Next y reescritura del motor. No depender de secretos existentes ni abrir archivos .env/credenciales. No cambios de infraestructura, DNS, correo, VPS o portada pública desde el constructor/auditor.

## Auditoría y aceptación

1. Constructor demuestra RED -> GREEN en módulos nuevos/bugs, corre baseline y pruebas de regresión. Inspecciona manifests y APIs antes de escribir; no inventa firmas ni importa librerías no instaladas.
2. Gates de proyecto: npm run test, npm run check:boundaries, npm run build, npm run format:check y npm run test:track si cambia selección/standalone. Sólo formato focalizado en archivos editados, nunca npm run format global sobre trabajo ajeno. Registrar comandos reales, exit codes y logs, no números recordados.
3. Flujo de oro: arranque limpio -> globo -> dos eventos reales distintos -> filtros/expediente -> operación con nota -> recarga -> restauración -> renombrar -> compartir sin nota -> eliminar con confirmación -> repetir recorrido esencial móvil.
4. Auditor Sol ejecuta su propia inspección y recorrido contra la versión actual, revisa screenshots reales y source/diff incluidos archivos nuevos. Reporta hallazgos con IDs estables, severidad, requisito afectado, pasos, esperado/observado y evidencia. No modifica producto durante la revisión.
5. Corregir defectos contra este contrato y repetir los checks afectados. No debilitar tests ni reescribir informes históricos para fabricar PASS. Diferenciar defectos, requisitos no ejercitados y mejoras opcionales. Sin rondas generales infinitas por preferencias estéticas nuevas.
6. KRÓNOS reproduce gates y recorrido críticos antes de entregar. No «terminado» mientras requisitos necesarios sigan sin ejecutar o existan defectos de aceptación. No presentar un exit 0 de agente como prueba.
7. Publicación separada: preview local ligado a 127.0.0.1 y proceso real supervisado. Build reproducible y plan de release/rollback listos; producción permanece en la portada hasta revisión de Alex. No exponer Vite dev ni key-setup públicamente.

## Protocolo de checkpoints

Si un agente agota presupuesto o se bloquea, conservar archivos, describir estado real y gates abiertos con rutas/último comando; reanudar su mismo worktree. No rellenar resultados. Un parcial es construcción pendiente, no entrega de Fase 2 ni motivo para iniciar una auditoría completa prematuramente.
