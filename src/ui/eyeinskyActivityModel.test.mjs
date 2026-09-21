import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_HISTORY_LIMIT,
  activityProgress,
  createActivityState,
  createRetryGate,
  normalizeTask,
  reduceActivity,
  safeErrorText,
  taskFromLayerLoading,
} from './eyeinskyActivityModel.js';

test('sin denominador fiable no dibuja porcentaje', () => {
  assert.deepEqual(activityProgress({ loaded: 4, total: null, unit: 'tiles' }), {
    mode: 'indeterminate',
  });
  assert.deepEqual(
    activityProgress({ loaded: 2, total: 4, unit: 'cameras-geometry' }),
    { mode: 'determinate', value: 2, max: 4, unit: 'cameras-geometry' },
  );
});

test('doble clic comparte un solo intento', async () => {
  const gate = createRetryGate();
  let calls = 0;
  let finish;
  const run = () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const a = gate.run('layer:fixture', run);
  const b = gate.run('layer:fixture', run);
  assert.equal(a, b);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(true);
  await a;
  gate.destroy();
});

test('un progreso sin unidad declarada no se dibuja como determinado', () => {
  assert.deepEqual(activityProgress({ loaded: 1, total: 4 }), {
    mode: 'indeterminate',
  });
  assert.deepEqual(activityProgress({ loaded: 1, total: 0, unit: 'tiles' }), {
    mode: 'indeterminate',
  });
  assert.deepEqual(
    activityProgress({ loaded: 9, total: 4, unit: 'tiles' }),
    { mode: 'indeterminate' },
    'cargado por encima del total es un contador roto, no un 225 %',
  );
  assert.deepEqual(activityProgress({ loaded: -1, total: 4, unit: 'tiles' }), {
    mode: 'indeterminate',
  });
  assert.deepEqual(activityProgress(null), { mode: 'indeterminate' });
});

test('un recuento de pendientes no se convierte en porcentaje', () => {
  assert.deepEqual(activityProgress({ pendingCount: 3, unit: 'layers' }), {
    mode: 'indeterminate',
  });
});

test('tras terminar, el siguiente intento es nuevo', async () => {
  const gate = createRetryGate();
  let calls = 0;
  const run = () => {
    calls++;
    return Promise.resolve(true);
  };
  await gate.run('layer:a', run);
  await gate.run('layer:a', run);
  assert.equal(calls, 2);
  gate.destroy();
});

test('cada key vuela por separado', () => {
  const gate = createRetryGate();
  const a = gate.run('layer:a', () => new Promise(() => {}));
  const b = gate.run('layer:b', () => new Promise(() => {}));
  assert.notEqual(a, b);
  gate.destroy();
});

test('run no es async: entrega una promesa ya compartida, sin esperar un turno', async () => {
  const gate = createRetryGate();
  // El intento arranca de forma síncrona dentro de run, no en una microtarea:
  // por eso el segundo clic encuentra el vuelo en curso y no abre otro.
  let started = false;
  const first = gate.run('layer:a', () => {
    started = true;
    return Promise.resolve('valor');
  });
  assert.equal(started, true);
  assert.equal(gate.run('layer:a', () => Promise.resolve('otro')), first);
  assert.equal(await first, 'valor', 'el valor del intento llega intacto');
  gate.destroy();
});

test('destruir la compuerta señala cancelación y descarta el resultado', async () => {
  const gate = createRetryGate();
  let seenSignal = null;
  let resolveRun;
  const promise = gate.run('layer:a', ({ signal }) => {
    seenSignal = signal;
    return new Promise((resolve) => {
      resolveRun = resolve;
    });
  });
  assert.equal(seenSignal.aborted, false);
  gate.destroy();
  assert.equal(seenSignal.aborted, true, 'destroy aborta los intentos propios');
  resolveRun('tarde');
  assert.equal(await promise, undefined, 'un resultado tardío se descarta');
});

