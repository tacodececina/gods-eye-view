/** Filter source records without changing their identity, timestamp or magnitude. */
export function filterSignals(rows, filters, now = Date.now()) {
  return rows
    .filter(
      (r) =>
        r.magnitude >= filters.magnitude &&
        r.timeMs != null &&
        now - r.timeMs <= filters.hours * 3600000 &&
        inSector(r, filters.sector),
    )
    .sort((a, b) => b.timeMs - a.timeMs || a.id.localeCompare(b.id));
}
function inSector(r, sector) {
  if (sector === 'americas') return r.lon >= -170 && r.lon <= -30;
  if (sector === 'europe') return r.lon >= -30 && r.lon <= 60 && r.lat >= 35;
  if (sector === 'africa') return r.lon >= -30 && r.lon <= 60 && r.lat < 35;
  if (sector === 'asia') return r.lon > 60 && r.lat >= 0;
  if (sector === 'oceania') return (r.lon > 60 || r.lon < -170) && r.lat < 0;
  return true;
}
export function signalState(layer, now = Date.now()) {
  if (!layer?.enabled && layer?.lifecycleState !== 'enabling') return 'off';
  const s = layer.stats || {};
  if (s.loading || s.refreshing) return 'loading';
  if (s.error || s.managerRefreshError) return s.count ? 'stale' : 'error';
  if (!s.lastUpdate) return 'loading';
  if (now - s.lastUpdate > 300000) return 'delayed';
  return s.count ? 'ready' : 'empty';
}
