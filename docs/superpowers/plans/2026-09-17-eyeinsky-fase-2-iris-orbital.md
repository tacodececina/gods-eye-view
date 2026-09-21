# EYEINSKY — Fase 2 / Iris orbital Implementation Plan

> **For agentic workers:** EJECUCIÓN AUTORIZADA por Alex el 2026-09-17: construir primera y segunda entrega completas y someterlas a auditoría independiente GPT-5.6-Sol antes de revisión del usuario. Aplicar el flujo executing-plans, un constructor Codex en worktree y verificación final de KRÓNOS. Contrato vigente: `docs/superpowers/specs/2026-09-17-eyeinsky-f2-acceptance.md`. La portada pública y el correo pertenecen a infraestructura separada; no publicar la beta sin aprobación ni reactivar la inscripción/terminal aplazadas.

**Goal:** convertir la ruta 01 Iris orbital en una identidad final y en una consola EYEINSKY real sobre Cesium, significativamente distinta del upstream y utilizable para explorar, inspeccionar y retomar una operación.

**Architecture:** conservar JavaScript/Vite/Cesium, servicios de datos y ciclo de vida; reemplazar composición, controles, presentación y vocabulario por una shell propia. Un viewer y un dueño por recurso/listener. Probar un recorrido vertical antes de migrar superficies secundarias. Operaciones locales en esta fase; backend continuo, cuentas, pagos e historial durable no se fingen con temporizadores del navegador.

**Tech Stack:** JavaScript ESM, Vite, CesiumJS, HTML/CSS/SVG, fuentes locales OFL Space Grotesk e IBM Plex Mono, node:test y Puppeteer existentes. No React/Next.js/Arwes nuevos por apariencia.

**Spec:** `docs/design/eyeinsky-brand/DECISION.md`, dossier `docs/design/eyeinsky-brand/EYEINSKY-Propuestas-de-Marca-v1.pdf` páginas 4–6; referencia funcional/visual `docs/design/phase-1-tactical/`; matriz R01–R12 en `2026-09-16-ops-rebrand-roadmap.md`. La elección posterior Iris orbital y el globo protagonista prevalecen sobre Signal Black, naming antiguo y composiciones rechazadas del roadmap histórico.

## Global Constraints

- EYEINSKY, todo junto; Iris orbital elegida. No nueva ronda de nombres ni tres alternativas visuales.
- Globo Cesium 3D real dominante, rotable y con zoom. El tablero táctico rodea el planeta; no lo sustituye por una imagen, un mapa plano o cards.
- Carácter hacking/vigilancia militar cinematográfico, acabado sobrio y profesional; sin falsa afiliación institucional, acceso privado, terminal de sistema o telemetría inventada.
- La interfaz cambia en composición, navegación, componentes, iconos, tipografía, movimiento, copy, estados y móvil. Cambiar sólo el logo/color no satisface esta fase.
- No declarar total mientras queden superficies públicas heredadas accesibles sin migrar. Las capacidades retenidas no desaparecen en silencio: habilitadas, restringidas por licencia/configuración o diferidas quedan identificadas.
- No eliminar MIT, autoría upstream ni atribuciones Cesium/mapas/modelos/datos. La licencia MIT no otorga permiso comercial sobre feeds.
- Sin commit, push o publicación del producto por el hecho de aprobar la dirección de marca. El encargo actual de infraestructura puede publicar sólo una página mínima de preparación.
- No secretos ni claves privadas en frontend, capturas, repos o documentación. Provider Settings/local key-setup no se publica.
- Trabajar sobre archivos reales y contratos leídos; rutas nuevas de este plan son entregables propuestos, no módulos ya existentes.
- Las pruebas y números del preflight anterior son históricos: el constructor y KRÓNOS ejecutan nuevamente las puertas del lote modificado.

## 1. Enfoque recomendado y decisiones

Se recomienda **renovación vertical conservando el motor**: identidad final → una consola real y completa en su recorrido principal → migración de superficies restantes → preview privado y validación. Es más rápido y comprobable que reescribir motor/stack y evita entregar otro prototipo desconectado.

Alternativas rechazadas para esta fase:

