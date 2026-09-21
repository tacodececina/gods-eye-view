# EYEINSKY P4 — Satélites 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One writer owns the P4 worktree; reviewers are read-only.

**Goal:** añadir satélites 3D cercanos y verificables sobre la capa satelital existente, conservando una sola identidad NORAD, la propagación SGP4, los puntos globales, la cámara, el expediente P3 y todos los recorridos P0–P3.

**Architecture:** la capa `satellites` sigue siendo la única autoridad orbital y de selección. Un normalizador común convierte TLE y OMM en registros orbitales canónicos; un registro curado resuelve geometría específica/familia/genérica; un visualizador subordinado materializa como máximo dos modelos cercanos y nunca posee cámara, tracking ni contexto.

**Tech Stack:** ESM JavaScript, Cesium, `satellite.js` 6.x, Vite, `node:test`, Puppeteer y scripts existentes. Sin framework UI, renderer ni dependencia orbital nuevos.

**Spec:** `docs/superpowers/plans/2026-09-18-eyeinsky-universo-plan-maestro.md`, sección P4; estado resumido en `docs/eyeinsky/FASES.md`.

## Global Constraints

- P4 únicamente: no Tierra–Luna P5, superficie lunar P6, migración de renderer, compra de activos ni deployment.
- Base funcional: P0–P3 ya aceptadas; globo, navegación, cámara, expediente, actividad, cabina, modo limpio y atribuciones no pueden degradarse.
- `viewer`, `viewer.trackedEntity`, `_trackedNorad`, contextStore y eventos `gev:awareness-subject-*` siguen teniendo un solo dueño: la capa satelital existente.
- Posición y órbita son SGP4. SGP4 no entrega actitud física; cualquier orientación visual se rotula `actitud aproximada` y nunca se expone como telemetría.
- Puntos globales siempre disponibles. Presupuesto inicial: máximo 2 modelos, contando cargas pendientes; el objetivo seguido tiene prioridad.
- Recursos locales solamente. Cada GLB requiere fuente, autor/contribuidor, términos, fidelidad, escala/ejes, bytes y SHA-256 medidos antes de entrar al manifiesto.
- Sin logos NASA, insinuación de patrocinio ni material de terceros no identificado. Reconocer NASA como fuente conforme a sus guías.
- No secretos en cliente, documentación, logs o URLs. No leer ni versionar `.env`, cachés de proveedores o credenciales.
- RED→GREEN por tarea. Una prueba que llama `trackById` no acredita picking real.
- Evidencia nueva e inmutable bajo `output/eyeinsky-p4/`; los scripts deben rechazar un directorio que ya contenga `result.json`.
- No iniciar implementación hasta autorización separada de Alex.

---

## 1. Contratos actuales que P4 debe preservar

- `src/layers/satellites/index.js`: `createSatellitesLayer({services, source})` compone una sola instancia con estado privado.
- `src/layers/satellites/source.js`: `readGroup(group,{signal})` consume `/api/celestrak/<group>`.
- `src/layers/satellites/ingestion.js`: reconstruye catálogo y puntos; un fallo total conserva catálogo/selección anteriores y un fallo parcial conserva el estado degradado.
- `src/layers/satellites/orbits.js`: `parseTLE`, `propagatePosition` y `computeOrbitPath` son la ruta orbital vigente.
- `src/layers/satellites/interaction.js`: el `PointPrimitive.id` NORAD es el propietario actual del pick.
- `src/layers/satellites/tracking.js`: posición compartida por frame, entidad seguida, cámara, contexto y awareness usan el mismo NORAD y la misma muestra SGP4.
- `src/layers/satellites/lifecycle.js`: enable/disable/destroy son dueños de listeners, cargas y primitivas de la capa.
- `src/ui/eyeinskyDossierSources.js`: el expediente P3 observa los eventos públicos y reconcilia A→B en microtarea.
- `src/layers/flights/rendering.js`: referencia existente para cargas GLB con generación, presupuesto, histeresis y destrucción; P4 reutiliza el patrón, no sus caps de 150/350.
- `scripts/package-boundaries.json`: todo módulo satelital nuevo debe añadirse al paquete `satellites-layer`.

