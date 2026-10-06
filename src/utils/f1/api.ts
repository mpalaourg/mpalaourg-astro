// API Base URLs
const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const OPENF1_BASE = "https://api.openf1.org/v1";

// Import types and constants
import type { DriverStanding, ConstructorStanding, OpenF1Driver, OpenF1SessionResult, OpenF1ResultRow, ClassificationFallbackRow } from "./types";
import { JOLPICA_TO_OPENF1_COUNTRY } from "./constants";
import { formatLapTime, getTeamIdFromName } from "./formatters";

// ─── Jolpica API (Race calendar & historical results) ────────────────────────────

export async function getSeasonRaces(season: number): Promise<any[]> {
  const res = await fetch(`${JOLPICA_BASE}/${season}.json`);
  if (!res.ok) throw new Error(`Jolpica schedule returned ${res.status}`);
  const data = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
  return data?.MRData?.RaceTable?.Races ?? [];
}

export async function getChampionshipStandings(
  season: number,
  type: "drivers" | "constructors",
): Promise<{ round: number; standings: DriverStanding[] | ConstructorStanding[] }> {
  const endpoint = type === "drivers" ? "driverStandings" : "constructorStandings";
  const res = await fetch(`${JOLPICA_BASE}/${season}/${endpoint}.json`);
  if (!res.ok) throw new Error(`Jolpica standings returned ${res.status}`);
  const json = (await res.json()) as {
    MRData: { StandingsTable: { StandingsLists: Array<{
      round: string;
      DriverStandings?: DriverStanding[];
      ConstructorStandings?: ConstructorStanding[];
    }> } };
  };
  const snapshot = json.MRData?.StandingsTable?.StandingsLists?.[0];
  const round = Number(snapshot?.round);
  const standings = type === "drivers" ? snapshot?.DriverStandings : snapshot?.ConstructorStandings;
  if (!snapshot || !Number.isInteger(round) || !standings?.length) {
    throw new Error("Jolpica standings snapshot is incomplete");
  }
  if (type === "drivers") {
    const drivers = standings as DriverStanding[];
    await Promise.all(drivers.filter((driver) => driver.Constructors.length > 1).map(async (driver) => {
      driver.constructorPoints = await getDriverConstructorPoints(
        season, round, driver.Driver.driverId, Number(driver.points),
      );
    }));
  }
  return { round, standings };
}

async function getDriverConstructorPoints(
  season: number,
  throughRound: number,
  driverId: string,
  expectedPoints: number,
): Promise<Record<string, number>> {
  const results = await Promise.all(["results", "sprint"].map(async (session) => {
    const url = `${JOLPICA_BASE}/${season}/drivers/${encodeURIComponent(driverId)}/${session}.json?limit=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jolpica ${session} points returned ${res.status}`);
    const json = (await res.json()) as { MRData: { RaceTable: { Races: Array<{
      round: string;
      Results?: Array<{ points: string; Constructor: { constructorId: string } }>;
      SprintResults?: Array<{ points: string; Constructor: { constructorId: string } }>;
    }> } } };
    return json.MRData?.RaceTable?.Races ?? [];
  }));
  const points: Record<string, number> = {};
  for (const [index, races] of results.entries()) {
    const key: "Results" | "SprintResults" = index === 0 ? "Results" : "SprintResults";
    for (const race of races) {
      if (Number(race.round) > throughRound) continue;
      for (const result of race[key] ?? []) {
        const id = result.Constructor?.constructorId;
        const value = Number(result.points);
        if (!id || !Number.isFinite(value)) throw new Error("Incomplete constructor points result");
        points[id] = (points[id] ?? 0) + value;
      }
    }
  }
  const total = Object.values(points).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - expectedPoints) > 0.001) {
    throw new Error(`Constructor points do not reconcile for ${driverId}`);
  }
  return points;
}

