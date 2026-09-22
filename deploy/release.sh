#!/usr/bin/env bash
set -euo pipefail

# Run from the exact reviewed checkout. This script creates, transfers, and
# verifies one archive; it never deletes an existing release.
REMOTE="${REMOTE:-root@195.35.32.233}"
RELEASE_ID="${RELEASE_ID:?set RELEASE_ID to the reviewed UTC release id}"
SOURCE_SHA="$(git rev-parse HEAD)"
test "$SOURCE_SHA" = "${EXPECTED_SHA:?set EXPECTED_SHA to the audited commit}" || { echo "source SHA mismatch" >&2; exit 1; }
ARCHIVE="/tmp/eyeinsky-${RELEASE_ID}.tar.gz"
ALLOWLIST="$(mktemp)"
trap 'rm -f "$ALLOWLIST"' EXIT
git ls-files > "$ALLOWLIST"
git archive --format=tar.gz --output="$ARCHIVE" HEAD $(cat "$ALLOWLIST")
LOCAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
scp "$ARCHIVE" "$REMOTE:/tmp/"
REMOTE_SHA="$(ssh "$REMOTE" "sha256sum /tmp/$(basename "$ARCHIVE") | awk '{print \$1}'")"
test "$LOCAL_SHA" = "$REMOTE_SHA" || { echo "archive hash mismatch" >&2; exit 1; }
ssh "$REMOTE" "set -eu; test -d /opt/eyeinsky/shared/backups; test -f /opt/eyeinsky/shared/backups/predeploy-20260921T235902Z; mkdir -p /opt/eyeinsky/releases/$RELEASE_ID; tar -xzf /tmp/$(basename "$ARCHIVE") -C /opt/eyeinsky/releases/$RELEASE_ID; ln -sfn /opt/eyeinsky/releases/$RELEASE_ID /opt/eyeinsky/current; nginx -t; systemctl restart eyeinsky; systemctl reload nginx"
echo "released $RELEASE_ID sha256=$LOCAL_SHA"