- Reskin del upstream: barato pero incumple el rediseño total y conserva su composición reconocible.
- Reescritura completa con framework nuevo: añade riesgo y retrasa el globo/funciones sin una necesidad técnica demostrada.

Entrega pública recomendada a futuro: `https://eyeinsky.org/` entra directamente al producto gratuito, sin una landing de ventas que bloquee el globo. La página temporal «En preparación» se sustituye sólo cuando la consola esté aceptada. El preview permanece privado por Tailscale u otro control real; `noindex` no es autenticación.

## 2. Primer resultado que Alex debe ver

El primer lote de construcción combina F2.0 y F2.1 con el mínimo de F2.2 necesario para comprobar la integración:

1. Iris orbital refinada, favicon y firmas de marca coherentes.
2. Consola EYEINSKY de escritorio con globo real navegable, vista limpia y paneles con jerarquía propia.
3. Una fuente pública permitida realmente conectada (primera candidata: sismos USGS, sujeta a documentar términos/atribución), selección y expediente con fecha/fuente reales.
4. Estados de carga, vacío y fuente caída ejercitados; no otra maqueta con controles sin destino.
5. Móvil funcional del mismo recorrido, no escritorio encogido.

No esperar a cuentas, publicidad o premium para mostrar este resultado. Una nueva función no compensa una interfaz visualmente insuficiente.

## F2.0 — Consolidar la identidad elegida

**Leer:** `docs/design/eyeinsky-brand/brand-proposals.json`, `assets/logos/iris-orbital-*.svg` y licencias/fonts del mismo paquete.

**Crear (propuesto):** `docs/design/eyeinsky-identity/` con manual breve PDF, SVG maestros/versiones micro, PNG de exportación, favicon, firmas horizontal/compacta, ejemplos de uso y manifest de assets; `DESIGN.md` y tokens exportables de producción cuando estén consolidados.

- [ ] Refinar proporciones ojo/iris/anillo, espaciado del wordmark y relación símbolo/nombre, conservando el concepto elegido. No usar diagonal que parezca «visibilidad desactivada».
- [ ] Definir área de protección y tamaño mínimo; probar versiones 16, 24 y 32 px y positivo/negativo/monocromo, con renders reales.
- [ ] Cerrar escala tipográfica: Space Grotesk para marca/interfaz; IBM Plex Mono para coordenadas/tiempo/identificadores. Servir localmente; evitar mono en párrafos largos.
- [ ] Partir de `#071110` / `#142320` / `#A6D7C2` / `#EEF1E9` / `#E6B46D`. Añadir semántica de éxito, advertencia, error, deshabilitado y foco; no convertir cada estado en un color sin etiqueta.
- [ ] Definir iconografía SVG, marcos instrumentales, retículas, espaciado, bordes y densidad. Textos corridos legibles y estados con contraste medido sobre superficies efectivas.
- [ ] Movimiento orbital breve ligado a una transición real, sin boot obligatorio; reduced-motion funcional y sonido apagado por defecto.
- [ ] Entregar manual/kit y verificar consistencia por manifest; revisar visualmente identidad aplicada a la consola, no sólo logo aislado.

**Aceptación:** identidad usable a todos los tamaños previstos; textos normales con contraste objetivo WCAG AA 4.5:1 y controles/foco con 3:1 donde aplica; validación numérica y visual, no garantía automática de accesibilidad global.

## F2.1 — Integrar la shell real alrededor del globo

**Archivos existentes inspeccionados:** `src/ui/applicationShell.js` (`StyleManager`), `src/ui/shellElements.js` (`readShellElements`), `src/app/application.js` (`createApplication`), `docs/APPLICATION.md`, `src/ui/styles/foundation.css`, `src/ui/templates/command-dock.html` y prototipo `docs/design/phase-1-tactical/`.

**Responsabilidades:** ciclo de vida sigue en `createApplication`; los constructores standalone se trazan desde `src/main.js` a `src/standalone/application.js` antes de editar. El plan no inventa nuevas firmas ni autoriza dos instancias standalone en una página. Componentes/adaptadores nuevos, si hacen falta, se nombran tras el inventario de bindings y permanecen dentro de las fronteras `src/ui`/`src/app` ya existentes.

