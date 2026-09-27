/** A result is final only after its scheduled start, expected duration, and grace period. */
export function isSessionOver(
  session: { date: string; time: string | null } | null,
  sessionType: string,
  now = Date.now(),
): boolean {
  if (!session?.date) return false;
  const durations: Record<string, number> = {
    fp1: 60, fp2: 60, fp3: 60,
    qualifying: 75, sprint_qualifying: 45, sprint: 30, race: 120,
  };
  // Some historical calendars omit the time. Wait until the next day is safely over.
  if (!session.time) {
    const dayStart = Date.parse(`${session.date}T00:00:00Z`);
    return Number.isFinite(dayStart) && now > dayStart + 36 * 60 * 60 * 1000;
  }
  const time = /Z$|[+-]\d{2}:\d{2}$/i.test(session.time)
    ? session.time : `${session.time}Z`;
  const start = Date.parse(`${session.date}T${time}`);
  return Number.isFinite(start) && now > start + ((durations[sessionType] ?? 120) + 30) * 60 * 1000;
}
