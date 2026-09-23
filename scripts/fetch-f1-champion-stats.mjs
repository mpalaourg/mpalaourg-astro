import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { constructorChampions, driverChampions } from "../src/data/f1Champions.ts";

const archiveUrl = "https://github.com/TracingInsights/RaceData/releases/latest/download/data.zip";
const execFileAsync = promisify(execFile);
const historicConstructorNames = {
  1959: "Cooper-Climax",
  1960: "Cooper-Climax",
  1963: "Lotus-Climax",
  1965: "Lotus-Climax",
  1966: "Brabham-Repco",
  1967: "Brabham-Repco",
  1968: "Lotus-Ford/Cosworth",
  1969: "Matra-Ford/Cosworth",
  1970: "Lotus-Ford/Cosworth",
  1971: "Tyrrell-Ford/Cosworth",
  1972: "Lotus-Ford/Cosworth",
  1973: "Lotus-Ford/Cosworth",
  1974: "McLaren-Ford/Cosworth",
  1978: "Lotus-Ford/Cosworth",
  1980: "Williams-Ford/Cosworth",
  1981: "Williams-Ford/Cosworth",
  1984: "McLaren-TAG/Porsche",
  1985: "McLaren-TAG/Porsche",
  1986: "Williams-Honda",
  1987: "Williams-Honda",
  1988: "McLaren-Honda",
  1989: "McLaren-Honda",
  1990: "McLaren-Honda",
  1991: "McLaren-Honda",
  1992: "Williams-Renault",
  1993: "Williams-Renault",
  1994: "Williams-Renault",
  1995: "Benetton-Renault",
  1996: "Williams-Renault",
  1997: "Williams-Renault",
  1998: "McLaren-Mercedes",
};

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

async function readCsv(directory, filename) {
  const lines = (await readFile(join(directory, filename), "utf8")).trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift());
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index]])));
}