## 2. Interfaces P4 fijadas

### 2.1 Registro orbital canónico

Crear `src/layers/satellites/elements.js`:

```js
export function parseSatelliteElements({
  format,       // 'tle' | 'omm'
  body,         // string TLE o array/JSON OMM ya decodificable
  group,
  fetchedAt,
  cacheStatus,  // 'HIT' | 'MISS' | 'STALE-ERROR' | 'NONE'
  now = Date.now(),
}) {
  // [{ noradId, name, satrec, group, elementFormat,
  //    elementEpochMs, fetchedAt, cacheStatus, stale }]
}

export function normalizeNoradId(value) {
  // entero seguro > 0 o null; jamás truncar decimales
}

export function elementEpochMs(satrec) {
  // epochyr/epochdays -> UTC ms, validado
}
```

Reglas:

- TLE legado usa `twoline2satrec`; OMM JSON usa `json2satrec` de `satellite.js`.
- `noradId` permanece entero seguro; un ID OMM de seis dígitos se conserva exactamente.
- La caducidad se calcula desde la época orbital, no desde `fetchedAt` ni desde el TTL de caché.
- `STALE-ERROR` se conserva como procedencia degradada aunque la órbita todavía sea propagable.
- Alpha-5 no se convierte a un número inventado; si no puede normalizarse sin ambigüedad, el registro se rechaza y el TLE legado continúa por su ruta soportada.

### 2.2 Registro de geometría

Crear `src/layers/satellites/modelRegistry.js`:

```js
export function validateSatelliteModelAsset(asset) {
  // {ok, reason}; exige URI local, hash sha256, bytes, fuente,
  // términos, crédito, escala/ejes y fidelidad válida.
}

export function resolveSatelliteModel({ noradId, group, name }, assets) {
  // precedencia exacta: specific > family > generic > null
}
```

Descriptor mínimo:

```js
{
  id: 'nasa-iss-a',
  uri: '/models/satellites/iss-a.glb',
  fidelity: 'specific',
  noradIds: [25544],
  families: [],
  scaleMeters: 1,
  modelForwardAxis: '+X',
  modelUpAxis: '+Z',
  sourceUrl: 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/International%20Space%20Station%20%28ISS%29%20%28A%29/International%20Space%20Station%20%28ISS%29%20%28A%29.glb',
  sourceRevision: '11ebb4ee043715aefbba6aeec8a61746fad67fa7',
  creator: 'NASA 3D Resources contributor',
  termsUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  credit: 'Source: NASA 3D Resources',
  bytes: 39708,
  sha256: '70d0619a69312a45cbf740ba9a491fad854e10226dc5936c213fb1f93f063678',
  verifiedAt: '2026-09-20'
}
```

Los dos candidatos fijados para curación son:

1. Específico ISS, NORAD 25544: `3D Models/International Space Station (ISS) (A)/International Space Station (ISS) (A).glb`, 39,708 bytes y SHA-256 `70d0619a69312a45cbf740ba9a491fad854e10226dc5936c213fb1f93f063678` en la revisión NASA fijada.
2. Familia CubeSat 1U: `3D Models/CubeSat - 1 RU Generic/CubeSat - 1 RU Generic.glb`, 149,424 bytes y SHA-256 `bae308ea2e33778c93675909f7dc2e0d5d6916cd685668a463566c61224b1e85` en la misma revisión.

Las rutas y tamaños son candidatos de preflight, no autorización automática. T0 debe descargar desde la revisión fijada, validar GLB, medir hash/escala/ejes y revisar que no haya material de terceros o marcas restrictivas. Si alguno falla, se detiene el gate de curación; no se sustituye por IA ni por una malla aleatoria.

### 2.3 Visualizador subordinado

Crear `src/layers/satellites/models.js`:

```js
export function createSatelliteModels({
  viewer,
  state,
  resolveAsset,
  registry,
  now = () => performance.now(),
}) {
  return {
    reconcile({ cameraPosition, trackedNorad }),
    release(noradId),
    getStats(), // {active, pending, failed, ids}
    destroy(),
  };
}
```

