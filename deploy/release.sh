#!/usr/bin/env bash
# EYEINSKY release: build locally from the audited commit, ship a verified
# archive, switch the symlink atomically, smoke test, auto-rollback on failure.
# Never deletes releases. See deploy/README.md.
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-root}" # today the VPS is operated as root
REMOTE_HOST="${REMOTE_HOST:?set REMOTE_HOST (ssh host or alias)}"
REMOTE="${REMOTE:-${REMOTE_USER}@${REMOTE_HOST}}"
# Staging defaults: its own tree, service and port, never production's `current`.
APP_ROOT="${APP_ROOT:-/opt/eyeinsky-staging}"
SERVICE="${SERVICE:-eyeinsky-staging}"
VHOST="${VHOST:?set VHOST to the nginx vhost file, e.g. /www/server/panel/vhost/nginx/staging.eyeinsky.org.conf}"
RUNTIME_PORT="${RUNTIME_PORT:-4174}"
RELEASE_ID="${RELEASE_ID:?set RELEASE_ID, e.g. 20260924T1800Z-staging}"
EXPECTED_SHA="${EXPECTED_SHA:?set EXPECTED_SHA to the audited commit}"

die() {
  echo "release: $*" >&2
  exit 1
}

[[ "$RELEASE_ID" =~ ^[0-9]{8}T[0-9]{4,6}Z-[a-z0-9-]+$ ]] || die "invalid RELEASE_ID"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || die "EXPECTED_SHA must be a full sha1"
[[ "$APP_ROOT" =~ ^/[A-Za-z0-9/_-]+$ ]] || die "invalid APP_ROOT"
[[ "$SERVICE" =~ ^[a-z0-9-]+$ ]] || die "invalid SERVICE"
[[ "$VHOST" =~ ^/(etc/nginx|www/server/panel/vhost/nginx)/[A-Za-z0-9/._-]+$ ]] || die "invalid VHOST"
[[ "$RUNTIME_PORT" =~ ^[0-9]{2,5}$ ]] || die "invalid RUNTIME_PORT"

test "$(git rev-parse HEAD)" = "$EXPECTED_SHA" || die "source SHA mismatch"
test -z "$(git status --porcelain)" || die "working tree is not clean"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SRC="$WORK/src"
STAGE="$WORK/stage"
ARCHIVE="$WORK/eyeinsky-${RELEASE_ID}.tar.gz"

# 1. Clean build from the exact audited commit (not the working tree).
mkdir -p "$SRC" "$STAGE"
git archive --format=tar "$EXPECTED_SHA" | tar -xf - -C "$SRC"
(cd "$SRC" && npm ci --no-audit --no-fund && npm run build)
test -f "$SRC/dist/index.html" || die "build produced no dist/index.html"

