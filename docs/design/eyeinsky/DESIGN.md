# EYEINSKY / Iris orbital

La consola organiza tres tareas: explorar, inspeccionar señales públicas y conservar contexto local. Cesium mantiene el globo, sus coordenadas y la selección. La identidad elegida es **01 Iris orbital**; los SVG aprobados se conservan en `public/identity/logos`.

## Sistema visual

Negro verdoso `#071110`, superficie `#101e1b`, verde mineral `#a6d7c2`, blanco cálido `#eef1e9`, texto secundario `#b2c4b9`, ámbar funcional `#e6b46d`. El ámbar indica magnitud, foco y atención; no distingue amenazas. Los estados siempre tienen texto, además de color.

Space Grotesk presenta navegación y lectura. IBM Plex Mono presenta IDs, coordenadas, fechas y medidas. Ambas familias son locales con sus licencias OFL, sin CDN. Iconos de trazo propios en `eyeinskyIcons.js`; los glifos retenidos se convierten a SVG por un observador que se desmonta con la aplicación.

El símbolo general conserva su órbita; la variante micro usa su dibujo específico en 16/24/32 px. No deformar, aplicar degradados ni añadir resplandor. Área de protección: al menos un cuarto de la altura del símbolo. Lockup horizontal para documentos; símbolo y texto vivo para navegación accesible.

## Composición e interacción

Cabecera de navegación, lienzo dominante, instrumentos inferiores, panel izquierdo de tarea e inspector derecho. En móvil los paneles pasan a sheets cerrables; Escape y botones de cierre recuperan contexto. Las coordenadas y la altitud proceden de la cámara real. La cuadrícula dibuja meridianos y paralelos sobre el globo. No hay métricas aleatorias, cuentas regresivas ni audio automático.

La fuente USGS se activa bajo demanda. Los filtros afectan lista, entidades y etiquetas con el mismo ID. M2.5+ / 24 h describe el conjunto normalizado, no todo el JSON de USGS. La fecha del evento y la última consulta son campos diferentes. Los errores conservan datos anteriores con estado explícito.

Operaciones versión 1: cámara, capas, filtros, selección, nombre y notas. Límites: 30 operaciones, 80 caracteres de nombre, 100 notas de 2,000 caracteres. Se guardan únicamente en este navegador. Compartir vista usa una lista permitida de campos y excluye nombre/notas. No equivale a sincronización ni respaldo.

Las marcas dibujadas pertenecen al motor existente y duran la sesión. El director retiene captura/reproducción/importación/exportación de escenas. La distribución pública inicia una secuencia vacía para no activar recetas que dependen de proveedores sin configurar. Sus JSON son documentos de escena independientes de las notas privadas.

## Accesibilidad y movimiento

Foco ámbar visible, controles principales de al menos 44 px, formularios con etiquetas nativas, diálogos modales nativos y mensajes de estado. Reduced-motion elimina transiciones de interfaz y los vuelos de la navegación principal. El estilo térmico/nocturno es una apariencia elegida por la persona, nunca un sensor declarado.

El contraste del texto se calcula en `tokens.json` y en el registro del kit. La cartografía contiene sus propios colores: el contraste de los rótulos usa una placa opaca. El PDF es una guía breve, no evidencia sustituta del navegador.

## Implementación y propiedad

`main → standalone/application → app/application` conserva una instancia. `prepareEyeShell` compone los nodos activos antes de enlazarlos; `workspaceLayout` evita que los rails anteriores los reubiquen. No existe una segunda shell oculta. El gestor de datos, USGS, cámara, director y anotaciones conservan sus motores y contratos. Todo observador/listener nuevo tiene una baja asociada a la vida de la aplicación.

Fuentes y restricciones: [source-scope.md](source-scope.md). Tokens ejecutados: `src/ui/styles/eyeinsky.css`. SVG, favicons y licencias: `public/identity`. Manual reproducible: `manual.html` y `scripts/eyeinsky-kit.mjs`.
