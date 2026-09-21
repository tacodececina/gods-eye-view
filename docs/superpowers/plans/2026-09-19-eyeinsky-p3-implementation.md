# EYEINSKY P3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to execute this plan task-by-task. Follow the Claude Code Opus 5 workflow linked below; one writer per worktree. Checkboxes describe FUTURE execution, not completed work. No commit, push or deploy without a separate user order.

**Goal:** entregar expediente contextual y actividad de carga reales, sin recortar las funciones existentes ni restar protagonismo al globo.
**Architecture:** adaptar el inspector actual con modelos puros y adaptadores observadores. Manager, contexto, CCTV y cámara mantienen su autoridad; el shell integra superficies y acciones existentes. No nuevo store global ni renderer.
**Tech Stack:** ESM JavaScript, TypeScript de motion existente, Vite, Cesium, node:test y Puppeteer del package.json. Sin dependencias nuevas de UI.
**Spec:** `../specs/2026-09-19-eyeinsky-p3-design.md`.
**Workflow:** `../../eyeinsky/p3/WORKFLOW-CLAUDE-OPUS5.md`.
**Estado:** sólo planificación, 2026-09-19. KRÓNOS redactó el plan. Opus 5 no lo generó: preflight bloqueado por saldo.

## Restricciones globales

- Alcance P3. No P4–P7, correo, formulario, terminal del sistema, sensor, deploy o cambio de framework.
- Base exacta `812d75c0833887069e31cc2218d47b728b9cad36`; nunca iniciar desde main por comodidad.
- Globo real como interfaz, negro global/verde cercano; sin header/footer globales, sin botones extruidos.
- Texto esencial >=13px escritorio / >=14px móvil, targets >=44px y contraste >=4.5:1. Créditos pulsables incluso con paneles abiertos.
- Cámara manual gana; reduced-motion en todas las rutas; no nuevo flyTo directo desde expediente o actividad.
- Una identidad de selección vigente. Fotografías de archivo y fixtures etiquetadas. No datos, licencias, progreso o pruebas inventados.
- No secretos, dumps de entorno, archivos de credenciales, cambios globales de Claude ni envío de datos de clientes.
- Autorizar la construcción y resolver acceso a Opus 5 antes de lanzar el escritor. Este documento no constituye esa autorización.

## 1. Estado del código realmente inspeccionado

| Ruta existente | Punto relevante | Implicación para P3 |
|---|---|---|
| `src/ui/eyeinskyShell.js:335` | `inspect(id, {fly, trigger})` sólo USGS | Generalizar presentación sin romper lista, restore y guardar operación |
| `src/ui/eyeinskyShell.js:697` | `viewer.selectedEntityChanged` sólo lee usgsId | No usar este único carril para aeronaves/billboards/CCTV |
| `src/ui/eyeinskyShell.js:721` | Home cierra inspector y centra global | Nueva semántica visual: ficha de vista abierta; conservar identidad/cámara/foco |
| `src/ui/templates/eyeinsky.html:350` | `#eye-inspector`, inicialmente hidden | Reutilizar IDs de montaje, quitar supuesto exclusivo USGS |
| `src/ui/styles/eyeinsky.css:674` | Posicionamiento alto del inspector | Anclaje inferior y hoja compacta con créditos fuera |
| `src/data/contextStore.js:44` | `selectEntityContext`, evento `gev:entity-selected` | Lectura de contexto sin cambiar la selección autoritativa |
| `src/data/contextStore.js:132` | `getSelectedEntityContext({dataManager})` | Filtra registros activos; `updatedAt` no es hora del proveedor |
| `src/layers/flights/tracking.js:61` | Emite selección antes de guardar contexto | Relectura en microtarea + generación; test A→B dentro del mismo turno |
| `src/data/trackedReadout.js:232` | Readout y tracking ya tienen dueños | No desmontarlos ni clonar sus controles |
| `src/data/lifecycle.js:369` | `refreshLayer(layerId,{signal})` | Reintento soportado para capa habilitada, con single-flight en UI |
| `src/data/lifecycle.js:2204` | `getAll`, `subscribe`, `subscribeActivity` | Suscripciones NO envían snapshot inicial: leerlo explícitamente |
| `src/loadingFeedback.js:17` | `normalizeLayerLoading`, `aggregateLayerLoading` | Reusar semántica guidance/partial/keyRequired, no reescribir lifecycle |
| `src/ui/shellFeedback.js:87` | Feedback global vigente | Mantener avisos críticos y evitar dos narraciones de la misma operación |
| `src/maps/controller.js:78` | `getState`, `setStack`, generación de cambio | Ready de stack no equivale a teselas globales listas |
| `src/app/scene.js:105` | Emite `gev:map-stack-changed` | Observarlo sin interceptar proveedor/fetch |
| `src/layers/cctv/controls.js:259` | `subscribe` emite snapshot inicial | Desuscribir y evitar duplicar snapshot; no polling propio de cámaras |
| `src/layers/cctv/presentation.js:132` | `loading.loaded/total`, `activeCameraId` | Progreso de geometría, no streams; campos separados |
| `scripts/run-unit-tests.mjs:25` | Descubre todas las `.test.mjs` de src | Nuevas pruebas vecinas se incluyen sin tocar runner |
| `tsconfig.eyeinsky-immersive.json` | Sólo incluye motion TS | El gate de tipos no acredita cobertura de todos los módulos JS |

