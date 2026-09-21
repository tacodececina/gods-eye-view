import test from 'node:test';
import assert from 'node:assert/strict';
import eyeinskyConfig from '../../server/standalone/eyeinsky.vite.config.js';

async function resolvedConfig(command = 'serve') {
  const config =
    typeof eyeinskyConfig === 'function'
      ? await eyeinskyConfig({ command, mode: 'test', isSsrBuild: false })
      : eyeinskyConfig;
  return config;
}

test('the EYEINSKY local runtime composes the bounded upstream provider middleware', async () => {
  const config = await resolvedConfig();
  const names = (config.plugins || [])
    .flat(Infinity)
    .map((plugin) => plugin.name);
  for (const name of [
    'adsblol-proxy',
    'celestrak-proxy',
    'radio-browser-proxy',
  ])
    assert.ok(names.includes(name), `missing local provider plugin: ${name}`);
});

test('the static build does not install local provider administration routes', async () => {
  const config = await resolvedConfig('build');
  assert.equal(
    config.define['import.meta.env.VITE_LOCAL_PROVIDER_RUNTIME'],
    'false',
  );
});
