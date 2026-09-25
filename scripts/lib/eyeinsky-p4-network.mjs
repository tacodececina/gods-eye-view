/**
 * Costuras de red del recorrido P4 (dominio Fetch de CDP con patrones): se
 * inyectan registros OMM de prueba en la respuesta REAL del proxy CelesTrak,
 * se fuerzan fallos de GLB (404, bytes corruptos) y se tumba la fuente.
 *
 * Todo lo inyectado es un fixture rotulado como tal (nombre «P4 FIXTURE»):
 * nunca se presenta como dato vivo. El resto de peticiones sigue intacto.
 */

import { json2satrec, propagate } from 'satellite.js';

export const FIXTURE_NORAD = 123456;
export const STALE_FIXTURE_NORAD = 123457;
export const DECAY_FIXTURE_NORAD = 123458;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Elementos de un CubeSat con arrastre extremo: SGP4 lo da por reentrado. */
const DECAY_ELEMENTS = Object.freeze({
  MEAN_MOTION: 16.3,
  ECCENTRICITY: 0.0005,
  BSTAR: 0.5,
  MEAN_MOTION_DOT: 0,
  MEAN_MOTION_DDOT: 0,
});
/** Margen tras el fallo en el que SGP4 debe seguir sin posición. */
const DECAY_CHECK_WINDOW_MIN = 15;

/** Época OMM de CelesTrak (UTC, sin zona, microsegundos). */
function ommEpoch(ms) {
  return new Date(ms).toISOString().replace('Z', '000');
}

/**
 * Registro OMM derivado de uno real (misma forma que el proxy entrega),
 * con otro NORAD, otro nombre y otra época.
 */
function fixtureFrom(base, { norad, name, epochMs, meanAnomalyShift = 40 }) {
  return {
    ...base,
    OBJECT_NAME: name,
    OBJECT_ID: `2026-P4${String(norad).slice(-3)}A`,
    NORAD_CAT_ID: norad,
    EPOCH: ommEpoch(epochMs),
    MEAN_ANOMALY: (Number(base.MEAN_ANOMALY) + meanAnomalyShift) % 360,
    // Sin arrastre: la propagación desde una época vieja sigue siendo estable.
    BSTAR: 0,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  };
}

/** Fixture OMM 123456 (6 dígitos, vigente) en `stations`, nombrado como la ISS. */
export function sixDigitFixture(stations, nowMs = Date.now()) {
  const iss = stations.find((row) => row.NORAD_CAT_ID === 25544);
  if (!iss) throw new Error('el proxy no devolvió la ISS en stations');
  return fixtureFrom(iss, {
    norad: FIXTURE_NORAD,
    // Contiene el nombre de la ISS: la identidad del modelo nunca es por nombre.
    name: 'P4 FIXTURE ISS (ZARYA) 123456',
    epochMs: nowMs - 3_600_000,
  });
}

/** Fixture OMM de CubeSat con época de hace 60 días (órbita caducada). */
export function staleCubesatFixture(cubesat, nowMs = Date.now()) {
  const base = cubesat.find((row) => Number(row.MEAN_MOTION) > 14);
  if (!base) throw new Error('el proxy no devolvió CubeSats en LEO');
  return fixtureFrom(base, {
    norad: STALE_FIXTURE_NORAD,
    name: 'P4 FIXTURE CUBESAT CADUCADO',
    epochMs: nowMs - 60 * DAY_MS,
    meanAnomalyShift: 90,
  });
}

const sgp4Fails = (satrec, epochMs, minutes) => {
  const sample = propagate(
    { ...satrec },
    new Date(epochMs + minutes * MINUTE_MS),
  );
  return !sample?.position;
};

/**
 * Minutos desde la época en que SGP4 deja de dar posición para `row`
 * (bisección a 1 s). Lanza si el fallo no es estable después: el arnés no
 * puede depender de una ventana de fallo intermitente.
 */
