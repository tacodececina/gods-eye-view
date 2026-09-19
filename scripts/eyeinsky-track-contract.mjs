import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parseAst } from 'rollup/parseAst';

const file = 'scripts/track-regression.mjs';
const baseline = execFileSync('git', ['show', `0d41b6b:${file}`], { encoding: 'utf8' });
const current = await fs.readFile(file, 'utf8');
function assertions(source) {
  const found = [];
  function clean(node) {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).filter(([key]) => !['start', 'end', 'raw'].includes(key)).map(([key, value]) => [key, clean(value)]));
  }
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['record', 'skip'].includes(node.callee.name)) found.push(clean(node));
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
  }
  walk(parseAst(source));
  return found;
}
const before = assertions(baseline), after = assertions(current);
assert.deepEqual(after, before, 'The tracking harness must retain every original assertion and skip call');
const result = { at: new Date().toISOString(), baseCommit: '0d41b6b', assertionCallSites: before.length, identicalAssertionAST: true, scope: 'record() and skip() calls including conditions and details; only transport/setup additions allowed' };
await fs.writeFile(`${process.env.EYE_OUT || 'output/eyeinsky-phase2'}/track-assertion-integrity.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
