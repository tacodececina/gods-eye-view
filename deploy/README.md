# EYEINSKY phase-1 release procedure

The production process is the pinned Node runtime, never `vite dev`, `vite preview`, or a localhost preview. Build from the exact reviewed commit with `npm ci` and `npm run build`; copy only the release archive to `/opt/eyeinsky/releases/<release-id>`, verify its SHA-256 after transfer, then atomically replace `/opt/eyeinsky/current` with a symlink. The service runs as `eyeinsky` on loopback port `4173`.

Required server-side environment variable names are provider-specific and must be supplied through the service manager, never committed or printed: `OPENAI_API_KEY`, `OPENSKY_AUTH_MODE`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `OPENSKY_USERNAME`, `OPENSKY_PASSWORD`, `AISSTREAM_API_KEY`, `TOMTOM_API_KEY`, `FIRMS_MAP_KEY`, `GOOGLE_MAPS_API_KEY`, `CESIUM_ION_TOKEN`, and `LL2_API_TOKEN`. Presence may be checked as a boolean only. Provider fallbacks remain keyless where supported.

Before every edit, copy `/opt/eyeinsky/shared/backups/predeploy-<timestamp>`; never delete releases or use broad recursive deletion. Validate `nginx -t` before reload and reload only the EYEINSKY vhost. Smoke checks are `GET /healthz` (JSON `ok:true`), an unknown `/api/` route (JSON 404), the built root and a client route (200 HTML), and an immutable hashed asset (200 with immutable cache). Phase 1 leaves the preparation `noindex`/phase header in place; phase 2 removes them only after supervisor approval.

Rollback is exactly: backup current state, stop `eyeinsky`, point `/opt/eyeinsky/current` atomically to `/opt/eyeinsky/releases/20260917T2033Z-iris-orbital`, start `eyeinsky`, validate `nginx -t`, reload the EYEINSKY vhost, then smoke `/healthz`. Do not roll back during normal release.