export function sgp4FailureMinutes(row) {
  const satrec = json2satrec(row);
  const epochMs = Date.parse(`${row.EPOCH}Z`.replace(/0{3}Z$/, 'Z'));
  let ok = 0;
  let fail = 60;
  if (sgp4Fails(satrec, epochMs, ok) || !sgp4Fails(satrec, epochMs, fail))
    throw new Error('el fixture de propagación no falla dentro de 60 min');
  while (fail - ok > 1 / 60) {
    const mid = (ok + fail) / 2;
    if (sgp4Fails(satrec, epochMs, mid)) fail = mid;
    else ok = mid;
  }
  for (let m = fail; m <= fail + DECAY_CHECK_WINDOW_MIN; m += 0.5)
    if (!sgp4Fails(satrec, epochMs, m))
      throw new Error(`SGP4 vuelve a propagar a los ${m} min`);
  return fail;
}

/**
 * Fixture OMM 123458 del grupo cubesat (familia CUBESAT 1U) con elementos
 * VIGENTES que SGP4 deja de propagar en `failAtMs` (P4-20, «propagación
 * falló»). No es un dato vivo: nombre «P4 FIXTURE».
 */
export function decayingCubesatFixture(cubesat, failAtMs) {
  const base = cubesat.find((row) => Number(row.MEAN_MOTION) > 14);
  if (!base) throw new Error('el proxy no devolvió CubeSats en LEO');
  const probe = {
    ...fixtureFrom(base, {
      norad: DECAY_FIXTURE_NORAD,
      name: 'P4 FIXTURE CUBESAT SGP4 FALLA',
      epochMs: failAtMs,
    }),
    ...DECAY_ELEMENTS,
  };
  const failMs = Math.round(sgp4FailureMinutes(probe) * MINUTE_MS);
  return { ...probe, EPOCH: ommEpoch(failAtMs - failMs) };
}

/** Reglas mutables de la intercepción, compartidas por todas las páginas. */
export function createNetworkRules({ baseUrl }) {
  return {
    origin: new URL(baseUrl).origin,
    injectFixtures: false,
    abortCelestrak: false,
    // ms tras servir cubesat en que el fixture 123458 deja de propagar (null: no se inyecta).
    decayLeadMs: null,
    glbFaults: new Map(),
    log: [],
    fixtures: {},
  };
}

const PROXY_HEADERS = ['content-type', 'x-tle-cache', 'x-tle-fetched-at'];

const toHeaders = (object) =>
  Object.entries(object).map(([name, value]) => ({
    name,
    value: String(value),
  }));

/** El fixture 123458 sólo si la página lo pidió; anota cuándo falla. */
function decayExtra(rules, rows, now) {
  if (!Number.isFinite(rules.decayLeadMs)) return [];
  rules.decayFailAtMs = now + rules.decayLeadMs;
  return [decayingCubesatFixture(rows, rules.decayFailAtMs)];
}

const PROXY_FETCH_ATTEMPTS = 3;
const PROXY_RETRY_DELAY_MS = 400;

/**
 * Lectura Node→proxy de la respuesta REAL (la que recibe los fixtures). Un
 * fallo de CONEXIÓN se reintenta: bajo carga Windows devolvió `connect
 * ETIMEDOUT 127.0.0.1:4204` a los ~300 ms y la página quedaba sin el fixture
 * (p. ej. 123458, P4-20). Cada reintento queda en `log`; una respuesta HTTP,
 * aunque sea 5xx, no se reintenta: es un resultado del proxy.
 */