Reglas:

- Cap duro `active + pending <= 2`.
- Prioridad 1: objetivo seguido elegible. Prioridad 2: contacto elegible más cercano y visible.
- ADD/KEEP separados; los umbrales finales se calibran en T3 contra la GPU/escena medida, no se copian de vuelos.
- `Cesium.Model.fromGltfAsync` carga el visual con `allowPicking:false`; el punto conserva el pick y la identidad.
- Load 404/corrupto/obsoleto conserva punto, órbita, `_trackedEntity`, expediente y cámara.
- Cada load captura generación de lifecycle + identidad + revisión de catálogo. Un resultado tardío que ya no coincide se destruye sin entrar a escena.
- Salir de distancia, cambiar objetivo, deshabilitar o destruir evicta el modelo y libera recursos.
- Orientación usa posición/velocidad SGP4 sólo como pose visual aproximada. Si la base es degenerada, mantener orientación neutral; nunca bloquear posición.

---

## 3. File Structure

**Create**

- `src/layers/satellites/elements.js` — normalización TLE/OMM, identidad, época y caducidad.
- `src/layers/satellites/elements.test.mjs` — fixtures TLE/OMM, seis dígitos y errores.
- `src/layers/satellites/modelRegistry.js` — validación/resolución de activos.
- `src/layers/satellites/modelRegistry.test.mjs` — precedencia y derechos.
- `src/layers/satellites/models.js` — LOD, carga, pose, presupuesto y evicción.
- `src/layers/satellites/models.test.mjs` — generación, cap, fallos y destroy.
- `public/models/satellites/iss-a.glb` — activo específico curado, sólo si T0 pasa.
- `public/models/satellites/cubesat-1u.glb` — activo de familia curado, sólo si T0 pasa.
- `public/models/satellites/manifest.json` — ledger publicable con hashes/derechos/escala/ejes.
- `scripts/eyeinsky-p4.mjs` — recorrido real de navegador y evidencia.
- `docs/eyeinsky/p4/ASSET-LEDGER.md` — evidencia de procedencia y transformaciones.
- `docs/eyeinsky/p4/BUILD-BRIEF.md` — brief autocontenido para el único constructor.

**Modify**

- `src/data/spaceProviderRequests.js` — URL GP por formato TLE/OMM.
- `server/providers/space/celestrak.js` — caché/validación por `group + format`, metadatos públicos seguros.
- `src/layers/satellites/source.js` — solicitar formato y devolver body/cache/fetchedAt sin secretos.
- `src/layers/satellites/ingestion.js` — usar registros canónicos sin romper degradación/selección.
- `src/layers/satellites/state.js` — estado de modelos y revisiones.
- `src/layers/satellites/index.js` — componer `models` sin crear otra capa.
- `src/layers/satellites/rendering.js` — reconciliar modelos desde el preRender existente.
- `src/layers/satellites/tracking.js` — normalización estricta y metadatos P4 del contexto.
- `src/layers/satellites/lifecycle.js` — abort/evicción/destroy de modelos.
- `src/layers/satellites/policy.js` — cap y bandas calibradas documentadas.
- `src/layers/satellites/testing.js` — seams mínimos para comprobar lifecycle, no APIs de producción falsas.
- `src/tooling/spaceProviders.test.mjs` — proxy TLE/OMM, cache key y serve-stale.
- `src/data/satellitesTrackedRefresh.test.mjs` — identidad/cámara sobreviven a refresh y fallo GLB.
- `src/ui/eyeinskyDossierSources.test.mjs` — formato, época, fidelidad y actitud aproximada.
- `scripts/package-boundaries.json` — declarar `elements.js`, `modelRegistry.js` y `models.js`.
- `docs/eyeinsky/FASES.md` y `EYEINSKY-SESSION.md` — actualizar sólo al aceptar P4.

---

### Task 0: Freeze baseline and curate the two candidate assets

**Objective:** crear un worktree P4 desde el `main` que contenga P0–P3, medir baseline y admitir únicamente dos GLB verificables.