test('un fallo del intento no deja la key trabada', async () => {
  const gate = createRetryGate();
  await assert.rejects(
    gate.run('layer:a', () => Promise.reject(new Error('caída'))),
    /caída/,
  );
  let calls = 0;
  await gate.run('layer:a', () => {
    calls++;
    return Promise.resolve(true);
  });
  assert.equal(calls, 1, 'tras un fallo la key vuelve a admitir intentos');
  gate.destroy();
});

test('el estado arranca vacío y un upsert no duplica la misma tarea', () => {
  let state = createActivityState();
  assert.deepEqual(state, { tasks: [], history: [] });
  const task = {
    taskId: 'layer:flights#1',
    ownerKey: 'layer:flights',
    attempt: 1,
    status: 'loading',
    label: 'Vuelos',
    updatedAt: 10,
  };
  state = reduceActivity(state, { type: 'upsert', task });
  state = reduceActivity(state, {
    type: 'upsert',
    task: { ...task, loaded: 2, total: 4, unit: 'tiles', updatedAt: 20 },
  });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].loaded, 2);
  assert.equal(state.tasks[0].updatedAt, 20);
});

test('un estado repetido es no-op y no repinta', () => {
  let state = createActivityState();
  const task = {
    taskId: 'layer:a#1',
    ownerKey: 'layer:a',
    attempt: 1,
    status: 'loading',
    label: 'A',
    updatedAt: 5,
  };
  state = reduceActivity(state, { type: 'upsert', task });
  const current = state;
  state = reduceActivity(state, { type: 'upsert', task: { ...task } });
  assert.equal(state, current, 'mismo contenido, misma referencia');
});

test('una tarea terminal sale de activas y queda en el historial', () => {
  let state = createActivityState();
  const base = {
    taskId: 'layer:a#1',
    ownerKey: 'layer:a',
    attempt: 1,
    label: 'A',
  };
  state = reduceActivity(state, {
    type: 'upsert',
    task: { ...base, status: 'loading', updatedAt: 1 },
  });
  state = reduceActivity(state, {
    type: 'upsert',
    task: { ...base, status: 'ready', updatedAt: 2 },
  });
  assert.equal(state.tasks.length, 0, 'lo terminado deja de estar en curso');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].status, 'ready');
});

test('cancelar no es un error y conserva lo ya cargado', () => {
  let state = createActivityState();
  state = reduceActivity(state, {
    type: 'upsert',
    task: {
      taskId: 'layer:a#1',
      ownerKey: 'layer:a',
      attempt: 1,
      status: 'cancelled',
      label: 'A',
      loaded: 3,
      total: 9,
      unit: 'tiles',
      updatedAt: 4,
    },
  });
  const [entry] = state.history;
  assert.equal(entry.status, 'cancelled');
  assert.equal(entry.safeError, null, 'una cancelación no fabrica un error');
  assert.equal(entry.loaded, 3, 'lo descargado no se borra al cancelar');
});

test('una guía de uso no es un fallo', () => {
  const task = taskFromLayerLoading(
    {
      id: 'cctv',
      label: 'CCTV',
      loading: false,
      count: 0,
      error: null,
      unavailable: false,
      keyRequired: false,
      guidance: 'zoom-in',
    },
    { now: 7 },
  );
  assert.equal(task.status, 'blocked');
  assert.equal(task.safeError, null);
  assert.equal(task.canRetry, false, 'no se ofrece reintentar lo que no falló');
});

test('una capa sin clave pide la clave, no un reintento', () => {
  const task = taskFromLayerLoading(
    { id: 'traffic', label: 'Tráfico', keyRequired: true },
    { now: 1 },
  );
  assert.equal(task.status, 'blocked');
  assert.equal(task.canRetry, false);
});

