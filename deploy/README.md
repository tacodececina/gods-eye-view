# EYEINSKY release procedure

The server process is `server/production-runtime.js` under systemd, never `vite dev` or `vite preview`. nginx terminates TLS, serves hashed assets from `/opt/eyeinsky/current/dist` and proxies `/` and `/api/` to `127.0.0.1:4173`.

## Files

| File                                       | Installed as                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `release.sh`                               | run locally from the audited checkout                                                |
| `systemd/eyeinsky.service.template`        | `/etc/systemd/system/eyeinsky.service` (replace `NODE_BIN`)                          |
| `eyeinsky.env.template`                    | `/opt/eyeinsky-staging/shared/eyeinsky.env` (root:root, 600; only names live in git) |
| `nginx/security-headers.conf`              | `/www/server/nginx/conf/snippets/eyeinsky-security-headers.conf`                     |
| `nginx/staging.eyeinsky.org.conf.template` | `/www/server/panel/vhost/nginx/staging.eyeinsky.org.conf`                            |
| `nginx/eyeinsky.org.conf.template`         | `/www/server/panel/vhost/nginx/eyeinsky.org.conf` (production only, after approval)  |

## Node on the server

The VPS has system Node **v22.23.2**; the `engines` range in `package.json` (24/26) targets the development toolchain. Decision: the runtime runs on the **system Node 22 LTS** (`NODE_BIN=/usr/bin/node`). `server/production-runtime.js` and every module it loads only use APIs present in Node 22 (global `fetch`, `node:util` `parseEnv`, `node:http`/`fs`/`stream`). The build and `npm ci --omit=dev` run locally on Node 24, so the engines range is never evaluated on the server. The release smoke runs on the server's Node, so any incompatibility fails the deploy and triggers the automatic rollback. Switching to a bundled Node later only means changing `NODE_BIN` in the unit.

## What a release contains

`release.sh` exports the audited commit (`EXPECTED_SHA`) with `git archive` into a temp dir, runs `npm ci && npm run build` there, and packages:

- `dist/` (the release is refused without `dist/index.html`),
- `server/`, `src/` (the server imports helpers from `src/`), `scripts/google-server-key.mjs` and `scripts/pinokio-environment.mjs`,
- `package.json`, `package-lock.json`, `REVISION`,
- production `node_modules` (`npm ci --omit=dev --ignore-scripts`): the runtime is not built-ins-only because `src/data/gtfsRealtime.js` imports `pbf`. The other bare specifiers in `server/` (`vite`, `http`, `stream`) are JSDoc types only.

## Release flow (`release.sh`)

1. Validates `RELEASE_ID` against `^[0-9]{8}T[0-9]{4,6}Z-[a-z0-9-]+$`, `EXPECTED_SHA`, paths, port and service name before any use in ssh; refuses a dirty tree or a HEAD different from `EXPECTED_SHA`.
2. Clean build, stage, tarball, local sha256.
3. `scp` into a fresh root-only `shared/incoming.XXXXXX`; the sha256 is re-checked remotely before extraction.
4. Remote (values passed as positional arguments to `bash -s`, not interpolated into the command): refuses an existing release or backup id; backup to `/opt/eyeinsky-staging/shared/backups/predeploy-$RELEASE_ID` (tar of the `current` symlink, previous target, copy of the vhost); unpack to `releases/$RELEASE_ID`; checks `dist/index.html` and the runtime **before** touching the symlink; `nginx -t`; atomic switch (`ln -sfn` to `current.tmp` + `mv -T`); `systemctl restart`; smoke `GET /healthz` and `GET /` (200) with 15 retries x 2 s; on success `systemctl reload nginx`.
5. **Automatic rollback**: if the smoke fails, `current` goes back atomically to the previous target, the service is restarted and the script exits non-zero. Releases are never deleted.

