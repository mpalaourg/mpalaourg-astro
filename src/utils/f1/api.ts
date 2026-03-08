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

export async function getDriverStandings(): Promise<DriverStanding[]> {
  try {
    const res = await fetch(`${JOLPICA_BASE}/current/driverStandings.json`);
    const json = (await res.json()) as {
      MRData: { StandingsTable: { StandingsLists: { DriverStandings: DriverStanding[] }[] } };
    };
    return json.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
  } catch {
    return [];
  }
}

export async function getConstructorStandings(): Promise<ConstructorStanding[]> {
  try {
    const res = await fetch(`${JOLPICA_BASE}/current/constructorStandings.json`);
    const json = (await res.json()) as {
      MRData: { StandingsTable: { StandingsLists: { ConstructorStandings: ConstructorStanding[] }[] } };
    };
    return json.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? [];
  } catch {
    return [];
  }
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
    if (sessions.length === 1) return sessions[0].session_key;

    // Disambiguate by closest date
    const expectedMs = new Date(expectedDateISO).getTime();
    sessions.sort((a, b) => {
      const da = Math.abs(new Date(a.date_start).getTime() - expectedMs);
      const db = Math.abs(new Date(b.date_start).getTime() - expectedMs);
      return da - db;
    });
    return sessions[0].session_key;
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

export async function getOpenF1SessionResults(
  year: number,
  jolpicaCountry: string,
  sessionName: string,
  expectedDateISO: string,
  isQualifying = false
): Promise<OpenF1ResultRow[]> {
  const openF1Country = JOLPICA_TO_OPENF1_COUNTRY[jolpicaCountry] ?? jolpicaCountry;

  const sessionKey = await getOpenF1SessionKey(year, openF1Country, sessionName, expectedDateISO);
  if (!sessionKey) return [];

  const [rawResults, drivers] = await Promise.all([
    getOpenF1Results(sessionKey),
    getOpenF1Drivers(sessionKey),
  ]);
  if (!rawResults.length) return [];

  const driverMap = new Map<number, OpenF1Driver>();
  drivers.forEach((d) => driverMap.set(d.driver_number, d));

  const sorted = [...rawResults].sort((a, b) => a.position - b.position);

  return sorted.map((r) => {
    const driver = driverMap.get(r.driver_number);
    const fullName = driver?.full_name ?? `#${r.driver_number}`;
    const parts = fullName.trim().split(" ");
    const name = parts.length >= 2 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : fullName;

    const row: OpenF1ResultRow = {
      position: r.position,
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
}
