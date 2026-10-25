import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const built = await build({ entryPoints: ['src/lib/chat/time.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { localDayWindow, validTimeZone } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
for (const [zone, now, expected] of [
  ['Europe/Athens', '2026-10-20T20:00:00Z', '2026-10-20T21:00:00Z'],
  ['America/Los_Angeles', '2026-10-20T23:59:59Z', '2026-10-21T07:00:00Z'],
  ['Pacific/Kiritimati', '2026-10-20T12:00:00Z', '2026-10-21T10:00:00Z'],
  ['Asia/Kathmandu', '2026-10-20T12:00:00Z', '2026-10-20T18:15:00Z'],
  ['Europe/Athens', '2026-03-28T22:00:00Z', '2026-03-29T21:00:00Z'],
  ['Europe/Athens', '2026-10-24T21:00:00Z', '2026-10-25T22:00:00Z'],
]) test(`local midnight in ${zone} from ${now}`, () => {
  assert.equal(new Date(localDayWindow(Date.parse(now), zone).resetsAt).toISOString(), new Date(expected).toISOString());
});
test('invalid timezone names are rejected', () => {
  assert.equal(validTimeZone('made-up-zone'), null);
  assert.equal(validTimeZone(null), null);
  assert.equal(validTimeZone('Europe/Athens'), 'Europe/Athens');
});