Las líneas son anclas del checkpoint, no posiciones inmutables. Al ejecutar, releer antes de parchear. Los archivos NUEVOS abajo son propuestas deliberadas; no APIs ya presentes.

## 2. Interfaces nuevas fijadas para la implementación

Todo contexto normalizado lleva esta forma; campos ausentes son null, nunca cero inventado:

```js
// Contrato NUEVO de presentación, no store de selección.
const context = {
  key: 'earth:view',             // otros: `${layerId}:${stableId}`
  bodyId: 'earth',
  kind: 'view',                  // view | earthquake | tracked | camera | entity
  layerId: null,
  stableId: 'view',
  title: 'Vista · Tierra',
  source: null,
  observedAt: null,              // observación del proveedor, ms UTC
  fetchedAt: null,               // consulta, ms UTC
  localUpdatedAt: null,
  status: 'unreported',          // ready | stale | missing | unreported
  position: null,                // {lat, lon}, validado y con unidades explícitas
  fields: [],                   // [{label, value, unit}], texto seguro
  assetIds: [],                  // sólo IDs del manifiesto admitido
};
```

- `createDossierState(context)` devuelve `{context, generation:0, visibility:'summary', closedFor:null, suspended:false}`.
- `reduceDossier(state,event)` admite select `{context, explicit}`, refresh `{context}`, close, reopen, expand, collapse, suspend `{value}`, media-result `{key,generation,assetIds}`. Cambiar key incrementa generation; refresh nunca reclama nueva selección. `media-result` sólo acepta key/generation actuales. closedFor se conserva al refrescar el mismo key. suspend no borra visibility.
- `connectDossierSources({viewer,dataManager,mapStackController,cctv,onContext})` devuelve `{destroy}`; onContext recibe `{type:'select'|'refresh',context,explicit}`. Fuentes sin coordenadas conservan null. Ningún callback mueve cámara o activa capas.
- `mountEyeDossier({host,model,onAction,motion,signal})` devuelve `{update,open,close,suspend,destroy}`. `update(event)` reduce el modelo y actualiza sólo nodos cambiados. onAction recibe `{type,contextKey}` y el shell resuelve los comandos existentes.
- `isMediaAllowed(asset)` valida ruta local y registro de licencia/crédito/identidad/hash. `mountEyeMedia({host,resolveAsset,reducedMotion,signal})` devuelve `{setContext,pause,destroy}`; setContext recibe `{key,generation,assetIds}` y descarta completamientos obsoletos.
- `createActivityState()` devuelve `{tasks:[],history:[]}`. `reduceActivity(state,event)` admite upsert `{task}`, dismiss `{taskId}`, reset. Cada task tiene `taskId,ownerKey,attempt,status,label,unit,loaded,total,safeError,canRetry,canCancel,updatedAt`. `status`: idle/loading/ready/partial/error/cancelled/blocked. history conserva sólo terminales hasta 40.
- `activityProgress(task)` devuelve `{mode:'determinate',value,max,unit}` sólo con total positivo finito, loaded finito en [0,total] y unidad explícita; si no, `{mode:'indeterminate'}`. No transformar pendingCount en porcentaje.
- `createRetryGate()` devuelve `{run(key,fn),destroy}`. run es función NO async que devuelve la misma Promise mientras ese key esté en vuelo; tras settled permite siguiente intento. destroy cancela intentos propios vía signal y descarta resultados.
- `connectActivitySources({viewer,dataManager,mapStackController,cctv,onEvent})` devuelve `{retry(taskId),cancel(taskId),destroy}`. Reintentos no soportados devuelven false. No parchea fetch global.
- `mountEyeActivity({host,onRetry,onCancel,motion,signal})` devuelve `{update,open,close,suspend,destroy}`. update recibe snapshot del modelo; apertura/cierre no cambia trabajos del manager.

