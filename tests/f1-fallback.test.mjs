import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { build } from "esbuild";

async function loadRoute(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

const [{ GET: getSchedule }, { GET: getStandings }] = await Promise.all([
  loadRoute("src/pages/api/f1/schedule.ts"),
  loadRoute("src/pages/api/f1/standings.ts"),
]);

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const brokenDb = {
  prepare() {
    throw new Error("D1 temporarily unavailable");
  },
};
let edgeAccesses = 0;
const edgeCache = {
  default: {
    async match() {
      edgeAccesses++;
      return Response.json({ races: [], standings: [] });
    },
    async put() {
      edgeAccesses++;
    },
  },
};
const season = new Date().getUTCFullYear();
const race = {
  season: String(season),
  round: "1",
  raceName: "Test Grand Prix",
  date: `${season}-03-01`,
  time: "12:00:00Z",
  Circuit: {
    circuitId: "test",
    circuitName: "Test Circuit",
    Location: { locality: "Test City", country: "Test Country" },
  },
};

test("schedule serves upstream races when D1 reads and writes fail", async (t) => {
  t.mock.method(console, "error", () => {});
  edgeAccesses = 0;
  globalThis.fetch = async () => Response.json({ MRData: { RaceTable: { Races: [race] } } });
  const response = await getSchedule({
    url: new URL(`https://example.test/api/f1/schedule?season=${season}`),
    locals: { runtime: { env: { DB: brokenDb }, caches: edgeCache } },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).races, [race]);
  assert.equal(edgeAccesses, 0);
});

test("schedule does not cache an empty current-season calendar", async (t) => {
  t.mock.method(console, "error", () => {});
  globalThis.fetch = async () => Response.json({ MRData: { RaceTable: { Races: [] } } });
  const response = await getSchedule({
    url: new URL(`https://example.test/api/f1/schedule?season=${season}`),
    locals: { runtime: { env: { DB: brokenDb } } },
  });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("standings serve upstream data when D1 reads and writes fail", async (t) => {
  t.mock.method(console, "error", () => {});
  edgeAccesses = 0;
  const driver = {
    position: "1",
    points: "25",
    wins: "1",
    Driver: { driverId: "test_driver", givenName: "Test", familyName: "Driver" },
    Constructors: [{ constructorId: "test_team", name: "Test Team" }],
  };
  globalThis.fetch = async () => Response.json({
    MRData: { StandingsTable: { StandingsLists: [{ round: "1", DriverStandings: [driver] }] } },
  });
  const response = await getStandings({
    url: new URL(`https://example.test/api/f1/standings?season=${season}&type=drivers`),
    locals: { runtime: { env: { DB: brokenDb }, caches: edgeCache } },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).standings, [driver]);
  assert.equal(edgeAccesses, 0);
});
