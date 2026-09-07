import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordSeedFailure } from '../../scripts/seed-experiences.mjs';

const run = promisify(execFile);

test('seed certification failure records the original error without forging an access scope', () => {
  let finished = null;
  const job = { tenant_id: 'ten_test', project_id: 'prj_test', id: 'job_test' };
  recordSeedFailure(
    {
      db: {
        get(sql, ...params) {
          assert.match(sql, /tenant_id=\? AND project_id=\? AND id=\?/);
          assert.deepEqual(params, ['ten_test', 'prj_test', 'job_test']);
          return { status: 'running' };
        },
      },
      service: {
        store: {
          finish(...args) {
            finished = args;
          },
        },
      },
    },
    job,
    Object.assign(new Error('Browser unavailable'), { code: 'CLI_EXIT' }),
  );
  assert.deepEqual(finished, [job, null, { code: 'CLI_EXIT', message: 'Browser unavailable' }]);
});

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