# 2. Stage the runtime payload. server/ imports helper modules from src/ and two
#    scripts/ files, and src/data/gtfsRealtime.js needs the `pbf` package, so the
#    production node_modules are installed into the stage (no dev deps).
cp -R "$SRC/dist" "$SRC/server" "$SRC/src" "$STAGE/"
mkdir -p "$STAGE/scripts"
cp "$SRC/scripts/google-server-key.mjs" "$SRC/scripts/pinokio-environment.mjs" "$STAGE/scripts/"
cp "$SRC/package.json" "$SRC/package-lock.json" "$STAGE/"
(cd "$STAGE" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
printf '%s\n' "$EXPECTED_SHA" >"$STAGE/REVISION"
tar --owner=0 --group=0 --numeric-owner -czf "$ARCHIVE" -C "$STAGE" .
LOCAL_SUM="$(sha256sum "$ARCHIVE" | awk '{print $1}')"

# 3. Transfer into a fresh root-only directory (never a predictable /tmp path).
#    The hash is re-checked inside the remote script right before extraction.
INCOMING="$(ssh "$REMOTE" "umask 077 && mkdir -p '$APP_ROOT/shared' && mktemp -d '$APP_ROOT/shared/incoming.XXXXXX'")"
[[ "$INCOMING" =~ ^${APP_ROOT}/shared/incoming\.[A-Za-z0-9]{6}$ ]] || die "unexpected incoming dir"
REMOTE_ARCHIVE="$INCOMING/release.tar.gz"
scp "$ARCHIVE" "$REMOTE:$REMOTE_ARCHIVE"

# 4. Remote: backup, unpack, verify, switch, smoke, auto-rollback.
ssh "$REMOTE" bash -s -- "$APP_ROOT" "$RELEASE_ID" "$SERVICE" "$VHOST" "$RUNTIME_PORT" "$REMOTE_ARCHIVE" "$LOCAL_SUM" <<'REMOTE_SCRIPT'
set -euo pipefail
APP_ROOT="$1"; RELEASE_ID="$2"; SERVICE="$3"; VHOST="$4"; PORT="$5"; ARCHIVE="$6"; SUM="$7"
INCOMING="$(dirname "$ARCHIVE")"
trap 'rm -rf "$INCOMING"' EXIT
REL="$APP_ROOT/releases/$RELEASE_ID"
BACKUP="$APP_ROOT/shared/backups/predeploy-$RELEASE_ID"

# Refuse if any other enabled vhost serves this tree's `current` (e.g. the
# eyeinsky.org placeholder): switching it would publish staging there.
VHOST_NAME="$(basename "$VHOST")"
if grep -lF "$APP_ROOT/current" /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf /www/server/panel/vhost/nginx/*.conf 2>/dev/null |
  xargs -r -n1 basename | grep -vxF "$VHOST_NAME" | grep -q .; then
  echo "another nginx vhost uses $APP_ROOT/current; refusing to switch it" >&2
  exit 1
fi

test ! -e "$REL" || { echo "release $RELEASE_ID already exists" >&2; exit 1; }
test ! -e "$BACKUP" || { echo "backup $BACKUP already exists" >&2; exit 1; }
# -e (not -f): empty on the first release instead of the unresolved path itself.
PREVIOUS="$(readlink -e "$APP_ROOT/current" 2>/dev/null || true)"

mkdir -p "$BACKUP" "$APP_ROOT/shared/runtime"
chown root:root "$APP_ROOT" "$APP_ROOT/shared"
chmod 755 "$APP_ROOT" "$APP_ROOT/shared"
chown eyeinsky:eyeinsky "$APP_ROOT/shared/runtime"
chmod 750 "$APP_ROOT/shared/runtime"
tar -cf "$BACKUP/current-symlink.tar" -C "$APP_ROOT" current 2>/dev/null || true
printf '%s\n' "$PREVIOUS" >"$BACKUP/previous-target"
if test -f "$VHOST"; then cp -a "$VHOST" "$BACKUP/"; fi

test "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$SUM" || { echo "archive hash mismatch" >&2; exit 1; }
mkdir -p "$REL"
tar --no-same-owner --no-same-permissions -xzf "$ARCHIVE" -C "$REL"
chown -R root:root "$REL"
chmod -R go-w,a+rX "$REL"
rm -rf "$INCOMING"
test -f "$REL/dist/index.html" || { echo "release has no dist/index.html" >&2; exit 1; }
test -f "$REL/server/production-runtime.js" || { echo "release has no runtime" >&2; exit 1; }

nginx -t

switch_to() {
  ln -sfn "$1" "$APP_ROOT/current.tmp"
  mv -T "$APP_ROOT/current.tmp" "$APP_ROOT/current"
}

smoke() {
  for _ in $(seq 1 15); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/healthz" &&
      test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")" = 200; then
      return 0
    fi
    sleep 2
  done
  return 1
}

switch_to "$REL"
systemctl restart "$SERVICE"
if smoke; then
  systemctl reload nginx
  echo "released $RELEASE_ID (backup $BACKUP)"
  exit 0
fi

echo "smoke failed; rolling back" >&2
if test -n "$PREVIOUS" && test -d "$PREVIOUS" && test "$PREVIOUS" != "$REL"; then
  switch_to "$PREVIOUS"
  systemctl restart "$SERVICE" || true
else
  rm -f "$APP_ROOT/current"
  systemctl stop "$SERVICE" || true
fi
exit 1
REMOTE_SCRIPT

echo "released $RELEASE_ID sha256=$LOCAL_SUM"
