import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.dirname(uiDir);
const shellPath = path.join(uiDir, 'eyeinskyShell.js');
const shellDir = path.join(uiDir, 'shell');
const SHELL_LINE_CEILING = 800;
const MODULE_LINE_CEILING = 400;

const lineCount = (text) => text.split('\n').length;

async function sourceFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(absolute)));
    else if (/\.(?:js|ts|html)$/.test(entry.name)) found.push(absolute);
  }
  return found;
}

test('the EYEINSKY shell stays a composition root under the line ceiling', async () => {
  const shell = await readFile(shellPath, 'utf8');
  assert.ok(
    lineCount(shell) <= SHELL_LINE_CEILING,
    `eyeinskyShell.js has ${lineCount(shell)} lines`,
  );
});

test('every extracted shell module stays under the module ceiling', async () => {
  const modules = (await readdir(shellDir)).filter((name) =>
    name.endsWith('.js'),
  );
  assert.ok(modules.length > 0, 'src/ui/shell/ holds the extracted modules');
  for (const name of modules) {
    const text = await readFile(path.join(shellDir, name), 'utf8');
    assert.ok(
      lineCount(text) < MODULE_LINE_CEILING,
      `${name} has ${lineCount(text)} lines`,
    );
  }
});

test('no source still carries the dead direct-layer toggle', async () => {
  const offenders = [];
  for (const file of await sourceFiles(srcDir)) {
    const text = await readFile(file, 'utf8');
    if (/data-eye-layer\b|toggleDirectLayer/.test(text))
      offenders.push(path.relative(srcDir, file));
  }
  assert.deepEqual(offenders, []);
});