## 3. Secuencia implementable

### T0 — Preparación y baseline

**Archivos:** leer los documentos anteriores y package.json; generar evidencia nueva en `output/eyeinsky-p3/` del worktree de ejecución. Sin cambios a src todavía.
**Produce:** manifiesto de base, respaldo verificado, baseline de pruebas y layout, registro de modelo efectivo.

- [ ] Confirmar orden de construir y un preflight exitoso de `claude-opus-5`; is_error=false y modelUsage contiene el modelo solicitado. No `opusplan`, alias móvil ni fallback silencioso.
- [ ] Crear worktree aislado según WORKFLOW; copiar estos documentos sin reemplazar código previo. Registrar branch, HEAD, estado y PID del único escritor.
- [ ] Respaldar archivos rastreados y cambios relevantes no secretos en ZIP con SHA-256; comprobar lectura de cada entrada. No incluir `.env`, credenciales o node_modules.
- [ ] Ejecutar `npm ci` en el worktree nuevo; no usar node_modules de otro árbol. Ejecutar `npm test`, `npm run build`, `npm run check:boundaries`, `npm run format:check`.
- [ ] Abrir preview nueva en 4198 sólo si está libre; conservar 4197. Medir GPU/viewport/DPR/capas y geometrías de inspector, Ayuda y créditos en los cinco tamaños de T6.
- [ ] Guardar baseline de las rutas USGS, vuelo/cabina y ambas vistas limpias. Un proveedor caído se registra por separado; no confundirlo con fallo del harness.

Gate: base exacta y cero fallos nuevos de preparación. Una baseline histórica no reemplaza esta medición. No commitear automáticamente.

### T1 — Modelo de contexto y carriles de selección

**Crear:** `src/ui/eyeinskyDossierModel.js`, `src/ui/eyeinskyDossierModel.test.mjs`, `src/ui/eyeinskyDossierSources.js`, `src/ui/eyeinskyDossierSources.test.mjs`.
**Leer:** contextStore.js, tracking.js de flights/military/satellites, trackedReadout.js y CCTV controls/presentation.
**Consume:** APIs existentes de la tabla; **produce:** contratos de dossier de §2 sin DOM ni Cesium nuevo.

