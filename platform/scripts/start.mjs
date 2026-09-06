// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { loadConfig, openServices } from '../packages/control-plane/src/config.mjs';
import { createControlServer } from '../packages/control-plane/src/server.mjs';
import { BuildPipeline, Worker } from '../packages/control-plane/src/pipeline.mjs';
import { seedDemo } from './seed-demo.mjs';
const demo = process.argv.includes('--demo');
const config = await loadConfig();
if (demo && config.production) throw new Error('Demo seeding is disabled in production');
const { db, service } = openServices(config);
if (demo) {
  const result = await seedDemo(service);
  if (result.existing)
    console.log('Existing workspace retained. Sign in with your existing account.');
  else
    console.log(
      `\nDevelopment account created (password is shown once):\nEmail: ${result.email}\nPassword: ${result.password}\n\nThese credentials were generated locally, not shipped in the archive.\n`,
    );
}
const worker = new Worker(new BuildPipeline(service));
const control = createControlServer(service, {
  ...config,
  worker,
  enableExamples: demo || config.enableExamples,
});
control.server.listen(config.port, config.bind, () => {
  console.log(`Atelier Studio: ${config.origin}`);
  if (config.workerEnabled) worker.start();
});
const cleanup = setInterval(() => {
  try {
    service.store.cleanup();
  } catch (e) {
    console.error(JSON.stringify({ event: 'cleanup.failed', code: e.code ?? 'ERROR' }));
  }
}, 60000);
cleanup.unref();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(cleanup);
  await control.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