Variables: `REMOTE_HOST` (required), `REMOTE_USER` (default `root`: today the VPS is operated as root) or a full `REMOTE`; `VHOST`, `RELEASE_ID`, `EXPECTED_SHA` (required); `APP_ROOT` (`/opt/eyeinsky-staging`), `SERVICE` (`eyeinsky-staging`), `RUNTIME_PORT` (`4174`). Defaults target staging; production (`/opt/eyeinsky`, `eyeinsky`, `4173`) must be passed explicitly.

## Manual rollback

```bash
ssh root@$REMOTE_HOST
ls -1 /opt/eyeinsky/releases
cat /opt/eyeinsky-staging/shared/backups/predeploy-<id>/previous-target
ln -sfn /opt/eyeinsky/releases/<target> /opt/eyeinsky/current.tmp && mv -T /opt/eyeinsky/current.tmp /opt/eyeinsky/current
systemctl restart eyeinsky
curl -fsS http://127.0.0.1:4173/healthz
nginx -t && systemctl reload nginx
```

The original placeholder is `/opt/eyeinsky/releases/20260917T2033Z-iris-orbital` (static only). To return to it, also `systemctl stop eyeinsky` and restore the vhost copy saved in the backup.

## Staging vs production

Staging (`staging.eyeinsky.org`) is private: basic-auth (`/opt/eyeinsky-staging/shared/staging.htpasswd`), `X-Robots-Tag: noindex, nofollow`, a disallow-all `robots.txt` and `X-EYEINSKY-Phase: staging`. Production (`eyeinsky.org`) uses the other template and is installed only after explicit approval. Staging has its own tree (`/opt/eyeinsky-staging`), service (`eyeinsky-staging.service`) and port (4174), so switching staging never touches `/opt/eyeinsky/current`, which the eyeinsky.org placeholder serves. `release.sh` also aborts if any other enabled vhost references `$APP_ROOT/current`. The VPS is shared (20+ vhosts and mail): always `nginx -t` before a reload and never touch other vhosts.

## Staging checklist

Locally (repo root, clean tree at the audited commit):

```bash
git rev-parse HEAD
node --test server/production-runtime.test.mjs
bash -n deploy/release.sh
scp deploy/nginx/security-headers.conf root@$REMOTE_HOST:/www/server/nginx/conf/snippets/eyeinsky-security-headers.conf
scp deploy/nginx/staging.eyeinsky.org.conf.template root@$REMOTE_HOST:/www/server/panel/vhost/nginx/staging.eyeinsky.org.conf
scp deploy/systemd/eyeinsky.service.template root@$REMOTE_HOST:/tmp/eyeinsky.service.template
scp deploy/eyeinsky.env.template root@$REMOTE_HOST:/tmp/eyeinsky.env.template
```

