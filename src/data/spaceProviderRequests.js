/** Fixed upstream request URLs; callers own validation, credentials and transport. */
export function celestrakGpUrl(group, { format = 'tle' } = {}) {
  if (format !== 'tle' && format !== 'json') {
    throw new TypeError('CelesTrak GP format must be tle or json');
  }
  const url = new URL('https://celestrak.org/NORAD/elements/gp.php');
  url.searchParams.set('GROUP', group);
  url.searchParams.set('FORMAT', format);
  return url;
}

/** Backward-compatible legacy TLE request (FORMAT=tle). */
export function celestrakTleUrl(group) {
  return celestrakGpUrl(group, { format: 'tle' });
}

export function launchLibraryRecentUrl(end) {
  const start = new Date(end.getTime() - 30 * 86400000);
  const url = new URL('https://ll.thespacedevs.com/2.3.0/launches/');
  url.searchParams.set('net__gte', start.toISOString());
  url.searchParams.set('net__lte', end.toISOString());
  url.searchParams.set('limit', '100');
  url.searchParams.set('mode', 'detailed');
  return url;
}