- [ ] RED: tests de cierre persistente, A→B→respuesta A, datos faltantes, aviso de expulsión frente a clear deliberado y eventos de tracking anteriores al store.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDossierState, reduceDossier } from './eyeinskyDossierModel.js';
test('cerrar sobrevive al refresh y medios viejos no cambian B', () => {
  const a = {key:'flights:fixture-a', title:'Fixture A', assetIds:[]};
  const b = {key:'flights:fixture-b', title:'Fixture B', assetIds:[]};
  let state = createDossierState(a);
  state = reduceDossier(state, {type:'close'});
  state = reduceDossier(state, {type:'refresh', context:a});
  assert.equal(state.visibility, 'closed');
  state = reduceDossier(state, {type:'select', context:b, explicit:true});
  const current = state;
  state = reduceDossier(state, {type:'media-result', key:a.key, generation:0, assetIds:['old']});
  assert.deepEqual(state, current);
  assert.equal(state.context.key, b.key);
  assert.equal(state.visibility, 'summary');
});
```

- [ ] Ejecutar `node --test src/ui/eyeinskyDossierModel.test.mjs src/ui/eyeinskyDossierSources.test.mjs`; preservar RED por comportamiento/imports aún no implementados, no por un comando inexistente.
- [ ] GREEN: implementar reducer inmutable; adaptar USGS, registro de contexto, tracking y CCTV. Para evento anterior al store: capturar key/generation, queueMicrotask, releer el registro y comprobar que coincide. No escribir el contexto para corregir el orden.
- [ ] Mock de onContext registra un sólo select para B tras dos eventos A/B síncronos; snapshot inicial vacío produce vista Tierra; refresh de cámara/fotograma no selecciona otro objetivo.
- [ ] Ejecutar tests otra vez y el grupo de contexto/tracking relevante mediante `npm test` antes de cerrar el lote si se tocaron dueños. Refactor sólo dentro de los módulos nuevos.

Gate: observadores destruidos no publican; sin cambio de selección autoritativa ni movimiento de cámara provocado por refresh.

### T2 — Expediente visual y acciones preservadas

**Crear:** `src/ui/eyeinskyDossier.js`, primera sección de `scripts/eyeinsky-p3.mjs`.
**Modificar:** `src/ui/eyeinskyShell.js`, `src/ui/templates/eyeinsky.html`, `src/ui/styles/eyeinsky.css`.
**Consume:** T1, `UiLifetime`, motion y acciones reales del shell. **Produce:** interfaz `mountEyeDossier` y pruebas de navegador.

- [ ] RED en navegador: tras inicio sin capas, `#eye-inspector` visible, contexto Vista Tierra y foco fuera del panel; selección USGS cambia ID; cerrar + refresh conserva cierre; Instrumentos reabre. Registrar fallos antes de sustituir inspect.
- [ ] Extraer render de inspect a módulo; mantener resolución de entidad, camera/restore/operaciones en shell. No mover toda la lógica del archivo grande ni cambiar sus APIs públicas sin motivo.
- [ ] Integrar vista inicial, contexto mínimo de otros tipos y jerarquía del spec. Usar textContent y creación de nodos; nunca innerHTML con datos externos.
- [ ] Colocar una brújula/posición interactiva con alternativa textual, accionada por Norte/centrar del shell. No generar historial si no hay muestras numéricas reales. Detalles opcionales no desplazan el foco al actualizar.
- [ ] Montar hoja móvil y límites de escritorio. Conservar controls/credits accesibles y evitar duplicar la rail nativa. Acciones que dependen de un dueño ausente muestran explicación y no botón ejecutable.
- [ ] Actualizar Home para volver a vista sin desactivar capas/seguimiento fuera de su contrato previo. Guardar operación y share siguen pasando por `publicView`; expediente no serializa fotos, errores o notas privadas.
- [ ] GREEN de DOM: title/ID correcto, texto/targets, click de fuente seguro, close/open, datos ausentes, teclado y retorno de foco. Mantener 4197 intacto.

Gate: globo recibe rueda/drag fuera de panel; ningún panel invisible recibe foco. No aceptar sólo una captura de maqueta.

### T3 — Fotos verificadas y slider accesible

**Crear:** `src/ui/eyeinskyMedia.js`, `src/ui/eyeinskyMedia.test.mjs`, `src/ui/eyeinskyMediaManifest.js`, `docs/eyeinsky/p3/ASSET-LEDGER.md`, derivados admitidos dentro de `public/eyeinsky/media/p3/`.
**Modificar:** montaje dossier y estilos de T2, script P3.
**Consume:** assetIds/key/generation de T1 y un manifiesto curado. **Produce:** interfaz `mountEyeMedia` sin bloquear datos.

