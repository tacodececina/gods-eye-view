import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
export const SERVER_TIMEOUTS = Object.freeze({
  headersTimeout: 15_000,
  requestTimeout: 30_000,
  keepAliveTimeout: 5_000,
});

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
});

export function contentTypeFor(file) {
  return (
    MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
  );
}

function bodyTooLarge(req, maxBodyBytes) {
  const declared = req.headers['content-length'];
  if (declared !== undefined) return Number(declared) > maxBodyBytes;
  // Chunked bodies of unknown size are refused on /api; browsers send a length.
  return Boolean(req.headers['transfer-encoding']);
}

export function installProcessGuards(proc = process, log = console.error) {
  const fail = (kind) => (error) => {
    log(`[eyeinsky] ${kind}:`, error?.message || String(error));
    proc.exit(1);
  };
  proc.on('uncaughtException', fail('uncaught exception'));
  proc.on('unhandledRejection', fail('unhandled rejection'));
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function createMiddlewareStack() {
  const layers = [];
  return {
    use(prefix, handler) {
      if (typeof prefix === 'function') {
        handler = prefix;
        prefix = '/';
      }
      layers.push({ prefix, handler });
    },
    async handle(req, res) {
      let index = 0;
      const next = async () => {
        const layer = layers[index++];
        if (!layer) return;
        const pathname = new URL(req.url || '/', 'http://runtime').pathname;
        if (
          layer.prefix !== '/' &&
          pathname !== layer.prefix &&
          !pathname.startsWith(`${layer.prefix}/`)
        )
          return next();
        const previous = req.url;
        if (layer.prefix !== '/') {
          const suffix = pathname.slice(layer.prefix.length) || '/';
          const query = new URL(req.url || '/', 'http://runtime').search;
          req.url = `${suffix}${query}`;
        }
        let called = false;
        const proceed = async () => {
          called = true;
          await next();
        };
        try {
          const result = layer.handler(req, res, proceed);
          if (result?.then) await result;
          if (called && !res.writableEnded) return;
        } finally {
          req.url = previous;
        }
      };
      await next();
    },
  };
}

function safeAssetPath(dist, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (
    !decoded ||
    decoded.includes('\0') ||
    decoded.split('/').some((part) => part === '..' || part.startsWith('.'))
  )
    return null;
  const candidate = path.resolve(
    dist,
    `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`,
  );
  return candidate === dist || candidate.startsWith(`${dist}${path.sep}`)
    ? candidate
    : null;
}

function staticHandler(dist, createReadStream = fs.createReadStream) {
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(res, 405, { error: 'Method not allowed' });
    if (/(?:^|\/)\.\.(?:\/|$)|%25?2e/i.test(req.url || ''))
      return json(res, 404, { error: 'Not found' });
    const pathname = new URL(req.url || '/', 'http://runtime').pathname;
    const requested = safeAssetPath(dist, pathname);
    if (!requested || pathname.split('/').some((part) => part.startsWith('.')))
      return json(res, 404, { error: 'Not found' });
    let target = requested;
    let isFallback = false;
    try {
      if (!fs.statSync(target).isFile()) throw new Error('not-file');
    } catch {
      target = path.join(dist, 'index.html');
      isFallback = pathname !== '/';
      try {
        if (!fs.statSync(target).isFile()) throw new Error('missing-index');
      } catch {
        return json(res, 404, { error: 'Not found' });
      }
    }
    const headers = {
      'Content-Type': contentTypeFor(target),
      'Cache-Control':
        isFallback || target.endsWith('.html')
          ? 'no-store'
          : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
    };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      return res.end();
    }
    await new Promise((resolve) => {
      const stream = createReadStream(target);
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        res.writeHead(200, headers);
        stream.pipe(res);
      };
      stream.once('error', (error) => {
        console.error('[eyeinsky] static stream failure:', error?.message);
        if (!res.headersSent)
          json(res, 500, { error: 'Internal server error' });
        else res.destroy();
        resolve();
      });
      stream.once('open', start);
      res.once('close', () => {
        stream.destroy();
        resolve();
      });
      res.once('finish', resolve);
    });
  };
}

async function defaultProviders() {
  const { localProviderPlugins } = await import('./providers/local.js');
  return localProviderPlugins().filter(
    (plugin) => plugin.name !== 'gev-key-setup',
  );
}

export function createProductionRuntime({
  dist,
  providers,
  host = '127.0.0.1',
  port = 4173,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  createReadStream,
} = {}) {
  if (!dist) throw new Error('dist is required');
  const stack = createMiddlewareStack();
  let installed = false;
  let activeProviders = providers;
  const runtime = {
    server: http.createServer(async (req, res) => {
      try {
        if (req.url?.split('?')[0] === '/healthz')
          return json(res, 200, { ok: true, service: 'eyeinsky' });
        const isApi = (req.url || '').split('?')[0].startsWith('/api/');
        if (isApi && bodyTooLarge(req, maxBodyBytes)) {
          res.setHeader('Connection', 'close');
          return json(res, 413, { error: 'Payload too large' });
        }
        await stack.handle(req, res);
        if (!res.writableEnded) {
          if (req.url?.split('?')[0].startsWith('/api/'))
            return json(res, 404, { error: 'Unknown API route' });
          await staticHandler(path.resolve(dist), createReadStream)(req, res);
        }
      } catch (error) {
        if (!res.writableEnded)
          json(res, 500, { error: 'Internal server error' });
        console.error('[eyeinsky] request failure:', error?.message || error);
      }
    }),
    async listen(requestedPort = port) {
      if (!installed) {
        activeProviders ??= await defaultProviders();
        for (const provider of activeProviders)
          provider.configureServer?.({
            middlewares: stack,
            httpServer: runtime.server,
          });
        installed = true;
      }
      runtime.server.listen(requestedPort, host);
      await new Promise((resolve, reject) => {
        runtime.server.once('listening', resolve);
        runtime.server.once('error', reject);
      });
      return runtime.server.address();
    },
    async close() {
      for (const provider of activeProviders || [])
        await provider.closeBundle?.();
      if (runtime.server.listening)
        await new Promise((resolve) => runtime.server.close(resolve));
    },
  };
  Object.assign(runtime.server, SERVER_TIMEOUTS);
  return runtime;
}

export { createMiddlewareStack, safeAssetPath };

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  installProcessGuards();
  const runtime = createProductionRuntime({
    dist: path.resolve(
      process.env.EYEINSKY_DIST || path.join(here, '..', 'dist'),
    ),
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 4173),
  });
  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  runtime.listen().catch((error) => {
    console.error('[eyeinsky] startup failure:', error.message);
    process.exit(1);
  });
}