- [ ] Inventariar IDs/servicios/propietarios de eventos que consume `readShellElements`, incluida limpieza y restauración. Identificar qué elementos cambian de propiedad antes de reemplazar plantillas.
- [ ] Añadir prueba de regresión de montaje/desmontaje y selección antes de cambiar wiring; usar los tests existentes `src/ui/shellLifecycle.test.mjs` y `src/ui/shellLifetime.test.mjs` como patrón real.
- [ ] Implementar cabecera compacta con identidad/sector/estado de fuentes, controles tácticos periféricos y paneles bajo demanda. Globo visible y operable; créditos nunca ocultos.
- [ ] Sustituir dock/composición upstream por navegación propia Explorar / Señales / Operación, con Inspeccionar como panel contextual. No añadir pantallas vacías de Vigilancia/Archivo sólo para parecer completo.
- [ ] Cámara, zoom, home global, selección, grilla y vista limpia deben actuar sobre el viewer real. Un click aprobado se comprueba por estado de cámara/selección, no por cerrar un panel.
- [ ] Mantener teclado/ratón/touch, restauración del foco y Escape; redimensionamiento sin duplicar listeners ni canvas.
- [ ] Reproducir el recorrido con viewport 390 y 1440; ampliar a 360/768/1920 en el cierre responsive, revisar zoom de texto 200% y reduced-motion.

**Aceptación:** una aplicación/renderer por página; rotar, acercar, seleccionar, abrir/cerrar inspector y volver a vista limpia sin restos operativos duplicados. Rediseño reconocible más allá del acento de color.

## F2.2 — Señales y expedientes conectados a evidencia real

**Leer antes de modificar:** `src/data/manager.js`, `src/data/lifecycle.js`, capas existentes correspondientes, `src/ui/layers.js`, `src/sources/`, `DATA_SOURCES.md`. Se conserva el contrato actual `setEnabled` y se comprueban definición/usos antes de invocarlo; no volver a asumir un método `enable` inexistente.

**Crear (propuesto):** `docs/design/eyeinsky-identity/source-scope.md` con proveedor, producto/API concreto, licencia/términos/enlace/fecha, retención, atribución, costo/cupo, uso comercial permitido o pendiente, y estado de despliegue.

- [ ] Elegir primer conjunto usable por permiso, estabilidad y valor visual, no por número de capas. Priorizar sismos; satélites/orbitas después de distinguir cálculo/predicción de observación. Aviación/barcos/cámaras sólo donde acceso y términos estén comprobados.
- [ ] Integrar bandeja filtrable por sector/tipo/frescura y sincronizar la selección con el objeto real y su ID estable.
- [ ] Inspector con fuente enlazada, fecha de observación, fecha de consulta, demora/cobertura y acciones válidas; hora de refresco no se presenta como hora de observación.
- [ ] Implementar estados cargando/sin resultados/parcial/atrasado/desconectado/error y refresco recuperable. No inventar desapariciones cuando cae un feed.
- [ ] Probar selección entre dos IDs distintos, orden temporal, vacíos y reintento. Tests con fixtures deterministas etiquetadas; smoke separado sobre feed real.
- [ ] Introducir command palette sólo para acciones reales ya expuestas por UI, con allowlist: sector/capa/contacto/operación. Sin shell, eval ni URL arbitraria.

**Aceptación:** seleccionar un registro cambia cámara y expediente al mismo ID; tiempo/fuente/estado son verificables. Ninguna capa marcada en vivo a partir de una fixture o de un TLE sin explicar su naturaleza.

## F2.3 — Guardar y retomar operaciones locales

**Leer:** `src/scenes/director.js`, `src/ui/scenes.js`, `src/ui/sceneSharing.js`, `src/annotations/` y sus tests/contratos antes de extender formatos. Persistencia local, no backend nuevo.