test('un error se muestra saneado, sin stack ni query string', () => {
  const task = taskFromLayerLoading(
    {
      id: 'flights',
      label: 'Vuelos',
      error: new Error(
        'fetch https://api.example.com/v1/state?token=SECRETO falló\n    at doFetch (file:///app/src/x.js:12:9)',
      ),
    },
    { now: 2 },
  );
  assert.equal(task.status, 'error');
  assert.ok(!task.safeError.includes('SECRETO'));
  assert.ok(!task.safeError.includes('token='));
  assert.ok(!task.safeError.includes('at doFetch'));
  assert.ok(task.safeError.length <= 160);
  assert.equal(task.canRetry, true);
});

test('datos incompletos son parciales, no un éxito ni un fallo', () => {
  const task = taskFromLayerLoading(
    { id: 'vessels', label: 'Buques', count: 12, degraded: true },
    { now: 3 },
  );
  assert.equal(task.status, 'partial');
  assert.equal(task.canRetry, true);
});

test('el intento nuevo sustituye al anterior del mismo dueño', () => {
  let state = createActivityState();
  const first = {
    taskId: 'layer:a#1',
    ownerKey: 'layer:a',
    attempt: 1,
    status: 'loading',
    label: 'A',
    updatedAt: 1,
  };
  state = reduceActivity(state, { type: 'upsert', task: first });
  state = reduceActivity(state, {
    type: 'upsert',
    task: { ...first, taskId: 'layer:a#2', attempt: 2, updatedAt: 2 },
  });
  assert.equal(state.tasks.length, 1, 'un dueño tiene un intento en curso');
  assert.equal(state.tasks[0].attempt, 2);
});

test('la respuesta tardía del intento viejo no pisa al nuevo', () => {
  let state = createActivityState();
  const owner = { ownerKey: 'layer:a', label: 'A' };
  state = reduceActivity(state, {
    type: 'upsert',
    task: { ...owner, taskId: 'layer:a#2', attempt: 2, status: 'loading', updatedAt: 5 },
  });
  const current = state;
  state = reduceActivity(state, {
    type: 'upsert',
    task: { ...owner, taskId: 'layer:a#1', attempt: 1, status: 'ready', updatedAt: 6 },
  });
  assert.equal(state, current, 'un intento sustituido ya no publica nada');
});

// REPAIR-1 · Ningún secreto puede viajar dentro del texto que se muestra.
test('el texto de error redacta credenciales en sus formas habituales', () => {
  const sentinels = [
    'Authorization: Bearer SENTINELA_ABC123',
    'authorization=Bearer SENTINELA_ABC123',
    'x-api-key: SENTINELA_ABC123',
    'api_key=SENTINELA_ABC123',
    'apiKey: "SENTINELA_ABC123"',
    'password=SENTINELA_ABC123',
    'token: SENTINELA_ABC123',
    'client_secret=SENTINELA_ABC123',
    'access_token SENTINELA_ABC123',
  ];
  for (const raw of sentinels) {
    const text = safeErrorText(`fallo del proveedor (${raw})`);
    assert.ok(
      !text.includes('SENTINELA_ABC123'),
      `el centinela sobrevivió en: ${text}`,
    );
  }
});

// REPAIR-2 · JSON y valores con espacios: ningún fragmento puede sobrevivir.
test('la redacción alcanza JSON, comillas y valores con espacios', () => {
  const samples = [
    '{"api_key":"SENTINELA_JSON"}',
    "{'apiKey': 'SENTINELA_JSON'}",
    '{"headers":{"Authorization":"Bearer SENTINELA_JSON"}}',
    'password="SENTINELA UNO"',
    "password='SENTINELA UNO'",
    'x-api-key: "SENTINELA UNO"',
    'token = SENTINELA_JSON',
    '{"client_secret":"SENTINELA UNO","retry":true}',
  ];
  for (const raw of samples) {
    const text = safeErrorText(`fallo del proveedor ${raw}`);
    assert.ok(
      !/SENTINELA/.test(text),
      `sobrevivió un fragmento del secreto en: ${text}`,
    );
  }
});