**Files:**
- Create: `docs/eyeinsky/p4/ASSET-LEDGER.md`
- Create: `public/models/satellites/manifest.json`
- Create only after validation: the two GLB paths listed above

**Interfaces:**
- Consumes: commit integrado P0–P3.
- Produces: manifest immutable consumed by Task 2.

- [ ] **Step 1: create isolated worktree and baseline manifest**

Run from the main clone after integration:

```bash
git fetch origin
git worktree add C:/Users/Alex/orca/eyeinsky-p4 -b eyeinsky/p4-satellites-3d origin/main
```

Record `git rev-parse HEAD`, `git status --porcelain`, Node/npm versions, Chrome renderer, viewport/DPR and enabled layers under a fresh `output/eyeinsky-p4/baseline/`.

- [ ] **Step 2: download exact revision candidates to a scratch directory**

Use GitHub raw URLs pinned to `11ebb4ee043715aefbba6aeec8a61746fad67fa7`; do not download `master`. Verify HTTP 200 and expected byte counts 39,708 and 149,424 before copying into `public/models/satellites/`.

- [ ] **Step 3: validate GLB structure, bounds, axes and hashes**

Use the project’s existing GLB readers/tests as reference. Write `manifest.json` with measured values. SHA fields must be actual 64-hex digests, not the literal examples in this plan.

- [ ] **Step 4: verify rights and attribution**

Cite the pinned NASA repository and NASA usage guidelines. Record any third-party contributor disclosed by the asset metadata. Do not include insignia/logo usage or imply endorsement.

- [ ] **Step 5: run baseline gates**

```bash
npm ci
npm test
npm run build
npm run check:boundaries
npm run format:check
```

Expected: all commands exit 0 before product edits. If curación or baseline fails, stop P4 and preserve evidence.

- [ ] **Step 6: commit**

```bash
git add docs/eyeinsky/p4/ASSET-LEDGER.md public/models/satellites/
git commit -m "chore(eyeinsky): curate P4 satellite assets"
```

---

### Task 1: Normalize OMM and legacy TLE with explicit epoch

**Objective:** feed both formats into one canonical orbital record without truncating identity or confusing cache age with element age.

**Files:**
- Create: `src/layers/satellites/elements.js`
- Create: `src/layers/satellites/elements.test.mjs`
- Modify: `src/data/spaceProviderRequests.js`
- Modify: `server/providers/space/celestrak.js`
- Modify: `src/layers/satellites/source.js`
- Modify: `src/layers/satellites/ingestion.js`
- Test: `src/tooling/spaceProviders.test.mjs`

**Interfaces:**
- Consumes: `twoline2satrec`, `json2satrec`.
- Produces: `parseSatelliteElements` canonical entries from §2.1.

- [ ] **Step 1: write failing element tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNoradId,
  parseSatelliteElements,
} from './elements.js';

test('preserves a six-digit OMM identity and epoch', () => {
  const body = JSON.stringify([{
    OBJECT_NAME: 'P4 FIXTURE',
    NORAD_CAT_ID: '123456',
    EPOCH: '2026-09-20T12:00:00.000000',
    MEAN_MOTION: '15.5',
    ECCENTRICITY: '0.0001',
    INCLINATION: '51.6',
    RA_OF_ASC_NODE: '10',
    ARG_OF_PERICENTER: '20',
    MEAN_ANOMALY: '30',
    BSTAR: '0',
    EPHEMERIS_TYPE: '0',
    CLASSIFICATION_TYPE: 'U',
    ELEMENT_SET_NO: '1',
    REV_AT_EPOCH: '1',
  }]);
  const [entry] = parseSatelliteElements({
    format: 'omm', body, group: 'stations',
    fetchedAt: Date.parse('2026-09-20T12:05:00Z'),
    cacheStatus: 'MISS', now: Date.parse('2026-09-20T12:05:00Z'),
  });
  assert.equal(entry.noradId, 123456);
  assert.equal(entry.elementFormat, 'omm');
  assert.equal(entry.elementEpochMs, Date.parse('2026-09-20T12:00:00Z'));
});