- [ ] Definir registro versionado con nombre de operación, cámara/sector, capas, filtros, selección y notas permitidas. No almacenar tokens, resultados restringidos ni contenido de otras personas.
- [ ] Añadir pruebas de serialización/restauración, versión inválida, registro corrupto y almacenamiento sin espacio/denegado antes de implementar cambios.
- [ ] Guardar, listar, renombrar, reabrir y eliminar con confirmación; al reabrir, refrescar feeds y mantener fecha original de notas. El último snapshot no se transforma en «actual» por cargarlo.
- [ ] Restaurar fuentes ausentes y contactos no disponibles con estado explícito sin bloquear el globo. No activar todos los proveedores automáticamente.
- [ ] Compartir sólo vista/estado público permitido, por acción explícita. Las notas privadas no van al enlace por defecto.
- [ ] Verificar guardar → recargar página → abrir operación → mismo sector/filtros, con datos frescos y marcador claro de lo que no se pudo restaurar.

**Aceptación:** el usuario retoma trabajo real en el mismo navegador. Se comunica «guardado en este dispositivo»; no se ofrece sincronización, histórico global, alertas con pestaña cerrada ni vigilancia 24/7.

## F2.4 — Cerrar superficies, móvil y calidad

La matriz de rediseño total se completa con una fila por superficie; no basta capturar la pantalla principal:

- [ ] R01: marca/entrada, onboarding breve y carga.
- [ ] R02: navegación, búsqueda/command palette, ayuda y foco.
- [ ] R03: globo, HUD, retícula, créditos y selección.
- [ ] R04: catálogo de capas, configuración admitida y estados de fuentes.
- [ ] R05: inspector/contactos, seguimiento y tiempos.
- [ ] R06: cámaras/radio autorizados, error/ausencia y controles propios.
- [ ] R07: cockpit/modos útiles retenidos, sin recuperar paneles upstream sin migrar.
- [ ] R08: anotaciones y operación.
- [ ] R09: director/compartir y privacidad de notas.
- [ ] R10: voz opcional/preferencias, configuración de proveedor privada fuera del producto público.
- [ ] R11: feedback, errores, vacíos, carga, accesibilidad y recuperación.
- [ ] R12: móvil, favicon/metadata, superficies públicas y pie legal.

- [ ] En móvil usar sheets/vistas conmutables; globo no cubierto permanentemente por cuatro columnas. Verificar límites de controles, no sólo ausencia de scrollbar.
- [ ] Medir tiempo a globo operable, memoria/recursos y solicitudes frente a baseline en el mismo dispositivo/viewport. Registrar condiciones y resultados; no inventar FPS o prometer cobertura por hardware.
- [ ] Verificar detener trabajo oculto, carga de feeds bajo demanda, reduced-motion y ausencia de audio automático. No optimizaciones globales fuera de alcance.
- [ ] Revisar todos los caminos públicamente alcanzables; funciones pendientes explícitas en inventario, no botones rotos ni ocultamiento que se haga pasar por migración terminada.

**Aceptación:** comparativas antes/después y recorrido principal coherente a escritorio/móvil, sin fallos bloqueantes; lista acotada de mejoras cosméticas diferidas, no otra cadena infinita de auditorías.

## F2.5 — Preview privado y puerta de publicación

- [ ] Ejecutar puertas reales desde el worktree: `npm run test`, `npm run check:boundaries`, `npm run build`, `npm run format:check`. `npm run format` escribe: no usarlo como verificación global ni reformatear trabajo ajeno.
- [ ] Si se altera selección/ciclo de vida/standalone, ejecutar además `npm run test:track` y checks de primer arranque descritos en `docs/APPLICATION.md`; confirmar argumentos de scripts antes de inventar filtros.
- [ ] El constructor verifica, entrega diff y evidencia; KRÓNOS revisa destinos y reproduce recorrido/puertas afectadas directamente. No nuevo auditor automático por cada corrección menor.
- [ ] Preparar manifest de release sin secretos y preview aislado con acceso privado; base nginx/DNS/TLS del plan de infraestructura no concede acceso público a la beta por sí misma.
- [ ] Confirmar cómo se sirven endpoints de datos en producción: no publicar `vite dev`, proxies abiertos ni endpoints locales de key-setup. Medir build/asset paths/Cesium workers y CORS, no asumir que `vite build` incluye backend.
- [ ] Alex revisa el resultado visual y el flujo real. Si aprueba, publicar el release propio con backup y rollback de enlace/vhost; revalidar URL pública y controles del host compartido.

