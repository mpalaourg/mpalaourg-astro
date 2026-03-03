export async function getSeasonRaces() {
  try {
    // Try current season first
    let res = await fetch("https://api.jolpi.ca/ergast/f1/current.json/");
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
