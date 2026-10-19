// Normalize Korean composed/decomposed text and full-width characters consistently.
export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
export function matchesEventQuery(event, query) {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  const text = normalizeSearch([event.title, event.location, event.notes].filter(Boolean).join(' '));
  return terms.every(term => text.includes(term));
}

// The calendar service allows at most 400 days per request. Keep every batch below it.
export function splitSearchRanges(from, to) {
  const day = 86400000, end = Date.parse(`${to}T00:00:00Z`);
  let cursor = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || cursor > end) throw new Error('Invalid search date range');
  const ranges = [];
  const date = value => new Date(value).toISOString().slice(0, 10);
  while (cursor <= end) {
    const until = Math.min(cursor + 365 * day, end);
    ranges.push({ from: date(cursor), to: date(until) });
    cursor = until + day;
  }
  return ranges;
}