On the server (`ssh root@$REMOTE_HOST`):

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ); mkdir -p /opt/eyeinsky-staging/shared/backups/manual-$TS
cp -a /etc/systemd/system/eyeinsky.service /opt/eyeinsky-staging/shared/backups/manual-$TS/ 2>/dev/null || true
id eyeinsky || useradd --system --home /opt/eyeinsky --shell /usr/sbin/nologin eyeinsky
node -v
sed -e 's#NODE_BIN#/usr/bin/node#' -e 's#APP_ROOT#/opt/eyeinsky-staging#g' -e 's#RUNTIME_PORT#4174#' /tmp/eyeinsky.service.template > /etc/systemd/system/eyeinsky-staging.service
test -f /opt/eyeinsky-staging/shared/eyeinsky.env || install -m 600 -o root -g root /tmp/eyeinsky.env.template /opt/eyeinsky-staging/shared/eyeinsky.env
nano /opt/eyeinsky-staging/shared/eyeinsky.env
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/eyeinsky-staging.service
dig +short staging.eyeinsky.org
mkdir -p /opt/eyeinsky-staging/shared/acme
certbot certonly --webroot -w /opt/eyeinsky-staging/shared/acme -d staging.eyeinsky.org
htpasswd -c /opt/eyeinsky-staging/shared/staging.htpasswd <user>
chown root:www /opt/eyeinsky-staging/shared/staging.htpasswd && chmod 640 /opt/eyeinsky-staging/shared/staging.htpasswd
nginx -t && systemctl reload nginx
```

Notes: fill the env file with an editor, never `cat` it. `dig` must return the VPS IP before certbot. The webroot challenge needs a port-80 server for `staging.eyeinsky.org` serving `/opt/eyeinsky-staging/shared/acme`; the first time, before the certificate exists, enable only the port-80 block (or use `certbot --nginx -d staging.eyeinsky.org`), then install the full vhost. `htpasswd` comes from `apache2-utils` and prompts for the password.

Locally, the release:

```bash
REMOTE_HOST=<vps> VHOST=/www/server/panel/vhost/nginx/staging.eyeinsky.org.conf \
RELEASE_ID=$(date -u +%Y%m%dT%H%MZ)-staging EXPECTED_SHA=$(git rev-parse HEAD) \
bash deploy/release.sh
```

Verify from outside:

```bash
curl -sI https://staging.eyeinsky.org/ | head -1
curl -s -u <user> -o /dev/null -w '%{http_code}\n' https://staging.eyeinsky.org/
curl -s -u <user> https://staging.eyeinsky.org/healthz
curl -sI -u <user> https://staging.eyeinsky.org/ | grep -iE 'x-robots-tag|x-eyeinsky-phase|strict-transport|content-security'
curl -s -u <user> -o /dev/null -w '%{http_code}\n' https://staging.eyeinsky.org/api/not-mounted
curl -sI https://eyeinsky.org/ | head -1
ssh root@$REMOTE_HOST 'systemctl is-active eyeinsky-staging; journalctl -u eyeinsky-staging -n 30 --no-pager'
```

Expected: 401 without credentials, 200 with them, `{"ok":true,"service":"eyeinsky"}`, the four headers present, a JSON 404, the production placeholder unchanged, service `active`. Then open the site in a browser with devtools: no CSP violations (Cesium workers, WebAssembly, 3D Tiles, Realtime `wss:`). If a source is blocked, extend `nginx/security-headers.conf` with the narrowest origin and redeploy the snippet.

## Release hardening

- Archive built with `--owner=0 --group=0 --numeric-owner`; extracted with `--no-same-owner --no-same-permissions`, then `chown -R root:root` and `chmod -R go-w`. The runtime user only reads the release; nginx (`www`) reads `dist/`.
- Upload goes to a fresh `mktemp -d $APP_ROOT/shared/incoming.XXXXXX` (root, 700), never `/tmp`; the sha256 is re-checked in the same remote script right before extraction and the directory is removed afterwards.
- `$APP_ROOT` and `shared/` are root:root 755 (scripts included); the htpasswd is root:www 640. The service can write only `shared/runtime` (eyeinsky:eyeinsky 750); it also runs with `CapabilityBoundingSet=` (empty), `SystemCallFilter=@system-service`, `RestrictNamespaces`, `LockPersonality` and `ProtectKernelModules`.
- Render the unit replacing `NODE_BIN`, `APP_ROOT` and `RUNTIME_PORT`; for staging: `sed -e 's#NODE_BIN#/usr/bin/node#' -e 's#APP_ROOT#/opt/eyeinsky-staging#g' -e 's#RUNTIME_PORT#4174#' eyeinsky.service.template > /etc/systemd/system/eyeinsky-staging.service`.

## This VPS (aaPanel layout)

The host runs aaPanel: nginx 1.24 lives under `/www/server/nginx`, runs as user `www`, and includes `/www/server/panel/vhost/nginx/*.conf` inside `http{}`. There is no `/etc/nginx/sites-*`, `conf.d` or `snippets`. Vhosts go to `/www/server/panel/vhost/nginx/<host>.conf`; the security snippet goes to `/www/server/nginx/conf/snippets/` (outside the vhost glob, or it would be parsed as a vhost). Backups of vhosts in that directory must not end in `.conf`. The system Node is 22 and is used by other services (pm2, tsx apps): never replace it.
