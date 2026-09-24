// API Base URLs
const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const OPENF1_BASE = "https://api.openf1.org/v1";

// Import types and constants
import type { DriverStanding, ConstructorStanding, OpenF1Driver, OpenF1SessionResult, OpenF1ResultRow } from "./types";
import { JOLPICA_TO_OPENF1_COUNTRY } from "./constants";
import { formatLapTime } from "./formatters";

// ─── Jolpica API (Race calendar & historical results) ────────────────────────────

export async function getSeasonRaces(season?: number): Promise<any[]> {
  try {
    const year = season || new Date().getFullYear();
    let res = await fetch(`${JOLPICA_BASE}/${year}.json`);
    if (!res.ok) throw new Error("API error");
    let data = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
    let races = data?.MRData?.RaceTable?.Races ?? [];
    if (races.length === 0) {
      // Fallback to current season
      res = await fetch(`${JOLPICA_BASE}/current.json`);
      if (!res.ok) throw new Error("Fallback API error");
      data = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
      races = data?.MRData?.RaceTable?.Races ?? [];
    }
    return races;
  } catch (e) {
    console.error("F1 fetch failed:", e);
    return [];
  }
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
  return { round, standings };
}

export async function getJolpicaQualifying(season: string, round: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${JOLPICA_BASE}/${season}/${round}/qualifying.json`);
    if (!res.ok) return null;
    const json = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
    return json.MRData?.RaceTable?.Races?.[0]?.QualifyingResults ?? null;
  } catch {
    return null;
  }
}

export async function getJolpicaRaceResults(season: string, round: string): Promise<any[] | null> {
  try {
    // Fetch race results
    const res = await fetch(`${JOLPICA_BASE}/${season}/${round}/results.json`);
    if (!res.ok) return null;
    const json = (await res.json()) as { MRData: { RaceTable: { Races: any[] } } };
    const results = json.MRData?.RaceTable?.Races?.[0]?.Results ?? null;
    
    if (!results) return null;
    
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
              r.FastestLap = { rank: "1", lap: null, Time: { time: "" } };
            }
          });
        }
      }
    } catch (e) {
      // Ignore fastest lap fetch errors
    }
    
    return results;
  } catch {
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
    if (!sessions.length) return null;

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
    return await res.json();
  } catch {
    return [];
  }
}

async function getOpenF1Drivers(sessionKey: number): Promise<OpenF1Driver[]> {
  try {
    const res = await fetch(`${OPENF1_BASE}/drivers?session_key=${sessionKey}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
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
