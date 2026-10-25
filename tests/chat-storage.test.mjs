import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/lib/chat/storage.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { storageFailureDetails, ChatStorageError, savedCitations } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('storage diagnostics classify nested failures without returning SQL, values, or raw messages', () => {
  const error = new ChatStorageError('read_messages', new Error('D1_ERROR: no such column: persona; private-question-and-bound-values'));
  assert.deepEqual(storageFailureDetails(error), { kind: 'schema_missing', migration: '0004_chat.sql' });
  assert.deepEqual(storageFailureDetails(new Error('SQLITE_BUSY: database is locked')), { kind: 'busy' });
  assert.deepEqual(storageFailureDetails(new Error('Durable Object is resetting due to a code update')), { kind: 'runtime_reset' });
  assert.deepEqual(storageFailureDetails(new Error('private-question-and-bound-values')), { kind: 'unknown' });
  assert.deepEqual(savedCitations('null'), []);
  assert.deepEqual(savedCitations('[{"title":"External","url":"https://evil.test"},{"title":"About","url":"/about/"}]'), [{ title: 'About', url: '/about/' }]);
});
