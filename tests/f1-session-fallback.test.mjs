import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

async function loadModule(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const [{ GET }, { getOpenF1ClassificationFallback, getJolpicaRaceResults }, { setPendingSessionFallback, upsertSession }] = await Promise.all([
  loadModule("src/pages/api/f1/session.ts"),
  loadModule("src/utils/f1/api.ts"),
  loadModule("src/utils/f1/db.ts"),
]);
const originalFetch = globalThis.fetch;
const databases = [];
beforeEach((t) => { t.mock.method(console, "warn", () => {}); });
afterEach(() => {
  globalThis.fetch = originalFetch;
  databases.splice(0).forEach((db) => db.close());
});

// Run the actual D1 SQL against SQLite, including update guards and retry timestamps.
function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  sqlite.exec(readFileSync("migrations/0001_f1_cache.sql", "utf8"));
  sqlite.prepare(`INSERT INTO races (season, round, race_name, circuit_id, circuit_name, locality,
    country, qualifying_date, qualifying_time, race_date, race_time)
    VALUES (2026, 16, 'Bahrain Grand Prix in Malaysia', 'sepang', 'Sepang', 'Kuala Lumpur',
      'Malaysia', '2026-10-03', '08:00:00Z', '2026-10-04', '07:00:00Z')`).run();
  return {
    sqlite,
    failWrites: false,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const db = this;
      return {
        bind(...args) {
          return {
            async first() { return statement.get(...args) ?? null; },
            async run() {
              if (db.failWrites) throw new Error("D1 write unavailable");
              return statement.run(...args);
            },
          };
        },
      };
    },
    session(type) { return sqlite.prepare("SELECT * FROM session_results WHERE session_type = ?").get(type); },
    seedSession(type, { source = "jolpica", results = null, retryCount = 2, attemptedAt = new Date().toISOString(), status = "pending" } = {}) {
      sqlite.prepare(`INSERT OR REPLACE INTO session_results
        (season, round, session_type, source, results_json, status, last_attempted_at, retry_count)
        VALUES (2026, 16, ?, ?, ?, ?, ?, ?)`).run(type, source, results ? JSON.stringify(results) : null, status, attemptedAt, retryCount);
    },
  };
}

function driver(number, first, last, team) {
  return { driver_number: number, full_name: `${first} ${last}`, first_name: first, last_name: last,
    name_acronym: last.slice(0, 3).toUpperCase(), team_name: team };
}
const drivers = [driver(3, "Max", "Verstappen", "Red Bull Racing"), driver(44, "Lewis", "Hamilton", "Ferrari"), driver(12, "Kimi", "Antonelli", "Mercedes")];
const flags = { dnf: false, dns: false, dsq: false };
const qualifyingResults = [
  { ...flags, position: 1, driver_number: 3, duration: [96.477, 95.696, 95.130], number_of_laps: 12 },
  { ...flags, position: 2, driver_number: 44, duration: [96.595, 96.032, 95.428], number_of_laps: 15 },
  { ...flags, position: 3, driver_number: 12, duration: [97.041, 95.959, 95.631], number_of_laps: 16 },
];
const raceResults = [
  { ...flags, position: 3, driver_number: 44, duration: 6439.727, gap_to_leader: 4.919, number_of_laps: 55, points: 15 },
  { ...flags, position: 1, driver_number: 3, duration: 6434.808, gap_to_leader: 0, number_of_laps: 55, points: 25 },
  { ...flags, position: 2, driver_number: 12, duration: 6437.115, gap_to_leader: 2.307, number_of_laps: 55, points: 18 },
];

