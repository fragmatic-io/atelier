import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('reference certification fails when a requested kit does not exist', async () => {
  await assert.rejects(
    run(process.execPath, ['scripts/certify-examples.mjs'], {
      cwd: new URL('../..', import.meta.url),
      env: { ...process.env, ATELIER_ONLY_KIT: 'missing-reference-kit' },
    }),
    (error) => {
      assert.notEqual(error.code, 0);
      assert.match(`${error.stderr}\n${error.stdout}`, /Unknown reference kit/);
      return true;
    },
  );
});