test('rejects decimal or unsafe identities instead of truncating', () => {
  assert.equal(normalizeNoradId('25544.9'), null);
  assert.equal(normalizeNoradId(Number.MAX_SAFE_INTEGER + 1), null);
});
```

- [ ] **Step 2: run RED**

```bash
node --test src/layers/satellites/elements.test.mjs
```

Expected: FAIL because `elements.js` does not exist.

- [ ] **Step 3: implement minimal normalizer and format-aware proxy/source**

Add `celestrakGpUrl(group,{format})`; keep `celestrakTleUrl(group)` as a backward-compatible wrapper. Cache and single-flight keys are `${group}:${format}`. Validate TLE as TLE and OMM as a nonempty JSON array; return only safe cache status/fetched timestamp headers.

- [ ] **Step 4: preserve ingestion degradation semantics**

Rebuild catalog from canonical entries. A total source failure keeps existing catalog/selection. A partial failure marks degradation. Dedup remains NORAD-first and the most-specific configured group wins.

- [ ] **Step 5: run GREEN and provider regression**

```bash
node --test src/layers/satellites/elements.test.mjs
node --test src/tooling/spaceProviders.test.mjs
node --test src/layers/satellites/source.test.mjs
```

Expected: all pass; include TLE legacy and `STALE-ERROR` cases.

- [ ] **Step 6: commit**

```bash
git add src/layers/satellites/elements.js src/layers/satellites/elements.test.mjs src/data/spaceProviderRequests.js server/providers/space/celestrak.js src/layers/satellites/source.js src/layers/satellites/ingestion.js src/tooling/spaceProviders.test.mjs
git commit -m "feat(eyeinsky): normalize satellite OMM and TLE elements"
```

---

### Task 2: Validate and resolve satellite geometry

**Objective:** provide deterministic specific/family/generic/null resolution from the curated manifest.

**Files:**
- Create: `src/layers/satellites/modelRegistry.js`
- Create: `src/layers/satellites/modelRegistry.test.mjs`
- Modify: `scripts/package-boundaries.json`

**Interfaces:**
- Consumes: public manifest from Task 0.
- Produces: `validateSatelliteModelAsset`, `resolveSatelliteModel`.

- [ ] **Step 1: write failing registry tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSatelliteModel } from './modelRegistry.js';

const sha = 'a'.repeat(64);
const base = {
  uri: '/models/satellites/cubesat-1u.glb',
  sourceUrl: 'https://github.com/nasa/NASA-3D-Resources',
  termsUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  credit: 'Source: NASA 3D Resources',
  bytes: 149424,
  sha256: sha,
  scaleMeters: 1,
  modelForwardAxis: '+X',
  modelUpAxis: '+Z',
};

test('specific beats family and never crosses NORAD identities', () => {
  const assets = [
    {...base, id:'family', fidelity:'family', families:['stations']},
    {...base, id:'iss', fidelity:'specific', noradIds:[25544]},
  ];
  assert.equal(resolveSatelliteModel({noradId:25544, group:'stations'}, assets).id, 'iss');
  assert.equal(resolveSatelliteModel({noradId:25545, group:'stations'}, assets).id, 'family');
});
```

- [ ] **Step 2: run RED**

