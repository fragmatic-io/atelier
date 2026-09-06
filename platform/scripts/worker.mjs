// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Dedicated build process. Production API servers should set ATELIER_WORKER=false.
 * All processes must use the same LOCAL database and master-key configuration.
 */
import { loadConfig, openServices } from '../packages/control-plane/src/config.mjs';
import { BuildPipeline, Worker } from '../packages/control-plane/src/pipeline.mjs';
const config = await loadConfig();
const concurrency = Number(process.env.ATELIER_WORKER_CONCURRENCY ?? 1);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
  throw new Error('Worker concurrency must be 1–4');
const { db, service } = openServices(config);
const worker = new Worker(new BuildPipeline(service), { concurrency });
worker.start();
console.log(
  JSON.stringify({
    event: 'worker.started',
    concurrency,
    deployment: 'single-host-local-filesystem',
  }),
);
// Worker polling intentionally unrefs its interval; this supervised process needs
// a keepalive independent of whether the queue is empty.
const keepalive = setInterval(() => {}, 30000);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    clearInterval(keepalive);
    await worker.stop();
    db.close();
  });