test('la redacción de secretos no borra el mensaje útil', () => {
  const text = safeErrorText('HTTP 503 del proveedor, token=SENTINELA_ABC123');
  assert.ok(text.includes('503'));
  assert.ok(!text.includes('SENTINELA_ABC123'));
});

// REPAIR-1 · Lo inactivo no es trabajo, y un mismo final no se cuenta dos veces.
test('una tarea idle no aparece como trabajo en curso', () => {
  let state = createActivityState();
  state = reduceActivity(state, {
    type: 'upsert',
    task: {
      taskId: 'layer:a#1',
      ownerKey: 'layer:a',
      attempt: 1,
      status: 'idle',
      label: 'A',
      updatedAt: 1,
    },
  });
  assert.equal(state.tasks.length, 0, 'idle no es trabajo en curso');
  assert.equal(state.history.length, 0, 'idle tampoco es un resultado');
});

test('repetir el mismo terminal no duplica el historial', () => {
  let state = createActivityState();
  const task = {
    taskId: 'layer:a#1',
    ownerKey: 'layer:a',
    attempt: 1,
    status: 'ready',
    label: 'A',
    updatedAt: 5,
  };
  state = reduceActivity(state, { type: 'upsert', task });
  state = reduceActivity(state, { type: 'upsert', task: { ...task, updatedAt: 9 } });
  assert.equal(state.history.length, 1, 'el mismo final de un intento es uno solo');
  assert.equal(state.history[0].updatedAt, 9, 'pero se refresca su hora');
});

test('un terminal accionable queda disponible para reintentar', () => {
  let state = createActivityState();
  state = reduceActivity(state, {
    type: 'upsert',
    task: {
      taskId: 'layer:a#1',
      ownerKey: 'layer:a',
      attempt: 1,
      status: 'error',
      label: 'A',
      error: 'caída',
      canRetry: true,
      updatedAt: 5,
    },
  });
  const actionable = state.history.filter((task) => task.canRetry);
  assert.equal(actionable.length, 1, 'un fallo reintentable no puede desaparecer');
  assert.equal(actionable[0].status, 'error');
});

test('el historial se limita y descarta lo más viejo', () => {
  let state = createActivityState();
  for (let i = 0; i < ACTIVITY_HISTORY_LIMIT + 5; i++) {
    state = reduceActivity(state, {
      type: 'upsert',
      task: {
        taskId: `layer:a#${i}`,
        ownerKey: `layer:${i}`,
        attempt: i,
        status: 'ready',
        label: `A${i}`,
        updatedAt: i,
      },
    });
  }
  assert.equal(state.history.length, ACTIVITY_HISTORY_LIMIT);
  assert.equal(state.history[0].label, `A${ACTIVITY_HISTORY_LIMIT + 4}`);
});

test('descartar quita de activas sin inventar un final', () => {
  let state = createActivityState();
  state = reduceActivity(state, {
    type: 'upsert',
    task: {
      taskId: 'layer:a#1',
      ownerKey: 'layer:a',
      attempt: 1,
      status: 'loading',
      label: 'A',
      updatedAt: 1,
    },
  });
  state = reduceActivity(state, { type: 'dismiss', taskId: 'layer:a#1' });
  assert.equal(state.tasks.length, 0);
  assert.equal(state.history.length, 0, 'descartar no simula un resultado');
  assert.equal(reduceActivity(state, { type: 'reset' }).tasks.length, 0);
});

test('una tarea sin identidad se descarta en vez de contaminar el modelo', () => {
  assert.equal(normalizeTask({ ownerKey: 'layer:a' }), null);
  assert.equal(normalizeTask(null), null);
  const state = createActivityState();
  assert.equal(reduceActivity(state, { type: 'upsert', task: null }), state);
});
