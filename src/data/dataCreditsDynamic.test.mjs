import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerDynamicCredit,
  unregisterDynamicCredit,
} from './dataCredits.js';

function fakeViewer() {
  const credits = [];
  return {
    credits,
    creditDisplay: {
      addStaticCredit: (credit) => credits.push(credit),
      removeStaticCredit: (credit) => {
        const index = credits.indexOf(credit);
        if (index >= 0) credits.splice(index, 1);
      },
    },
  };
}

const CREDIT = { key: 'test-dynamic-credit', html: 'Source: test' };

test('a dynamic credit can be retired and registered again', () => {
  const viewer = fakeViewer();
  assert.equal(registerDynamicCredit(viewer, CREDIT), true);
  assert.equal(registerDynamicCredit(viewer, CREDIT), true, 'idempotent');
  assert.equal(viewer.credits.length, 1);
  assert.equal(unregisterDynamicCredit(viewer, CREDIT), true);
  assert.equal(viewer.credits.length, 0, 'removed from the display');
  assert.equal(unregisterDynamicCredit(viewer, CREDIT), false, 'already gone');
  assert.equal(registerDynamicCredit(viewer, CREDIT), true);
  assert.equal(viewer.credits.length, 1, 'shown again');
  unregisterDynamicCredit(viewer, CREDIT);
});