function mockFeeds(options = {}) {
  const feeds = { jolpicaRows: null, drivers, qualifyingResults, raceResults, ...options, requests: [] };
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    feeds.requests.push(url);
    if (url.hostname === "api.jolpi.ca") {
      if (feeds.primaryFailure === "network") throw new Error("Upstream connection failed");
      if (feeds.primaryFailure) return new Response(null, { status: feeds.primaryFailure });
      if (url.pathname.includes("/fastest/")) {
        return Response.json({ MRData: { DriverTable: { Drivers: [{ driverId: "max_verstappen" }] } } });
      }
      const key = url.pathname.endsWith("qualifying.json") ? "QualifyingResults" : "Results";
      return Response.json({ MRData: { RaceTable: { Races: feeds.jolpicaRows ? [{ [key]: feeds.jolpicaRows }] : [] } } });
    }
    if (url.pathname.endsWith("/sessions")) {
      assert.equal(url.searchParams.get("country_name"), "Bahrain");
      const name = url.searchParams.get("session_name");
      if (!["Qualifying", "Race"].includes(name)) return Response.json([]);
      const qualifying = name === "Qualifying";
      return Response.json(feeds.sessions ?? [
        { session_key: 11257, date_start: "2026-04-11T16:00:00+00:00" },
        { session_key: qualifying ? 11730 : 11731, date_start: qualifying ? "2026-10-03T08:00:00+00:00" : "2026-10-04T07:00:00+00:00" },
      ]);
    }
    if (url.pathname.endsWith("/drivers")) return Response.json(feeds.drivers);
    if (url.pathname.endsWith("/session_result")) {
      assert.ok(["11730", "11731"].includes(url.searchParams.get("session_key")));
      return Response.json(url.searchParams.get("session_key") === "11730" ? feeds.qualifyingResults : feeds.raceResults);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return feeds;
}

async function request(db, type) {
  const response = await GET({ url: new URL(`https://example.test/api/f1/session?season=2026&round=16&type=${type}`), locals: { runtime: { env: { DB: db } } } });
  assert.equal(response.status, 200);
  return response.json();
}

for (const type of ["qualifying", "race"]) {
  test(`${type} serves fallback rows during empty, HTTP, and network failures`, async () => {
    for (const primaryFailure of [null, 503, "network"]) {
      const db = makeDb();
      mockFeeds({ primaryFailure });
      const response = await request(db, type);
      assert.equal(response.status, "pending");
      assert.equal(db.session(type).source, "openf1-fallback");
      assert.equal(response.results.length, 3);
      assert.equal(response.results[0].Driver.familyName, "Verstappen");
      assert.equal(response.results[0].Constructor.constructorId, "red_bull");
      if (type === "qualifying") assert.equal(response.results[0].Q3, "1:35.130");
      else {
        assert.equal(response.results[0].Time.time, "1:47:14.808");
        assert.equal(response.results[1].Time.time, "+2.307");
      }
    }
  });

  test(`${type} upgrades its provisional cache when Jolpica recovers`, async () => {
    const db = makeDb();
    const feeds = mockFeeds();
    const fallback = await request(db, type);
    db.seedSession(type, { source: "openf1-fallback", results: fallback.results, attemptedAt: "2000-01-01 00:00:00" });
    const official = fallback.results.map((row) => ({ ...row, Driver: { ...row.Driver, driverId: row.number } }));
    feeds.jolpicaRows = official;
    const refreshed = await request(db, type);
    assert.equal(refreshed.status, "complete");
    assert.deepEqual(refreshed.results, official);
    assert.match(db.session(type).source, /^jolpica/);
  });
}

test("a pending cache receives fallback rows without changing its retry time or count", async () => {
  const db = makeDb();
  db.seedSession("qualifying", { attemptedAt: new Date().toISOString().slice(0, 19).replace("T", " ") });
  const before = db.session("qualifying");
  const feeds = mockFeeds();
  const response = await request(db, "qualifying");
  assert.equal(response.results.length, 3);
  assert.equal(db.session("qualifying").source, "openf1-fallback");
  assert.equal(db.session("qualifying").retry_count, before.retry_count);
  assert.equal(db.session("qualifying").last_attempted_at, before.last_attempted_at);
  assert.ok(feeds.requests.every((url) => url.hostname === "api.openf1.org"));
  const count = feeds.requests.length;
  assert.deepEqual(await request(db, "qualifying"), response);
  assert.equal(feeds.requests.length, count);
});

test("failed fallback attempts respect backoff instead of repeating on every request", async () => {
  const db = makeDb();
  db.seedSession("race");
  const feeds = mockFeeds({ sessions: [] });
  assert.equal((await request(db, "race")).results, null);
  assert.equal(db.session("race").source, "jolpica+openf1-pending");
  const count = feeds.requests.length;
  assert.equal((await request(db, "race")).results, null);
  assert.equal(feeds.requests.length, count);
});

test("a failed refresh retains the cached fallback classification", async () => {
  const db = makeDb();
  const feeds = mockFeeds();
  const fallback = await request(db, "race");
  db.seedSession("race", { source: "openf1-fallback", results: fallback.results, attemptedAt: "2000-01-01 00:00:00" });
  feeds.primaryFailure = 503;
  feeds.sessions = [];
  assert.deepEqual(await request(db, "race"), fallback);
  assert.deepEqual(JSON.parse(db.session("race").results_json), fallback.results);
  assert.equal(db.session("race").source, "openf1-fallback");
});

test("fallback cache writes cannot overwrite a concurrent completed classification", async () => {
  const db = makeDb();
  const official = [{ position: "1", number: "3" }];
  db.seedSession("race", { results: official, status: "complete" });
  await setPendingSessionFallback(db, 2026, 16, "race", null);
  await upsertSession(db, 2026, 16, "race", "openf1-fallback", "pending", [{ position: "2" }]);
  assert.equal(db.session("race").status, "complete");
  assert.equal(db.session("race").source, "jolpica");
  assert.deepEqual(JSON.parse(db.session("race").results_json), official);
});

test("cache write failures still serve available upstream and fallback results", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const existing of [false, true]) {
    const db = makeDb();
    if (existing) db.seedSession("race");
    db.failWrites = true;
    mockFeeds();
    assert.equal((await request(db, "race")).results.length, 3);
  }
});