export async function fetchProxyWithRetry(
  url,
  {
    fetchImpl = globalThis.fetch,
    log = [],
    attempts = PROXY_FETCH_ATTEMPTS,
    delayMs = PROXY_RETRY_DELAY_MS,
  } = {},
) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchImpl(url);
    } catch (error) {
      if (attempt >= attempts) throw error;
      log.push({
        kind: 'proxy-retry',
        url: String(url),
        attempt,
        code: error?.cause?.code ?? null,
        error: String(error?.cause ?? error),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** Respuesta real del proxy + registros de fixture añadidos al final. */
async function fulfillWithFixtures(client, event, rules, group) {
  const upstream = await fetchProxyWithRetry(event.request.url, {
    log: rules.log,
  });
  const rows = await upstream.json();
  const now = Date.now();
  const extra =
    group === 'stations'
      ? [sixDigitFixture(rows, now)]
      : [staleCubesatFixture(rows, now), ...decayExtra(rules, rows, now)];
  rules.fixtures[group] = extra;
  const headers = {};
  for (const name of PROXY_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  rules.log.push({
    kind: 'fixture',
    group,
    norads: extra.map((row) => row.NORAD_CAT_ID),
  });
  await client.send('Fetch.fulfillRequest', {
    requestId: event.requestId,
    responseCode: upstream.status,
    responseHeaders: toHeaders(headers),
    body: Buffer.from(JSON.stringify([...rows, ...extra])).toString('base64'),
  });
}

/** 404 o bytes que no son glTF para un GLB concreto. */
async function fulfillGlbFault(client, event, rules, fault) {
  rules.log.push({ kind: `glb-${fault}`, url: event.request.url });
  if (fault === '404') {
    await client.send('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode: 404,
      responseHeaders: toHeaders({ 'content-type': 'text/plain' }),
      body: Buffer.from('Not Found').toString('base64'),
    });
    return;
  }
  // 200 con cabecera GLB y cuerpo basura: el fallo es del parser.
  const body = Buffer.alloc(4096, 0x5a);
  body.write('glTF', 0, 'ascii');
  await client.send('Fetch.fulfillRequest', {
    requestId: event.requestId,
    responseCode: 200,
    responseHeaders: toHeaders({ 'content-type': 'model/gltf-binary' }),
    body: body.toString('base64'),
  });
}

function glbFaultFor(rules, pathname) {
  for (const [needle, fault] of rules.glbFaults)
    if (pathname.includes(needle)) return fault;
  return null;
}

async function handlePaused(client, event, rules) {
  const { pathname, search } = new URL(event.request.url);
  const requestId = event.requestId;
  if (pathname.startsWith('/api/celestrak/')) {
    if (rules.abortCelestrak) {
      rules.log.push({ kind: 'abort', url: event.request.url });
      return client.send('Fetch.failRequest', {
        requestId,
        errorReason: 'ConnectionRefused',
      });
    }
    const group = pathname.split('/').pop();
    const json = /FORMAT=json/i.test(search);
    if (rules.injectFixtures && json && ['stations', 'cubesat'].includes(group))
      return fulfillWithFixtures(client, event, rules, group);
  }
  const fault = pathname.endsWith('.glb') ? glbFaultFor(rules, pathname) : null;
  if (fault) return fulfillGlbFault(client, event, rules, fault);
  return client.send('Fetch.continueRequest', { requestId });
}

/**
 * Instala la intercepción en una página, antes de navegar. Usa el dominio
 * Fetch de CDP con patrones: SÓLO se pausan /api/celestrak/* y los GLB
 * satelitales, así los miles de teselas no hacen cola en este proceso (con
 * setRequestInterception global la carga del GLB y del decodificador Draco
 * llegaba a pasar de 20 s).
 */
export async function installInterception(page, rules) {
  const client = await page.createCDPSession();
  client.on('Fetch.requestPaused', (event) => {
    void handlePaused(client, event, rules).catch((error) => {
      rules.log.push({
        kind: 'error',
        url: event.request.url,
        error: String(error),
      });
      void client
        .send('Fetch.continueRequest', { requestId: event.requestId })
        .catch(() => {});
    });
  });
  await client.send('Fetch.enable', {
    patterns: [
      {
        urlPattern: `${rules.origin}/api/celestrak/*`,
        requestStage: 'Request',
      },
      {
        urlPattern: `${rules.origin}/models/satellites/*.glb`,
        requestStage: 'Request',
      },
    ],
  });
  return client;
}