```bash
node --test src/layers/satellites/modelRegistry.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: implement exact validation and precedence**

Reject nonlocal URIs, incomplete rights, non-64-hex hashes, nonpositive bytes/scale, contradictory axes and specific descriptors without exact NORAD IDs. `generic` is optional; `null` is valid and means point-only.

- [ ] **Step 4: run GREEN and boundaries**

```bash
node --test src/layers/satellites/modelRegistry.test.mjs
npm run check:boundaries
```

Expected: pass; package boundary lists the new module.

- [ ] **Step 5: commit**

```bash
git add src/layers/satellites/modelRegistry.js src/layers/satellites/modelRegistry.test.mjs scripts/package-boundaries.json
git commit -m "feat(eyeinsky): resolve curated satellite geometry"
```

---

### Task 3: Add bounded near-field models and eviction

**Objective:** show no more than two subordinate 3D models without changing the global point layer or selection authority.

**Files:**
- Create: `src/layers/satellites/models.js`
- Create: `src/layers/satellites/models.test.mjs`
- Modify: `src/layers/satellites/state.js`
- Modify: `src/layers/satellites/index.js`
- Modify: `src/layers/satellites/rendering.js`
- Modify: `src/layers/satellites/lifecycle.js`
- Modify: `src/layers/satellites/policy.js`
- Modify: `src/layers/satellites/testing.js`
- Modify: `scripts/package-boundaries.json`

**Interfaces:**
- Consumes: canonical catalog records and registry matches.
- Produces: `createSatelliteModels` from §2.3.

- [ ] **Step 1: write failing lifecycle tests**

Tests must cover: cap counts pending; tracked priority; ADD/KEEP hysteresis; A→B invalidates late A; 404/decode keeps point; release/destroy leaves `active=0,pending=0`; stale catalog revision cannot attach a model.

- [ ] **Step 2: run RED**

```bash
node --test src/layers/satellites/models.test.mjs
```

Expected: FAIL because `models.js` does not exist.

- [ ] **Step 3: implement model lifecycle with injected loader**

The production loader wraps `Cesium.Model.fromGltfAsync`. Tests inject a deferred loader and fake primitive collection. Do not patch global fetch. Count a request before awaiting it; admission fails when `active + pending === 2`.

- [ ] **Step 4: integrate into the existing preRender and lifecycle**

`rendering._preRenderTick` calls one bounded reconcile; it does not add another RAF. Disable/destroy abort generations and remove every owned model. The point collection remains mounted and visible.

- [ ] **Step 5: implement approximate pose safely**

Use the current propagated position plus velocity direction to create a visual quaternion respecting each asset’s axis descriptor. Degenerate velocity produces neutral orientation. Expose only the label `attitude: 'approximate'`.

- [ ] **Step 6: run GREEN and leak regression**

```bash
node --test src/layers/satellites/models.test.mjs
node --test src/data/satellitesVisibility.test.mjs src/data/satellitesTrackedRefresh.test.mjs
npm run check:boundaries
```

Expected: all pass; late loads after destroy are destroyed and never inserted.

- [ ] **Step 7: commit**

```bash
git add src/layers/satellites/models.js src/layers/satellites/models.test.mjs src/layers/satellites/state.js src/layers/satellites/index.js src/layers/satellites/rendering.js src/layers/satellites/lifecycle.js src/layers/satellites/policy.js src/layers/satellites/testing.js scripts/package-boundaries.json
git commit -m "feat(eyeinsky): render bounded near-field satellite models"
```

---

### Task 4: Preserve tracking and enrich the P3 dossier

**Objective:** retain one NORAD/camera/context identity while surfacing format, epoch, staleness and geometry fidelity honestly.

**Files:**
- Modify: `src/layers/satellites/tracking.js`
- Test: `src/data/satellitesTrackedRefresh.test.mjs`
- Test: `src/ui/eyeinskyDossierSources.test.mjs`
- Test: `src/layers/satellites/models.test.mjs`

**Interfaces:**
- Consumes: canonical element metadata and registry match.
- Produces: existing awareness/context event shape enriched with flat safe fields.

- [ ] **Step 1: write failing identity tests**

Cover GLB 404, OMM refresh, late old model, stale epoch and explicit A→B selection. Assert exact `gevTrackedId`, `selectedSatTrackingId`, `viewer.trackedEntity`, context stable ID and dossier title before and after each condition.

- [ ] **Step 2: run RED**

```bash
node --test src/data/satellitesTrackedRefresh.test.mjs src/ui/eyeinskyDossierSources.test.mjs src/layers/satellites/models.test.mjs
```

Expected: new metadata assertions fail against the pre-P4 implementation.

- [ ] **Step 3: tighten identity and publish honest metadata**

Replace `_normalizeTrackedNorad` truncation with `normalizeNoradId`. Add flat properties `elementFormat`, `elementEpoch`, `elementAge`, `geometryFidelity`, `attitude='approximate'` and separate `fetchedAt`; do not present local context refresh as provider observation.

- [ ] **Step 4: run GREEN**

Run the same command. Expected: all pass and old TLE tracking behavior remains green.

- [ ] **Step 5: commit**

```bash
git add src/layers/satellites/tracking.js src/data/satellitesTrackedRefresh.test.mjs src/ui/eyeinskyDossierSources.test.mjs src/layers/satellites/models.test.mjs
git commit -m "feat(eyeinsky): expose honest satellite model provenance"
```

---

### Task 5: Prove P4 in the real browser

**Objective:** exercise real picking, LOD, failures and responsive behavior on the built application.

**Files:**
- Create: `scripts/eyeinsky-p4.mjs`

**Interfaces:**
- Consumes: URL at argv[2], fresh output directory at argv[3].
- Produces: `result.json`, screenshots, renderer/viewport evidence and exact pick identity.

- [ ] **Step 1: write the browser harness before accepting visuals**

The harness must:

1. Load a declared OMM fixture with NORAD 123456.
2. Activate satellites and prove global points remain.
3. Approach until models appear; assert `active + pending <= 2` continuously.
4. Pick an isolated contact with a real pointer event; record coordinates, event-time owner and resulting NORAD.
5. Verify specific ISS and family CubeSat labels separately.
6. Follow target and assert dossier/camera identity remains exact.
7. Change target and prove eviction.
8. Intercept one GLB with 404 and one with corrupt bytes; assert point/orbit/tracking/dossier persist.
9. Exercise stale epoch and source outage.
10. Interrupt camera manually, use Home, reduced-motion, five approved viewports and 200% zoom via `Emulation.setPageScaleFactor`; assert `visualViewport.scale`.
11. Fail if output already contains `result.json`.

- [ ] **Step 2: run the P4 harness against a fresh build**

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4199
node scripts/eyeinsky-p4.mjs http://127.0.0.1:4199/ output/eyeinsky-p4/p4-green
```