test("fallback rejects incomplete rosters, missing podium positions, and other weekends", async () => {
  for (const options of [
    { raceResults: raceResults.slice(0, 2) },
    { raceResults: raceResults.map((row) => ({ ...row, position: row.position + 1 })) },
    { sessions: [{ session_key: 11257, date_start: "2026-04-11T16:00:00+00:00" }] },
    { raceResults: { error: "Temporarily unavailable" } },
  ]) {
    mockFeeds(options);
    assert.equal(await getOpenF1ClassificationFallback(2026, "Malaysia", "Race", "2026-10-04"), null);
  }
});

test("fallback is not fetched for live sessions or unsupported historical seasons", async () => {
  const db = makeDb();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  db.sqlite.prepare("UPDATE races SET race_date = ?").run(tomorrow);
  const feeds = mockFeeds();
  assert.equal((await request(db, "race")).results, null);
  assert.ok(feeds.requests.every((url) => url.hostname === "api.jolpi.ca"));
  const count = feeds.requests.length;
  assert.equal(await getOpenF1ClassificationFallback(2022, "Malaysia", "Race", "2022-10-04"), null);
  assert.equal(feeds.requests.length, count);
});

test("race fallback handles lapped, retired, DNS, and disqualified drivers without inventing ranks", async () => {
  const extraDrivers = [driver(23, "Alex", "Albon", "Williams"), driver(77, "Valtteri", "Bottas", "Cadillac"), driver(11, "Sergio", "Perez", "Cadillac"), driver(16, "Charles", "Leclerc", "Ferrari"), driver(1, "Lando", "Norris", "McLaren")];
  mockFeeds({ drivers: [...drivers, ...extraDrivers], raceResults: [...raceResults,
    { ...flags, position: 4, driver_number: 16, duration: null, number_of_laps: 54 },
    { ...flags, position: null, driver_number: 77, duration: null, number_of_laps: 7, dnf: true },
    { ...flags, position: null, driver_number: 23, duration: null, number_of_laps: 41, dnf: true },
    { ...flags, position: null, driver_number: 11, duration: null, number_of_laps: 0, dns: true },
    { ...flags, position: null, driver_number: 1, duration: null, number_of_laps: 55, dsq: true },
  ] });
  const results = await getOpenF1ClassificationFallback(2026, "Malaysia", "Race", "2026-10-04");
  assert.deepEqual(results.slice(3).map((row) => row.number), ["16", "23", "77", "11", "1"]);
  assert.equal(results[3].status, "+1 Lap");
  assert.equal(results[4].positionText, "R");
  assert.equal(results[6].status, "Did not start");
  assert.equal(results[7].status, "Disqualified");
  assert.equal(results[4].positionReported, false);
  assert.equal(new Set(results.map((row) => row.position)).size, results.length);
  assert.equal(results[3].points, undefined);
});

test("qualifying fallback ranks no-time drivers from their cached practice result", async () => {
  const db = makeDb();
  db.seedSession("fp3", { source: "openf1", status: "complete", results: [
    { driverNumber: 23, position: 18, lapTime: "1:38.000" },
    { driverNumber: 77, position: 19, lapTime: "1:39.000" },
  ] });
  mockFeeds({ drivers: [...drivers, driver(23, "Alex", "Albon", "Williams"), driver(77, "Valtteri", "Bottas", "Cadillac")], qualifyingResults: [...qualifyingResults,
    { ...flags, position: null, driver_number: 77, duration: [null, null, null], number_of_laps: 0 },
    { ...flags, position: null, driver_number: 23, duration: [null, null, null], number_of_laps: 0 },
  ] });
  const response = await request(db, "qualifying");
  assert.deepEqual(response.results.slice(3).map((row) => row.number), ["23", "77"]);
  assert.ok(response.results.slice(3).every((row) => row.noResult && row.qualifyingPositionKnown));
});

test("a corrupt retry timestamp allows recovery instead of freezing a pending cache", async () => {
  const db = makeDb();
  db.seedSession("race", { source: "jolpica+openf1-pending", attemptedAt: "invalid" });
  const feeds = mockFeeds();
  assert.equal((await request(db, "race")).results.length, 3);
  assert.ok(feeds.requests.some((url) => url.hostname === "api.jolpi.ca"));
});

test("Jolpica race results preserve fastest-lap details and avoid a redundant fetch", async () => {
  const row = { position: "1", Driver: { driverId: "max_verstappen" }, FastestLap: { rank: "1", lap: "55", Time: { time: "1:38.220" } } };
  const feeds = mockFeeds({ jolpicaRows: [row] });
  assert.deepEqual(await getJolpicaRaceResults("2026", "16"), [row]);
  assert.equal(feeds.requests.length, 1);
  row.FastestLap.rank = "2";
  assert.deepEqual((await getJolpicaRaceResults("2026", "16"))[0].FastestLap, { ...row.FastestLap, rank: "1" });
});
