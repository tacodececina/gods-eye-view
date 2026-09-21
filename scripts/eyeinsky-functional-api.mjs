import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = new URL(process.argv[2] || 'http://127.0.0.1:4197/');
const outputPath = process.argv[3];
if (!outputPath) throw new Error('output path required');

const result = {
  url: baseUrl.href,
  startedAt: new Date().toISOString(),
  probes: {},
};

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 60_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return {
    status: response.status,
    ok: response.ok,
    cache:
      response.headers.get('x-gev-cache') ||
      response.headers.get('x-overpass-cache'),
    upstream: response.headers.get('x-overpass-upstream'),
    body,
  };
}

function summarize(name, response, summarizeBody) {
  const detail = summarizeBody(response.body);
  result.probes[name] = {
    endpoint: detail.endpoint,
    status: response.status,
    ok: response.ok && detail.useful === true,
    cache: response.cache,
    upstream: response.upstream,
    ...detail,
  };
}

async function probe(name, run) {
  try {
    await run();
  } catch (error) {
    result.probes[name] = {
      ok: false,
      error: String(error?.message || error),
    };
  }
}

await probe('launchLibrary', async () => {
  const launches = await request('/api/launches');
  summarize('launchLibrary', launches, (body) => {
    const rows = Array.isArray(body?.results) ? body.results : [];
    const first = rows[0] || null;
    return {
      endpoint: '/api/launches',
      useful: rows.length > 0,
      count: rows.length,
      sample: first
        ? {
            id: first.id,
            name: first.name,
            net: first.net,
            latitude: Number(first.pad?.latitude),
            longitude: Number(first.pad?.longitude),
          }
        : null,
      error: body?.error || null,
    };
  });
});

await probe('transit', async () => {
  const transit = await request('/api/transit/vehicles/mbta');
  summarize('transit', transit, (body) => {
    const rows = Array.isArray(body?.vehicles) ? body.vehicles : [];
    const first = rows.find(
      (row) =>
        (Number.isFinite(row?.lat) && Number.isFinite(row?.lon)) ||
        (Number.isFinite(row?.geometry?.[0]?.lat) &&
          Number.isFinite(row?.geometry?.[0]?.lon)),
    );
    const coordinate = first?.geometry?.[0] || first;
    return {
      endpoint: '/api/transit/vehicles/mbta',
      useful: rows.length > 0 && Boolean(first),
      count: rows.length,
      feedId: body?.feedId || null,
      sample: first
        ? {
            id: first.id,
            latitude: coordinate.lat,
            longitude: coordinate.lon,
            routeId: first.routeId || null,
            timestamp: first.timestamp || null,
          }
        : null,
      error: body?.error || null,
      retryInSec: body?.retryInSec || null,
    };
  });
});

await probe('bikeshare', async () => {
  const gbfsTarget =
    'https://gbfs.bluebikes.com/gbfs/en/station_information.json';
  const bikeshare = await request(
    `/api/gbfs/${encodeURIComponent(gbfsTarget)}`,
  );
  summarize('bikeshare', bikeshare, (body) => {
    const rows = body?.data?.stations || body?.data?.en?.stations || [];
    const first = Array.isArray(rows)
      ? rows.find(
          (row) =>
            Number.isFinite(Number(row?.lat)) &&
            Number.isFinite(Number(row?.lon)),
        )
      : null;
    return {
      endpoint: `/api/gbfs/${encodeURIComponent(gbfsTarget)}`,
      upstreamTarget: gbfsTarget,
      useful: Array.isArray(rows) && rows.length > 0 && Boolean(first),
      count: Array.isArray(rows) ? rows.length : 0,
      sample: first
        ? {
            id: first.station_id,
            name: first.name,
            latitude: Number(first.lat),
            longitude: Number(first.lon),
          }
        : null,
      error: body?.error || null,
    };
  });
});

await probe('overpass', async () => {
  const overpassQuery =
    '[out:json][timeout:12];(way["highway"~"^(motorway|trunk|primary|secondary)$"](19.4272,-99.1459,19.4772,-99.0959););out geom qt;';
  const overpass = await request('/api/overpass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: overpassQuery }),
  });
  summarize('overpass', overpass, (body) => {
    const rows = Array.isArray(body?.elements) ? body.elements : [];
    const first = rows.find(
      (row) =>
        (Number.isFinite(row?.lat) && Number.isFinite(row?.lon)) ||
        (Number.isFinite(row?.geometry?.[0]?.lat) &&
          Number.isFinite(row?.geometry?.[0]?.lon)),
    );
    const coordinate = first?.geometry?.[0] || first;
    return {
      endpoint: '/api/overpass',
      request:
        'traffic caller shape: bounded major-road ways in 19.4272,-99.1459,19.4772,-99.0959',
      useful: rows.length > 0,
      count: rows.length,
      sample: first
        ? {
            id: `${first.type}/${first.id}`,
            name: first.tags?.name || null,
            latitude: coordinate.lat,
            longitude: coordinate.lon,
          }
        : null,
      error: body?.error || body?.remark || null,
    };
  });
});

await probe('cctv', async () => {
  const cctv = await request('/api/cctv/sources');
  summarize('cctv', cctv, (body) => {
    const rows = Array.isArray(body?.sources)
      ? body.sources
      : Array.isArray(body?.cameras)
        ? body.cameras
        : Array.isArray(body)
          ? body
          : [];
    const first = rows.find(
      (row) =>
        Number.isFinite(Number(row?.lat ?? row?.latitude)) &&
        Number.isFinite(Number(row?.lon ?? row?.longitude)),
    );
    return {
      endpoint: '/api/cctv/sources',
      useful: rows.length > 0 && Boolean(first),
      count: rows.length,
      sample: first
        ? {
            id: first.id,
            name: first.name,
            latitude: Number(first.lat ?? first.latitude),
            longitude: Number(first.lon ?? first.longitude),
          }
        : null,
      error: body?.error || null,
    };
  });
});

result.endedAt = new Date().toISOString();
result.status =
  !result.error &&
  Object.keys(result.probes).length === 5 &&
  Object.values(result.probes).every((probe) => probe.ok)
    ? 'pass'
    : 'fail';
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'pass') process.exitCode = 1;