export async function getJolpicaQualifying(season: string, round: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${JOLPICA_BASE}/${season}/${round}/qualifying.json`);
    if (!res.ok) {
      console.warn("Jolpica qualifying request failed", { season, round, status: res.status });
      return null;
    }
    const json = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
    return json.MRData?.RaceTable?.Races?.[0]?.QualifyingResults ?? null;
  } catch (error) {
    console.warn("Jolpica qualifying request failed", { season, round, error: String(error) });
    return null;
  }
}

export async function getJolpicaRaceResults(season: string, round: string): Promise<any[] | null> {
  try {
    // Fetch race results
    const res = await fetch(`${JOLPICA_BASE}/${season}/${round}/results.json`);
    if (!res.ok) {
      console.warn("Jolpica race request failed", { season, round, status: res.status });
      return null;
    }
    const json = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
    const results = json.MRData?.RaceTable?.Races?.[0]?.Results ?? null;
    
    if (!results?.length) return null;
    if (results.some((row: any) => String(row.FastestLap?.rank) === "1")) return results;
    
    // Fetch fastest lap separately
    try {
      const fastestRes = await fetch(`${JOLPICA_BASE}/${season}/${round}/fastest/1/drivers.json`);
      if (fastestRes.ok) {
        const fastestJson = await fastestRes.json() as { 
          MRData: { 
            DriverTable: { 
              Drivers: Array<{ driverId: string }> 
            } 
          } 
        };
        const fastestDriverId = fastestJson.MRData?.DriverTable?.Drivers?.[0]?.driverId;
        
        // Mark the fastest driver in results
        if (fastestDriverId) {
          results.forEach((r: any) => {
            if (r.Driver?.driverId === fastestDriverId) {
              r.FastestLap = { ...r.FastestLap, rank: "1" };
            }
          });
        }
      }
    } catch (e) {
      // Ignore fastest lap fetch errors
    }
    
    return results;
  } catch (error) {
    console.warn("Jolpica race request failed", { season, round, error: String(error) });
    return null;
  }
}

export async function getJolpicaSprintResults(season: string, round: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${JOLPICA_BASE}/${season}/${round}/sprint.json`);
    if (!res.ok) return null;
    const json = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
    return json.MRData?.RaceTable?.Races?.[0]?.SprintResults ?? null;
  } catch {
    return null;
  }
}

// ─── OpenF1 API (Live session results) ─────────────────────────────────────────

async function getOpenF1SessionKey(
  year: number,
  countryName: string,
  sessionName: string,
  expectedDateISO: string
): Promise<number | null> {
  try {
    const url = new URL(`${OPENF1_BASE}/sessions`);
    url.searchParams.set("year", String(year));
    url.searchParams.set("country_name", countryName);
    url.searchParams.set("session_name", sessionName);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const sessions: any[] = await res.json();
    if (!Array.isArray(sessions) || !sessions.length) return null;

    // A country can host more than one round, and cancelled sessions can
    // remain listed. Never substitute a session from another race weekend.
    const expectedMs = new Date(expectedDateISO).getTime();
    if (!Number.isFinite(expectedMs)) return null;
    sessions.sort((a, b) => {
      const da = Math.abs(new Date(a.date_start).getTime() - expectedMs);
      const db = Math.abs(new Date(b.date_start).getTime() - expectedMs);
      return da - db;
    });
    const closest = sessions[0];
    return Math.abs(new Date(closest.date_start).getTime() - expectedMs) <= 3 * 24 * 60 * 60 * 1000
      ? closest.session_key
      : null;
  } catch {
    return null;
  }
}