- [ ] RED para manifiesto incompleto, URL peligrosa, imagen rota, siguiente imagen tardía, pausa por foco y reduced-motion.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isMediaAllowed } from './eyeinskyMedia.js';
test('sin derechos verificables o URL ejecutable no hay imagen', () => {
  assert.equal(isMediaAllowed({id:'fixture', src:'javascript:alert(1)'}), false);
  assert.equal(isMediaAllowed({id:'fixture', src:'/eyeinsky/media/p3/a.webp'}), false);
});
```

- [ ] Ejecutar `node --test src/ui/eyeinskyMedia.test.mjs` y preservar RED.
- [ ] Curar dos fotografías Tierra, verificar página del activo y términos, escribir ledger con procedencia/crédito/permiso y hash medido. Si no hay dos admisibles, registrar gate de curación incompleto; no reemplazar por IA ni por una afirmación de «dominio público» sin prueba.
- [ ] Implementar slider manual por defecto y reproducción opt-in; cancelar recursos/generación anterior, reservar ratio, imagen actual y precarga de una sola siguiente. Límites y pausa del spec.
- [ ] GREEN: bloquear un recurso en Puppeteer; selección/foco/acciones continúan. Sin red mantiene texto y estado sin foto. Verificar créditos y asociación contextual: Tierra no se ofrece como foto de un vuelo.

Gate: medios aprobados o entrega declarada parcial por derechos; no cerrar P3 pleno si se omitió silenciosamente slider/curación requerida.

### T4 — Modelo y adaptadores de actividad

**Crear:** `src/ui/eyeinskyActivityModel.js`, `src/ui/eyeinskyActivityModel.test.mjs`, `src/ui/eyeinskyActivitySources.js`, `src/ui/eyeinskyActivitySources.test.mjs`.
**Leer:** lifecycle.js, loadingFeedback.js, maps/controller.js, scene.js, CCTV controls/presentation.
**Consume:** callbacks/snapshots existentes; **produce:** contratos Activity y Retry de §2.

- [ ] RED: total desconocido, guía no error, geometría parcial vs stream, intento sustituido, cancelación, terminal antiguo, doble retry, historial limitado y snapshot inicial.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { activityProgress, createRetryGate } from './eyeinskyActivityModel.js';
test('sin denominador fiable no dibuja porcentaje', () => {
  assert.deepEqual(activityProgress({loaded:4,total:null,unit:'tiles'}), {mode:'indeterminate'});
  assert.deepEqual(activityProgress({loaded:2,total:4,unit:'cameras-geometry'}),
    {mode:'determinate',value:2,max:4,unit:'cameras-geometry'});
});
test('doble clic comparte un solo intento', async () => {
  const gate = createRetryGate();
  let calls = 0;
  let finish;
  const run = () => { calls++; return new Promise(resolve => { finish=resolve; }); };
  const a = gate.run('layer:fixture', run);
  const b = gate.run('layer:fixture', run);
  assert.equal(a, b);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(true);
  await a;
  gate.destroy();
});
```

- [ ] Ejecutar `node --test src/ui/eyeinskyActivityModel.test.mjs src/ui/eyeinskyActivitySources.test.mjs`.
- [ ] GREEN: separar taskId por ownerKey/attempt. Para refresh manager conservar refreshEpoch cuando exista. Tomar getAll/getState explícitos al montar; CCTV subscribe ya entrega snapshot.
- [ ] Usar aggregateLayerLoading sin cambiar lifecycle. Distinguir refresh/switch/geometry/frame; mismos estados repetidos son no-op. Limitar historia a 40 y no persistir.
- [ ] Conectar mapa actual y carga de terreno mediante eventos públicos verificados de la versión Cesium instalada; no alcanzar propiedades privadas del controller. Mapas silenciosos al arrancar requieren snapshot, no un evento histórico inventado.
- [ ] Implementar retry vía refreshLayer y setStack acotados a identidad/intento. No ofrecer cancel sin señal propia real. Nuevo stack, apagado de capa o destroy invalidan retry anterior. Nunca deshabilitar/recrear capa como «retry genérico».
- [ ] GREEN adverso: la resolución tardía de A no sustituye B; no convertir cancel en error; mantener datos parciales y configuración.

Gate: conectores no arrancan trabajo por observar; no filtran secretos ni inventan disponibilidad de feeds.

### T5 — Cápsula de actividad, foco y Vista limpia

