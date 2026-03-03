const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export async function getSeasonRaces() {
  try {
    // Try current season first
    let res = await fetch(`${JOLPICA_BASE}/current.json`);
    if (!res.ok) throw new Error("API error");
    let data = await res.json();
    let races = data?.MRData?.RaceTable?.Races ?? [];

    // If no races found (off-season), try next year
    if (races.length === 0) {
      const year = new Date().getFullYear() + 1;
      res = await fetch(`https://api.jolpi.ca/ergast/f1/${year}.json/`);
      if (!res.ok) throw new Error("Fallback API error");
      data = await res.json();
      races = data?.MRData?.RaceTable?.Races ?? [];
    }

    return races;
  } catch (e) {
    console.error("F1 fetch failed:", e);
    return [];
  }
}

export interface DriverStanding {
  position: string;
  points: string;
  wins: string;
  Driver: {
    permanentNumber: string;
    code: string;
    givenName: string;
    familyName: string;
  };
  Constructors: Array<{ name: string }>;
}

export interface ConstructorStanding {
  position: string;
  points: string;
  wins: string;
  Constructor: { constructorId: string; name: string };
  // drivers is not in this endpoint — we enrich it from driver standings
  drivers?: Array<{ name: string; points: string; pct: string }>;
}

export async function getDriverStandings(): Promise<DriverStanding[]> {
  try {
    const res = await fetch(
      `${JOLPICA_BASE}/current/driverStandings.json`
    );
    const json = await res.json();
    return (
      json.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? []
    );
  } catch {
    return [];
  }
}

export async function getConstructorStandings(): Promise<
  ConstructorStanding[]
> {
  try {
    const res = await fetch(
      `${JOLPICA_BASE}/current/constructorStandings.json`
    );
    const json = await res.json();
    return (
      json.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? []
    );
  } catch {
    return [];
  }
}