Expected: script exit 0, no page errors, exact identities recorded and all checks pass. A direct `trackById` route is fixture setup only and cannot count as the picking assertion.

- [ ] **Step 3: commit**

```bash
git add scripts/eyeinsky-p4.mjs
git commit -m "test(eyeinsky): cover P4 satellite model journeys"
```

---

### Task 6: Run full regression, performance comparison and handoff

**Objective:** accept P4 only after fresh unit, build, boundary, format and P0–P4 browser evidence from the exact source tree.

**Files:**
- Create: `docs/eyeinsky/p4/BUILD-BRIEF.md`
- Modify after acceptance: `docs/eyeinsky/FASES.md`
- Modify after acceptance: `EYEINSKY-SESSION.md`

**Interfaces:**
- Consumes: all P4 tasks.
- Produces: immutable acceptance artifacts and reanudación P5-ready; no P5 implementation.

- [ ] **Step 1: run static gates**

```bash
npm test
npm run build
npm run check:boundaries
npm run format:check
```

Expected: exit 0. Aggregate every TAP/spec footer programmatically; require nonzero totals.

- [ ] **Step 2: run browser gates sequentially into fresh directories**

```bash
node scripts/eyeinsky-p4.mjs http://127.0.0.1:4199/ output/eyeinsky-p4/final/p4
node scripts/eyeinsky-p3.mjs http://127.0.0.1:4199/ output/eyeinsky-p4/final/p3
node scripts/eyeinsky-p012.mjs http://127.0.0.1:4199/ output/eyeinsky-p4/final/p012
node scripts/eyeinsky-camera-adverse.mjs output/eyeinsky-p4/final/camera http://127.0.0.1:4199/
node scripts/eyeinsky-p012-cockpit.mjs http://127.0.0.1:4199/ output/eyeinsky-p4/final/cockpit.json
```

Expected: every process exits 0. Distinguish live provider evidence from fixtures.

- [ ] **Step 3: compare performance with the same renderer, viewport and layers**