**Crear:** `src/ui/eyeinskyActivity.js`.
**Modificar:** shell/template/CSS de T2 y script P3.
**Consume:** T4 y política responsive de T2. **Produce:** actividad bajo Ayuda con detalle, historial accionable y restore.

- [ ] RED navegador: cápsula bajo Ayuda sin intersección con búsqueda; apertura por clic/tacto/teclado; actividad no activa capas; Escape regresa foco; dos rutas de Vista limpia ocultan superficies nuevas.
- [ ] Implementar cápsula resumida, popup no modal y lista con fuente/fase/edad/resultado/acción. Desconocidos sin porcentaje y errores textuales seguros, sin stack/query string.
- [ ] Visual de historial real: cada marca seleccionable expande su evento y comparte accesibilidad con la lista. Sin eventos mostrar «Sin actividad registrada», no barras decorativas simuladas.
- [ ] Integrar exclusión de expandidos móvil y suspensión por workspace; preservar estado exacto de dossier y actividad durante limpieza, incluyendo slider pausado.
- [ ] Conservar ShellFeedback como canal de avisos críticos; capsule sólo resumen y detalle voluntario. No repetir aria-live en dos superficies para la misma transición ni anunciar cada frame.
- [ ] GREEN con retry doble clic y capa desactivada durante petición. Comprobar computed opacity/transform al cerrar/reabrir a media transición, no sólo hidden/inert.

Gate: atribuciones clicables por hit-test, sin solapes de texto/hit targets y sin timers permanentes añadidos en reposo.

### T6 — Integración, regresiones y entrega local

**Crear/ampliar:** `scripts/eyeinsky-p3.mjs`, evidencia separada `output/eyeinsky-p3/`, recap de entrega.
**Modificar únicamente donde el contrato cambió:** `scripts/eyeinsky-p012.mjs`, `scripts/eyeinsky-camera-adverse.mjs`. Reusar `scripts/eyeinsky-p012-cockpit.mjs`.
**Consume:** todos los lotes; **produce:** candidato comprobable, no despliegue.

- [ ] El script P3 recibe URL como argv[2] y directorio de salida OBLIGATORIO como argv[3]. Rechazar directorio que ya contiene result.json, para no sobrescribir evidencia anterior.
- [ ] Parametrizar URL de camera-adverse como argv[3], conservar argv[2] como output y 4197 como default compatible. Su versión inspeccionada tiene 4197 hardcodeado: sin este cambio probaría el producto anterior, no el candidato de 4198.
- [ ] Adaptar expectativas de inspector/Home de P012 a la ficha de vista propuesta, conservando identidad, undo rápido, foco, rueda y render. Registrar cada aserción ajustada y su razón. No rebajar 44px ni eliminar pruebas de navegación.
- [ ] Ejecutar los comandos de la siguiente sección y matriz de aceptación. Guardar exit codes, logs, renderer, viewport, conjunto de datos y rutas de capturas.
- [ ] Congelar candidato; auditor Opus 5 en sesión distinta revisa una vez. Supervisor repite gates pertinentes por sí mismo; puede reutilizar logs sólo si coteja ejecución/rutas/hash. No basarse en el «terminé» del agente.
- [ ] Reparar hallazgos bloqueantes con el MISMO escritor/hilo. Repetir pruebas afectadas y smoke integrado, no lanzar otra auditoría general por detalles cosméticos.
- [ ] Entregar preview nueva, recap, límites reales/fixtures y pendientes de Alex. No afirmar teléfono físico, paridad universal o rendimiento mejorado sin pruebas.

## 4. Comandos de verificación futura

Desde el NUEVO worktree de ejecución, después de npm ci. OUT es un directorio nuevo por corrida; los comandos se ejecutan uno por intención. Estas líneas NO se ejecutaron durante planificación.

```bash
npm test
npm run build
npm run check:boundaries
npm run format:check
npm exec --yes --package typescript@5.9.3 -- tsc --noEmit -p tsconfig.eyeinsky-immersive.json
node scripts/eyeinsky-p3.mjs http://127.0.0.1:4198/ output/eyeinsky-p3/final/p3
node scripts/eyeinsky-p012.mjs http://127.0.0.1:4198/ output/eyeinsky-p3/final/p012
node scripts/eyeinsky-camera-adverse.mjs output/eyeinsky-p3/final/camera http://127.0.0.1:4198/
node scripts/eyeinsky-p012-cockpit.mjs http://127.0.0.1:4198/ output/eyeinsky-p3/final/cockpit.json
```