**Aceptación de fase:** consola EYEINSKY usable + manual/kit final + registro de fuentes/derechos + operación local guardable + móvil/estados secundarios coherentes + release/rollback verificables. Publicación es una puerta explícita posterior, no sinónimo de build exitoso.

## 3. Infraestructura paralela: contrato con Codex

Plan ejecutable separado: `2026-09-17-eyeinsky-infra-kvm4.md`.

- I0: cuenta/Chrome local, inventario DNS/KVM4, lease y respaldo.
- I1: raíz estática aislada en KVM4, «En preparación» con Iris orbital.
- I2: apex 195.35.32.233, www al apex, sin cambio NS; TLS/renovación/controles.
- I3: correo inicial sobre servicio disponible y soportado; sin compras ni cambios globales.
- I4: runbook, evidencia/rollback y verificación de KRÓNOS.

Mail recomendado: buzón `hola@eyeinsky.org`; alias `soporte@`, `privacidad@`, `postmaster@`, `abuse@`. `notificaciones@` se reserva para envíos de la aplicación en su fase correspondiente. La capacidad de alta y la entrega de acceso deben comprobarse; tener Postfix instalado o publicar MX no demuestra correo operativo.

## 4. Qué no construir todavía

- Cuentas/sincronización, organización empresarial, historial continuo, reglas de vigilancia durables o alertas fuera del navegador: F3.
- Cobros, precios finales, ads programáticos, tracking publicitario o premium: F4. Reservar espacios no intrusivos en páginas secundarias, nunca sobre el área operativa.
- IA que infiere amenazas, muros de muchas cámaras, archivo global o exportación de datos sin permiso: fuera del MVP y sujetos a derechos/costo.
- Cambio de stack o todos los servicios de infraestructura que quizá se necesiten después.

## 5. Decisiones y estado de esta entrega

### Actualización de foco — 2026-09-17

- Marca Iris orbital y base DNS/HTTPS/portada ya están resueltas; no repetir naming ni otra ronda de maquetas desconectadas. La consola real F2 sigue sin implementar.
- Tras este recap, Alex autorizó construir primera y segunda entrega completas, auditarlas con GPT-5.6-Sol y presentar una sola Fase 2 revisable. Contrato: `docs/superpowers/specs/2026-09-17-eyeinsky-f2-acceptance.md`; auditoría: `2026-09-17-eyeinsky-f2-auditoria-sol.md`. No se requiere aprobación intermedia entre entregas, pero publicación y aceptación estética final siguen separadas.
- Primera entrega recomendada: F2.0 + F2.1 + recorrido mínimo real F2.2, con móvil funcional desde el mismo lote. Debe poder abrirse el globo, seleccionar un sismo real y leer un expediente coherente con fuente/fecha.
- Segunda entrega dentro de F2: guardar/retomar operaciones locales, migrar superficies restantes y preparar una versión privada verificable. No afirmar rediseño total mientras existan superficies heredadas sin migrar.
- Correo I3 mantiene su ejecución independiente y no debe bloquear construcción local. Cualquier despliegue comparte cerrojo y debe coordinarse con el constructor de infraestructura.
- Formulario de inscripción y terminal oculta de acceso: **cancelados para ejecución actual y aplazados** por orden de Alex. Ver `2026-09-17-eyeinsky-ideas-aplazadas.md`; no incluirlos implícitamente en este lote ni reactivarlos por haber sido mencionados antes.

### Estado del plan presentado originalmente

Aprobado por Alex: nombre/dominio objetivo, dirección 01 Iris orbital y encargo paralelo de preparación infra a Codex.

Presentado para siguiente ejecución: este alcance F2 con primer lote visible. No se inicia implementación funcional en este turno sólo por escribir el plan.

Dominios/correo: el constructor comprobará cuenta real/extensión y gestión de mail. Compras/licencias nuevas, 2FA o una dirección externa para test requieren intervención del usuario si aparecen; no se suplanta ese dato.

El plan se completa cuando está escrito, enlazado a la decisión y presentado; infraestructura se completa sólo al verificar los cambios contra sus destinos. Ambos estados se informan por separado.
