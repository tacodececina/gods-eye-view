import test from 'node:test';
import assert from 'node:assert/strict';
import { LayerLifecycle } from './lifecycle.js';
test('opted-in hidden-tab suspension skips requests and preserves the original timestamp', async () => {
  let hidden = false;
  let calls = 0;
  const manager = new LayerLifecycle(
    {},
    { suspendWhenHidden: true, isHidden: () => hidden },
  );
  manager.register({
    id: 'fixture',
    name: 'fixture',
    init() {},
    enable() {},
    disable() {},
    destroy() {},
    update() {
      calls++;
      return true;
    },
    getStats: () => ({ count: 1, lastUpdate: 1700000000000 }),
  });
  try {
    await manager.setEnabled('fixture', true);
    const initial = calls;
    hidden = true;
    assert.equal(await manager.refreshLayer('fixture'), false);
    assert.equal(calls, initial);
    assert.equal(manager.getAll()[0].stats.lastUpdate, 1700000000000);
    hidden = false;
    assert.equal(await manager.refreshLayer('fixture'), true);
    assert.equal(calls, initial + 1);
  } finally {
    await manager.destroyAll();
  }
});