El comando TypeScript usa versión fijada fuera de package.json porque no existe dependencia TS declarada; requiere descarga si no está en caché. No modificar dependencias para fingir que el gate existía. El alcance del tsconfig es motion TS, no toda la aplicación.

Los scripts browser se ejecutan secuencialmente para no contaminar medición GPU. `npm test` emite varios resúmenes TAP; sumar todos con código, no quedarse con el último. Baseline histórica de P0–P2: 4194 pass / 0 fail / 10 skipped; no usar como total esperado fijo después de añadir tests.

## 5. Matriz de aceptación P3

| ID | Criterio observable | Lote |
|---|---|---|
| P3-01 | Ficha Tierra abierta al inicio, sin capas añadidas ni foco robado | T1/T2 |
| P3-02 | USGS conserva ID/datos/selección/guardar contexto | T1/T2 |
| P3-03 | Vuelo/tracking/CCTV conservan identidad y controles; carriles sin carreras | T1/T2 |
| P3-04 | A→B, respuesta tardía A, refresh mismo ID y expulsión resueltos | T1/T3 |
| P3-05 | Cerrar/reabrir/Home/workspace conservan intención y foco | T2/T5 |
| P3-06 | Medios rotos/offline no bloquean ficha; slider pausa/reduced-motion | T3 |
| P3-07 | Dos fotos Tierra curadas, créditos/licencia/hash y fidelidad correctos | T3 |
| P3-08 | Carga de capa/mapa/geometría/frame diferenciada, sin falso porcentaje | T4/T5 |
| P3-09 | Partial/error/blocked/cancel y retry single-flight conservan datos | T4/T5 |
| P3-10 | Ambas vistas limpias, Escape y restauración exacta; superficies ocultas sin foco | T2/T5 |
| P3-11 | Cinco viewports, 13/14px, 44px, contraste y créditos hit-test | T2/T5/T6 |
| P3-12 | Visuales de brújula/historial responden a datos/acciones reales | T2/T5 |
| P3-13 | Cámara interrumpible, cabina/Home/Undo sin regresión, un viewer | T6 |
| P3-14 | Listeners/timers/medios liberados y sin polling decorativo nuevo | T1/T3/T4/T6 |
| P3-15 | Build/tests/boundaries/formato/types con logs propios y candidato estable | T6 |

Viewports: 1920×1080, 1440×900, 390×844, 360×800, 844×390. Añadir zoom 200%, teclado, offline, media 404 y reduced-motion. Identificar pruebas sintéticas. Hacer al menos un recorrido con fuente pública real disponible; indisponibilidad externa se documenta, no se sustituye por «live» de fixture.

## 6. Riesgos, rollback y salida

Riesgos prioritarios: eventos antes del store; foco tardío; esquema de progreso heterogéneo; mapa ready distinto de teselas; derechos de fotografías; baseline browser apuntando al puerto viejo. Cada uno tiene test/gate arriba.

Rollback: conservar el worktree 4197 y checkpoint intactos. Si el candidato falla, detener sólo el nuevo servidor/escritor identificado y volver a usar la preview anterior; no reset/clean del árbol principal. La integración o commit requiere orden adicional, con listado explícito de archivos. Nada de cherry-pick de piezas incompletas.

Secuencia de hitos: T0→T1→T2 (primer corte visible)→T3→T4→T5→T6 (entrega P3). Un único constructor puede trabajar estos lotes en la misma sesión con checkpoints; sólo se reanuda por ID exacto. Estimación heredada del maestro: 3–5 jornadas netas como orientación, NO promesa de tiempo de modelo o fecha. Recalibrar al finalizar T0.

Pendientes externos reales a la fecha de este plan: saldo para Opus 5, orden de construir, aceptación estética de P2/P3 por Alex. No se sustituyó el modelo solicitado ni se inició un constructor.
