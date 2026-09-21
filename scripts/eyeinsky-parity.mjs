import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:4197/';
const target = process.argv[3] || 'output/eyeinsky-parity/browser-parity.json';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const result = {
  url,
  startedAt: new Date().toISOString(),
  kind: 'FUNCTIONAL',
  checks: [],
  errors: [],
  failedRequests: [],
};
const check = (id, ok, detail) =>
  result.checks.push({ id, ok: Boolean(ok), detail });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  page.on('pageerror', (error) => result.errors.push(String(error)));
  page.on('requestfailed', (request) =>
    result.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () =>
      window.__eyeinsky &&
      window.__godsEyeView &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 60000 },
  );
  const snapshot = await page.evaluate(() => {
    window.__eyeinsky.openView('catalog');
    const enabledControls = (id) => {
      const row = document.querySelector(
        `#data-toggles [data-layer-id="${id}"]`,
      );
      return {
        exists: Boolean(row),
        count: row
          ? [...row.querySelectorAll('button,input,select')].filter(
              (control) => !control.disabled,
            ).length
          : 0,
      };
    };
    const app = window.__godsEyeView;
    return {
      flights: enabledControls('flights'),
      satellites: enabledControls('satellites'),
      mediaDisabled: Boolean(
        document.querySelector('#eye-sensor-host fieldset:disabled'),
      ),
      contextDisabled: Boolean(
        document.querySelector('#eye-context-host fieldset:disabled'),
      ),
      mapIds: app.mapStackController.getStacks().map((stack) => stack.id),
      mapChipIds: [...document.querySelectorAll('[data-stack-id]')].map(
        (chip) => chip.dataset.stackId,
      ),
      sceneCount: app.sceneDirector.listScenes().length,
      voiceSession: Boolean(app.voiceCommands?.session),
      providerSettings: Boolean(
        document.querySelector('#key-setup[data-initialized="true"]') &&
        document.querySelector('#key-setup-chip'),
      ),
    };
  });
  result.snapshot = snapshot;
  check('aviation-toggle', snapshot.flights.count > 0, snapshot.flights);
  check('satellite-toggle', snapshot.satellites.count > 0, snapshot.satellites);
  check('media-controls-enabled', !snapshot.mediaDisabled);
  check('context-controls-enabled', !snapshot.contextDisabled);
  check(
    'keyless-map-registry',
    ['esri-imagery', 'osm'].every((id) => snapshot.mapIds.includes(id)),
    snapshot.mapIds,
  );
  check(
    'keyless-map-controls-visible',
    ['esri-imagery', 'osm'].every((id) => snapshot.mapChipIds.includes(id)),
    snapshot.mapChipIds,
  );
  check(
    'built-in-scenes-retained',
    snapshot.sceneCount > 1,
    snapshot.sceneCount,
  );
  check('realtime-voice-controller-retained', snapshot.voiceSession);
  check('local-provider-settings-mounted', snapshot.providerSettings);
  result.routes = [];
  const routeBodies = new Map();
  for (const path of [
    '/api/adsblol/mil',
    '/api/celestrak?GROUP=stations&FORMAT=json',
    '/api/radio',
  ]) {
    const response = await fetch(new URL(path, url), {
      signal: AbortSignal.timeout(25000),
    });
    const text = await response.text();
    const route = {
      path,
      status: response.status,
      contentType: response.headers.get('content-type'),
      bytes: text.length,
      unknownApiRoute:
        response.status === 404 && text.includes('Unknown API route'),
    };
    routeBodies.set(path, text);
    result.routes.push(route);
    check(`route:${path}`, !route.unknownApiRoute, route);
  }
  const liveRoutes = [
    {
      path: '/api/adsblol/mil',
      validate(text) {
        const body = JSON.parse(text);
        const rows = body.ac || body.aircraft;
        return {
          ok: Array.isArray(rows) && rows.length > 0,
          count: Array.isArray(rows) ? rows.length : 0,
          source: 'adsb.lol public military feed',
        };
      },
    },
    {
      path: '/api/celestrak/stations',
      validate(text) {
        const line1 = (text.match(/^1 /gm) || []).length;
        const line2 = (text.match(/^2 /gm) || []).length;
        return {
          ok: line1 > 0 && line1 === line2,
          records: Math.min(line1, line2),
          source: 'CelesTrak TLE stations group',
        };
      },
    },
    {
      path: '/api/radio/stations',
      validate(text) {
        const body = JSON.parse(text);
        const stations = body.stations;
        return {
          ok:
            Array.isArray(stations) &&
            stations.length > 0 &&
            stations.every(
              (station) =>
                station.id &&
                station.name &&
                station.streamUrl?.startsWith('https://'),
            ),
          count: Array.isArray(stations) ? stations.length : 0,
          stale: body.stale,
          degraded: body.degraded,
          source: 'Radio Browser bounded public catalog',
        };
      },
    },
    {
      path: '/api/opensky',
      validate(text) {
        const body = JSON.parse(text);
        return {
          ok: Array.isArray(body.states) && body.states.length > 0,
          count: Array.isArray(body.states) ? body.states.length : 0,
          source: 'OpenSky or the server-owned adsb.lol regional fallback',
        };
      },
    },
    {
      path: '/api/route?profile=car&coords=-99.133200%2C19.432600%3B-99.167700%2C19.427000&steps=1',
      validate(text) {
        const body = JSON.parse(text);
        return {
          ok:
            body.ok === true &&
            Array.isArray(body.geometry) &&
            body.geometry.length >= 2 &&
            Number.isFinite(body.distanceM),
          points: Array.isArray(body.geometry) ? body.geometry.length : 0,
          distanceM: body.distanceM,
          source: 'OSM routing through the bounded local route broker',
        };
      },
    },
  ];
  result.liveRoutes = [];
  for (const spec of liveRoutes) {
    let text = routeBodies.get(spec.path);
    let status = 200;
    if (text === undefined) {
      const response = await fetch(new URL(spec.path, url), {
        signal: AbortSignal.timeout(45000),
      });
      status = response.status;
      text = await response.text();
    }
    let validation;
    try {
      validation = spec.validate(text);
    } catch (error) {
      validation = { ok: false, error: String(error) };
    }
    const detail = {
      path: spec.path,
      status,
      bytes: text.length,
      ...validation,
    };
    result.liveRoutes.push(detail);
    check(`payload:${spec.path}`, status === 200 && validation.ok, detail);
  }
  check('no-page-errors', result.errors.length === 0, result.errors);
  result.status = result.checks.every((entry) => entry.ok) ? 'pass' : 'fail';
} catch (error) {
  result.status = 'error';
  result.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  result.endedAt = new Date().toISOString();
  await browser.close();
  await fs.writeFile(target, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
if (result.status !== 'pass') process.exitCode = 1;
