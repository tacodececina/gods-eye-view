/**
 * Costura de red P4: la lectura Node→proxy de la respuesta REAL que recibe
 * los fixtures reintenta un fallo de conexión transitorio (Windows devolvió
 * `connect ETIMEDOUT 127.0.0.1:4204` bajo carga y la página del fixture
 * 123458 quedó sin él) y deja cada reintento en el registro de la corrida.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchProxyWithRetry } from './lib/eyeinsky-p4-network.mjs';

const connectError = () =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('connect ETIMEDOUT 127.0.0.1:4204'), {
      code: 'ETIMEDOUT',
    }),
  });

test('reintenta un fallo de conexión y lo registra', async () => {
  const calls = [];
  const log = [];
  const response = { status: 200 };
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length < 3) throw connectError();
    return response;
  };
  const got = await fetchProxyWithRetry('http://x/api/celestrak/cubesat', {
    fetchImpl,
    log,
    delayMs: 0,
  });
  assert.equal(got, response);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    log.map((entry) => [entry.kind, entry.attempt, entry.code]),
    [
      ['proxy-retry', 1, 'ETIMEDOUT'],
      ['proxy-retry', 2, 'ETIMEDOUT'],
    ],
  );
});

test('agota los intentos y propaga el último error', async () => {
  let calls = 0;
  const log = [];
  await assert.rejects(
    fetchProxyWithRetry('http://x/api/celestrak/stations', {
      fetchImpl: async () => {
        calls += 1;
        throw connectError();
      },
      log,
      attempts: 3,
      delayMs: 0,
    }),
    /fetch failed/,
  );
  assert.equal(calls, 3);
  assert.equal(log.length, 2);
});

test('no reintenta una respuesta HTTP (tampoco un 5xx)', async () => {
  let calls = 0;
  const response = { status: 502 };
  const got = await fetchProxyWithRetry('http://x/api/celestrak/cubesat', {
    fetchImpl: async () => {
      calls += 1;
      return response;
    },
    log: [],
    delayMs: 0,
  });
  assert.equal(got, response);
  assert.equal(calls, 1);
});