async function getOpenF1Results(sessionKey: number): Promise<OpenF1SessionResult[]> {
  try {
    const res = await fetch(`${OPENF1_BASE}/session_result?session_key=${sessionKey}`);
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function getOpenF1Drivers(sessionKey: number): Promise<OpenF1Driver[]> {
  try {
    const res = await fetch(`${OPENF1_BASE}/drivers?session_key=${sessionKey}`);
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function formatRaceDuration(seconds: number): string {
  const millis = Math.round(seconds * 1000);
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const remainder = ((millis % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`;
}

/** Supply the widget's Jolpica-shaped rows while Jolpica has no classification. */
export async function getOpenF1ClassificationFallback(
  year: number,
  country: string,
  sessionName: "Qualifying" | "Race",
  expectedDateISO: string,
): Promise<ClassificationFallbackRow[] | null> {
  // OpenF1 has no historical data before 2023.
  if (year < 2023) return null;
  const openF1Country = JOLPICA_TO_OPENF1_COUNTRY[country] ?? country;
  const sessionKey = await getOpenF1SessionKey(year, openF1Country, sessionName, expectedDateISO);
  if (!sessionKey) return null;

  const [results, drivers] = await Promise.all([
    getOpenF1Results(sessionKey),
    getOpenF1Drivers(sessionKey),
  ]);
  if (!results.length || !drivers.length) return null;

  const driverByNumber = new Map(uniqueSessionDrivers(drivers).map((driver) => [driver.driver_number, driver]));
  const uniqueResults = [...new Map(results.map((result) => [result.driver_number, result])).values()];
  // An incomplete roster or podium would make the full-results and medal UI misleading.
  if (uniqueResults.length !== driverByNumber.size ||
    uniqueResults.some((result) => !driverByNumber.has(result.driver_number)) ||
    [1, 2, 3].some((position) => !uniqueResults.some((result) =>
      result.position === position && !result.dsq &&
      (sessionName === "Qualifying"
        ? Array.isArray(result.duration) && result.duration.some((time) => time != null && time > 0)
        : !result.dns && !result.dnf && result.number_of_laps > 0)
    ))) return null;

  const sorted = getSortedOpenF1Results(uniqueResults).sort((a, b) => {
    if (Boolean(a.dsq) !== Boolean(b.dsq)) return a.dsq ? 1 : -1;
    if (sessionName === "Race" && a.position == null && b.position == null) {
      return b.number_of_laps - a.number_of_laps;
    }
    return 0;
  });
  const winnerLaps = sorted.find((result) => result.position === 1)!.number_of_laps;
  let nextUnknownPosition = Math.max(...sorted.map((result) => result.position ?? 0)) + 1;

  return sorted.map((result) => {
    const driver = driverByNumber.get(result.driver_number);
    const names = (driver?.full_name ?? "").trim().split(/\s+/);
    const teamName = driver?.team_name ?? "";
    const row: ClassificationFallbackRow = {
      number: String(result.driver_number),
      position: String(result.position ?? nextUnknownPosition++),
      positionReported: result.position != null,
      Driver: {
        permanentNumber: String(result.driver_number),
        code: driver?.name_acronym ?? "",
        givenName: driver?.first_name ?? names[0] ?? "",
        familyName: driver?.last_name ?? names.slice(1).join(" "),
      },
      Constructor: { constructorId: getTeamIdFromName(teamName), name: teamName },
    };

    if (sessionName === "Qualifying") {
      const durations = Array.isArray(result.duration) ? result.duration : [];
      row.Q1 = formatLapTime(durations[0]);
      row.Q2 = formatLapTime(durations[1]);
      row.Q3 = formatLapTime(durations[2]);
      if (!durations.some((duration) => typeof duration === "number" && duration > 0)) {
        row.noResult = true;
        row.qualifyingPositionKnown = result.position != null;
      }
      if (result.dsq) row.dsq = true;
    } else {
      const lapsDown = winnerLaps - result.number_of_laps;
      row.positionText = result.dsq ? "D" : result.dns ? "W" : result.dnf ? "R"
        : result.position == null ? "—" : row.position;
      row.laps = String(result.number_of_laps);
      if (result.points != null) row.points = String(result.points);
      row.status = result.dsq ? "Disqualified" : result.dns ? "Did not start"
        : result.dnf ? "Retired" : lapsDown > 0 ? `+${lapsDown} Lap${lapsDown === 1 ? "" : "s"}` : "Finished";
      if (!result.dnf && !result.dns && !result.dsq && typeof result.duration === "number") {
        const time = result.position === 1
          ? formatRaceDuration(result.duration)
          : typeof result.gap_to_leader === "number"
            ? `+${result.gap_to_leader.toFixed(3)}` : null;
        if (time) row.Time = { time };
      }
    }
    return row;
  });
}

function uniqueSessionDrivers(drivers: OpenF1Driver[]): OpenF1Driver[] {
  return [...new Map(drivers.map((driver) => [driver.driver_number, driver])).values()];
}

export async function getOpenF1SessionDrivers(
  year: number,
  jolpicaCountry: string,
  sessionName: string,
  expectedDateISO: string,
): Promise<OpenF1Driver[]> {
  const openF1Country = JOLPICA_TO_OPENF1_COUNTRY[jolpicaCountry] ?? jolpicaCountry;
  const sessionKey = await getOpenF1SessionKey(year, openF1Country, sessionName, expectedDateISO);
  return sessionKey ? uniqueSessionDrivers(await getOpenF1Drivers(sessionKey)) : [];
}

function getSortedOpenF1Results(
  rawResults: OpenF1SessionResult[],
): OpenF1SessionResult[] {
  return [...rawResults].sort((a, b) => {
    const aPosition = a.position ?? Number.POSITIVE_INFINITY;
    const bPosition = b.position ?? Number.POSITIVE_INFINITY;
    if (aPosition !== bPosition) return aPosition - bPosition;
    return a.driver_number - b.driver_number;
  });
}

export async function getOpenF1SessionResults(
  year: number,
  jolpicaCountry: string,
  sessionName: string,
  expectedDateISO: string,
  isQualifying = false
): Promise<{ results: OpenF1ResultRow[]; drivers: OpenF1Driver[] }> {
  const openF1Country = JOLPICA_TO_OPENF1_COUNTRY[jolpicaCountry] ?? jolpicaCountry;

  const sessionKey = await getOpenF1SessionKey(year, openF1Country, sessionName, expectedDateISO);
  if (!sessionKey) return { results: [], drivers: [] };

  const [rawResults, drivers] = await Promise.all([
    getOpenF1Results(sessionKey),
    getOpenF1Drivers(sessionKey),
  ]);
  const uniqueDrivers = uniqueSessionDrivers(drivers);
  if (!rawResults.length) return { results: [], drivers: uniqueDrivers };

  const driverMap = new Map<number, OpenF1Driver>();
  uniqueDrivers.forEach((d) => driverMap.set(d.driver_number, d));

  const sorted = getSortedOpenF1Results(rawResults);

  const results = sorted.map((r, index) => {
    const driver = driverMap.get(r.driver_number);
    const fullName = driver?.full_name ?? `#${r.driver_number}`;
    const parts = fullName.trim().split(" ");
    // Title-case the name: "GEORGE RUSSELL" -> "G. Russell"
    const name = parts.length >= 2 
      ? `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(" ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}`
      : fullName;

    const row: OpenF1ResultRow = {
      position: r.position ?? index + 1,
      positionReported: r.position != null,
      driverNumber: r.driver_number,
      name,
      teamName: driver?.team_name ?? "",
      lapTime: "—",
      gapToLeader: "—",
      laps: r.number_of_laps,
      dnf: r.dnf,
      dns: r.dns,
      dsq: r.dsq,
    };

    if (isQualifying && Array.isArray(r.duration)) {
      const [d1, d2, d3] = r.duration as number[];
      row.q1 = formatLapTime(d1);
      row.q2 = formatLapTime(d2);
      row.q3 = formatLapTime(d3);
      const best = [d3, d2, d1].find((t) => t != null && t > 0);
      row.lapTime = formatLapTime(best);
    } else if (!Array.isArray(r.duration)) {
      row.lapTime = formatLapTime(r.duration);
      const gap = typeof r.gap_to_leader === "number" ? r.gap_to_leader : null;
      row.gapToLeader = gap != null && gap > 0 ? `+${gap.toFixed(3)}` : gap === 0 ? "—" : "—";
    }

    return row;
  });

  const resultNumbers = new Set(sorted.map((row) => row.driver_number));
  const missingResults = uniqueDrivers
    .filter((driver) => !resultNumbers.has(driver.driver_number))
    .map((driver, index): OpenF1ResultRow => ({
      position: results.length + index + 1,
      driverNumber: driver.driver_number,
      name: `${driver.first_name?.[0] ?? driver.full_name?.[0] ?? ""}. ${driver.last_name ?? driver.full_name?.split(" ").slice(1).join(" ") ?? ""}`.trim(),
      teamName: driver.team_name ?? "",
      lapTime: "—",
      gapToLeader: "—",
      laps: 0,
      dnf: false,
      dns: false,
      dsq: false,
      noResult: true,
    }));

  return { results: [...results, ...missingResults], drivers: uniqueDrivers };
}
