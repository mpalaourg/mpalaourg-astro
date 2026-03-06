// Formatting utilities for F1 data

/**
 * Converts a duration in seconds to "m:ss.sss"
 */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const sStr = s.toFixed(3).padStart(6, "0");
  return `${m}:${sStr}`;
}

/**
 * Pad number with leading zero
 */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Format a date to local time string with timezone
 */
export function formatLocalDateTime(date: Date): string {
  const base = date.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  const utc = mm === 0 
    ? `UTC${sign}${hh}` 
    : `UTC${sign}${pad(hh)}:${pad(mm)}`;
  return `${base} (${utc})`;
}

/**
 * Get team ID from team name for logo lookup
 */
export function getTeamIdFromName(teamName: string): string {
  const t = teamName.toLowerCase();
  if (t.includes("red bull")) return "red_bull";
  if (t.includes("ferrari")) return "ferrari";
  if (t.includes("mercedes")) return "mercedes";
  if (t.includes("mclaren")) return "mclaren";
  if (t.includes("alpine")) return "alpine";
  if (t.includes("aston")) return "aston_martin";
  if (t.includes("williams")) return "williams";
  if (t.includes("haas")) return "haas";
  if (t.includes("rb") || t.includes("racing bulls")) return "rb";
  if (t.includes("audi") || t.includes("sauber")) return "audi";
  if (t.includes("cadillac") || t.includes("andretti")) return "cadillac";
  return "";
}