async function getCsvDirectory() {
  if (process.env.F1_CSV_DIR) return { directory: process.env.F1_CSV_DIR, temporary: false };

  const directory = await mkdtemp(join(tmpdir(), "f1-race-data-"));
  const archivePath = join(directory, "data.zip");
  const response = await fetch(archiveUrl);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${archiveUrl}`);
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  await execFileAsync("unzip", ["-o", archivePath, "results.csv", "sprint_results.csv", "races.csv", "drivers.csv", "constructors.csv", "status.csv", "driver_standings.csv", "constructor_standings.csv", "-d", directory]);
  return { directory, temporary: true };
}

function isDnf(status) {
  return status !== "Finished" && !/^\+\d+ Laps?$/.test(status);
}

function emptyStats(name) {
  return { name, wins: 0, podiums: 0, poles: 0, dnfs: 0, points: 0, starts: 0 };
}

function addResult(stats, result) {
  stats.starts += 1;
  if (result.positionOrder === "1") stats.wins += 1;
  if (Number(result.positionOrder) <= 3) stats.podiums += 1;
  if (result.grid === "1") stats.poles += 1;
  if (isDnf(result.status)) stats.dnfs += 1;
  stats.points += Number(result.points);
}

const normalize = (value) => value.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase();

const { directory, temporary } = await getCsvDirectory();
const [raceRows, driverRows, constructorRows, statusRows, resultRows, sprintRows, driverStandingRows, constructorStandingRows] = await Promise.all([
  readCsv(directory, "races.csv"),
  readCsv(directory, "drivers.csv"),
  readCsv(directory, "constructors.csv"),
  readCsv(directory, "status.csv"),
  readCsv(directory, "results.csv"),
  readCsv(directory, "sprint_results.csv"),
  readCsv(directory, "driver_standings.csv"),
  readCsv(directory, "constructor_standings.csv"),
]);

const races = new Map(raceRows.map((race) => [race.raceId, { year: Number(race.year), round: Number(race.round) }]));
const drivers = new Map(driverRows.map((driver) => [driver.driverId, {
  name: `${driver.forename} ${driver.surname}`,
  familyName: driver.surname,
}]));
const constructors = new Map(constructorRows.map((constructor) => [constructor.constructorId, constructor.name]));
const statuses = new Map(statusRows.map((status) => [status.statusId, status.status]));
const resultsBySeason = new Map();
const sprintResultsBySeason = new Map();
const finalRaceBySeason = new Map();
const racesBySeason = new Map();

for (const [raceId, race] of races) {
  const current = finalRaceBySeason.get(race.year);
  if (!current || race.round > current.round) finalRaceBySeason.set(race.year, { raceId, round: race.round });
  if (!racesBySeason.has(race.year)) racesBySeason.set(race.year, []);
  racesBySeason.get(race.year).push({ raceId, round: race.round });
}
for (const seasonRaces of racesBySeason.values()) seasonRaces.sort((a, b) => a.round - b.round);

for (const result of resultRows) {
  const year = races.get(result.raceId)?.year;
  if (!year || year > 2025) continue;
  const enriched = {
    ...result,
    driver: drivers.get(result.driverId),
    status: statuses.get(result.statusId),
  };
  if (!resultsBySeason.has(year)) resultsBySeason.set(year, []);
  resultsBySeason.get(year).push(enriched);
}

for (const result of sprintRows) {
  const year = races.get(result.raceId)?.year;
  if (!year || year > 2025) continue;
  const enriched = {
    ...result,
    driver: drivers.get(result.driverId),
  };
  if (!sprintResultsBySeason.has(year)) sprintResultsBySeason.set(year, []);
  sprintResultsBySeason.get(year).push(enriched);
}

const driverChampionPoints = new Map(driverStandingRows
  .filter((standing) => standing.position === "1")
  .map((standing) => [standing.raceId, Number(standing.points)]));
const constructorStandingPoints = new Map(constructorStandingRows.map((standing) => [
  `${standing.raceId}:${standing.constructorId}`,
  Number(standing.points),
]));
const championConstructorBySeason = new Map();
for (const [year, finalRace] of finalRaceBySeason) {
  const championStanding = constructorStandingRows.find((standing) =>
    standing.raceId === finalRace.raceId && standing.position === "1");
  if (championStanding) championConstructorBySeason.set(year, championStanding.constructorId);
}

const driverStats = {};
for (const champion of driverChampions) {
  const stats = emptyStats(champion.name);
  const championFamilyName = champion.name.split(" ").at(-1);
  for (const result of resultsBySeason.get(champion.year) ?? []) {
    if (normalize(result.driver.familyName) === normalize(championFamilyName)) {
      addResult(stats, result);
    }
  }
  const finalRace = finalRaceBySeason.get(champion.year);
  const officialPoints = finalRace ? driverChampionPoints.get(finalRace.raceId) : undefined;
  if (officialPoints !== undefined) stats.points = officialPoints;
  delete stats.starts;
  driverStats[champion.year] = stats;
}

const constructorStats = {};
for (const champion of constructorChampions) {
  const championConstructorId = championConstructorBySeason.get(champion.year);
  const seasonDrivers = new Map();
  for (const result of resultsBySeason.get(champion.year) ?? []) {
    if (result.constructorId !== championConstructorId) continue;
    if (!seasonDrivers.has(result.driverId)) seasonDrivers.set(result.driverId, emptyStats(result.driver.name));
    addResult(seasonDrivers.get(result.driverId), result);
  }

  for (const stats of seasonDrivers.values()) stats.points = 0;
  const finalRace = finalRaceBySeason.get(champion.year);
  const officialTotal = constructorStandingPoints.get(`${finalRace.raceId}:${championConstructorId}`);

  if (champion.year <= 1978) {
    const scoringScale = champion.year <= 1960 ? [8, 6, 4, 3, 2, 1] : [9, 6, 4, 3, 2, 1];
    const scoringResults = [];
    for (const race of racesBySeason.get(champion.year) ?? []) {
      const highestFinisher = (resultsBySeason.get(champion.year) ?? [])
        .filter((result) => result.raceId === race.raceId && result.constructorId === championConstructorId)
        .sort((a, b) => Number(a.positionOrder) - Number(b.positionOrder))[0];
      const points = highestFinisher ? (scoringScale[Number(highestFinisher.positionOrder) - 1] ?? 0) : 0;
      if (points > 0) scoringResults.push({ driverId: highestFinisher.driverId, points, round: race.round });
    }
    scoringResults.sort((a, b) => b.points - a.points || a.round - b.round);
    let remainingPoints = officialTotal;
    for (const result of scoringResults) {
      if (remainingPoints <= 0) break;
      const countedPoints = Math.min(result.points, remainingPoints);
      seasonDrivers.get(result.driverId).points += countedPoints;
      remainingPoints -= countedPoints;
    }
  } else {
    let previousStandingPoints = 0;
    for (const race of racesBySeason.get(champion.year) ?? []) {
      const standingPoints = constructorStandingPoints.get(`${race.raceId}:${championConstructorId}`);
      if (standingPoints === undefined) continue;
      const pointsDelta = standingPoints - previousStandingPoints;
      previousStandingPoints = standingPoints;
      if (pointsDelta === 0) continue;

      const eventResults = [
        ...(resultsBySeason.get(champion.year) ?? []),
        ...(sprintResultsBySeason.get(champion.year) ?? []),
      ].filter((result) => result.raceId === race.raceId && result.constructorId === championConstructorId);
      const pointsByDriver = new Map();
      for (const result of eventResults) {
        pointsByDriver.set(result.driverId, (pointsByDriver.get(result.driverId) ?? 0) + Number(result.points));
      }
      const eventPoints = [...pointsByDriver.values()].reduce((sum, points) => sum + points, 0);
      if (eventPoints <= 0) continue;
      for (const [driverId, points] of pointsByDriver) {
        if (!seasonDrivers.has(driverId)) {
          const driver = drivers.get(driverId);
          seasonDrivers.set(driverId, emptyStats(driver.name));
        }
        seasonDrivers.get(driverId).points += pointsDelta * (points / eventPoints);
      }
    }
  }

  const rows = [...seasonDrivers.values()]
    .filter((row) => row.points > 0)
    .map((row) => ({ ...row, points: Math.round(row.points * 100) / 100 }))
    .sort((a, b) => b.points - a.points || b.starts - a.starts || a.name.localeCompare(b.name));
  const total = rows.reduce((sum, row) => ({
    wins: sum.wins + row.wins,
    podiums: sum.podiums + row.podiums,
    poles: sum.poles + row.poles,
    dnfs: sum.dnfs + row.dnfs,
    points: sum.points + row.points,
  }), { wins: 0, podiums: 0, poles: 0, dnfs: 0, points: 0 });
  total.points = Math.round(total.points * 100) / 100;

  constructorStats[champion.year] = {
    constructorName: historicConstructorNames[champion.year] ?? constructors.get(championConstructorId),
    drivers: rows.map(({ starts: _starts, ...row }) => row),
    total,
  };
}

const output = `// Generated by scripts/fetch-f1-champion-stats.mjs from the RaceData F1 archive.\n` +
`export type ChampionSeasonStats = { name: string; wins: number; podiums: number; poles: number; dnfs: number; points: number };\n` +
`export type ConstructorSeasonStats = { constructorName: string; drivers: ChampionSeasonStats[]; total: Omit<ChampionSeasonStats, "name"> };\n\n` +
`export const driverSeasonStats: Record<number, ChampionSeasonStats> = ${JSON.stringify(driverStats, null, 2)};\n\n` +
`export const constructorSeasonStats: Record<number, ConstructorSeasonStats> = ${JSON.stringify(constructorStats, null, 2)};\n`;

const outputPath = resolve("src/data/f1ChampionStats.ts");
await writeFile(outputPath, output);
if (temporary) await rm(directory, { recursive: true, force: true });
console.log(`Wrote ${Object.keys(driverStats).length} driver seasons and ${Object.keys(constructorStats).length} constructor seasons to ${outputPath}`);