```bash
node scripts/eyeinsky-p012-performance.mjs http://127.0.0.1:4199/ output/eyeinsky-p4/perf/before.json output/eyeinsky-p4/perf/after.json output/eyeinsky-p4/perf/comparison.json
```

Run baseline and candidate with satellites plus the same non-satellite layers loaded. Record native GPU vs software renderer, cold load vs settled idle, Cesium scene frames vs RAF callbacks, DOM writes and model/pending peaks. Do not invent a percentage threshold before the baseline exists.

- [ ] **Step 4: independent review and one directed repair cycle**

A fresh read-only reviewer checks P4 criteria below. The supervisor reproduces blockers and runs all affected gates. Cosmetic/nonblocking findings are deferred rather than opening an unlimited audit loop.

- [ ] **Step 5: update status only after supervisor acceptance**

Mark P4 complete in `docs/eyeinsky/FASES.md` and `EYEINSKY-SESSION.md`; name exact evidence paths and real limits. Do not start P5.

- [ ] **Step 6: commit final evidence documentation**

```bash
git add docs/eyeinsky/p4 docs/eyeinsky/FASES.md EYEINSKY-SESSION.md
git commit -m "docs(eyeinsky): accept P4 satellite models"
```

---

## 4. Acceptance Matrix

- [ ] P4-01: TLE legado y OMM JSON convergen en un registro canónico sin truncar NORAD.
- [ ] P4-02: un NORAD OMM de seis dígitos se selecciona, comparte, restaura y sigue exactamente.
- [ ] P4-03: formato, época orbital, consulta, caché degradada y caducidad son campos distintos.
- [ ] P4-04: posición/orbita siguen siendo SGP4; actitud derivada aparece sólo como aproximada.
- [ ] P4-05: ISS específico y CubeSat de familia tienen fuente, términos, escala, ejes, bytes y SHA-256 medidos.
- [ ] P4-06: precedencia `specific > family > generic > null` es determinista y no usa coincidencia de nombre para identidad específica.
- [ ] P4-07: puntos globales permanecen visibles y pickables con modelos activos.
- [ ] P4-08: nunca existen más de dos `active + pending`; tracked tiene prioridad y la histeresis evita thrashing.
- [ ] P4-09: 404, corrupto, no autorizado o load tardío no cambia NORAD, punto, órbita, cámara, expediente ni tracking.
- [ ] P4-10: cambio de objetivo, alejamiento, disable y destroy liberan modelos, pending, listeners y primitivas.
- [ ] P4-11: recorrido P4 registra pick real, owner, coordenadas, GPU, LOD y fallos de asset.
- [ ] P4-12: P0–P3, cámara adversa y cabina continúan verdes.
- [ ] P4-13: responsive, reduced-motion, interrupción manual, atribuciones y zoom 200% permanecen operativos.
- [ ] P4-14: rendimiento se compara con escena/capas/renderer equivalentes; no se acepta evidencia de escena vacía o SwiftShader como GPU física.
- [ ] P4-15: tests, build, boundaries y formato pasan sobre el árbol exacto aceptado.

## 5. Risks and rollback

- Elementos recién consultados pueden contener una época vieja; `MISS` no significa órbita reciente.
- TLE no resuelve por sí solo todos los catálogos modernos; OMM es la ruta de seis dígitos.
- Un GLB pickable puede robar `scene.pick`; P4 usa `allowPicking:false` y conserva el punto.
- Modelos que cargan tras una evicción pueden reentrar; generación + revisión de catálogo deben invalidarlos y destruirlos.
- SGP4 no es actitud. Una pose convincente visualmente puede ser científicamente falsa si no se rotula.
- La licencia MIT del repositorio no cubre automáticamente activos NASA/terceros; el ledger viaja con cada archivo.
- La fuente NASA fijada puede cambiar en el futuro; la revisión, hash y copia local hacen la entrega reproducible.
- Si un modelo falla, rollback funcional es punto/órbita existentes, no ocultar el satélite.
- Si P4 rompe P0–P3, conservar worktree y rama; no mergear, no resetear el checkpoint integrado.

Plan preparado el 2026-09-20. No autoriza ni inicia implementación P4.