import test from 'node:test';
import assert from 'node:assert/strict';
import { setTextIfChanged } from './domText.js';

test('setTextIfChanged does not mutate an unchanged telemetry sink', () => {
  let writes = 0;
  const sink = {
    _text: '18.00° / -92.00°',
    get textContent() {
      return this._text;
    },
    set textContent(value) {
      writes += 1;
      this._text = value;
    },
  };

  assert.equal(setTextIfChanged(sink, '18.00° / -92.00°'), false);
  assert.equal(writes, 0, 'an equal 4 Hz sample must produce no DOM write');
  assert.equal(setTextIfChanged(sink, '18.01° / -92.00°'), true);
  assert.equal(writes, 1);
});
