/** Calendar windows use server time and an IANA zone, including DST changes. */
export function validTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; } catch { return null; }
}
export function localDayWindow(now: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayAt = (timestamp: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(p => [p.type, p.value]));
    return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000);
  };
  const day = dayAt(now);
  // Find the next calendar boundary rather than assuming every day lasts 24h.
  let low = now, high = now + 36 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dayAt(middle) === day) low = middle; else high = middle;
  }
  return { day, resetsAt: high };
}
