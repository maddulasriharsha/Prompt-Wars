// Date helpers working on ISO "YYYY-MM-DD" strings in UTC, so results never depend on the viewer's timezone.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

export function parseISO(iso) {
  const m = ISO.exec(iso ?? '');
  if (!m) return null;
  const time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(time);
  // Round-trip check rejects impossible dates such as 2026-02-31.
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return time;
}

export function toISO(time) {
  return new Date(time).toISOString().slice(0, 10);
}

export function localISODate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / DAY_MS);
}

export function addDays(iso, days) {
  return toISO(parseISO(iso) + days * DAY_MS);
}

export function monthOf(iso) {
  return new Date(parseISO(iso)).getUTCMonth();
}
