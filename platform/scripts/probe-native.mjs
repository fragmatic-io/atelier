// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { writeFile } from 'node:fs/promises';
const results = [];
for (const name of ['inventory', 'calculator', 'host', 'service', 'http'])
  try {
    await import('../packages/conversation/src/' + name + '.mjs');
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.stack });
  }
try {
  const h = await import('../tests/v21/helpers.mjs');
  const f = await h.fixture();
  try {
    await h.scanned(f);
    const { ConversationService } = await import('../packages/conversation/src/service.mjs');
    const c = new ConversationService(f.service);
    const p = c.setup(f.who, f.tenant.id, f.project.id, { tools: [], componentIds: [] });
    const t = c.create(f.who, f.tenant.id, f.project.id, { title: 'Native probe' });
    const j = c.turn(f.who, f.tenant.id, f.project.id, t.id, {
      message: 'Hello',
      mode: 'demo',
      requestId: 'native-probe-request',
    });
    await h.runJob(f);
    const read = c.read(f.who, f.tenant.id, f.project.id, t.id);
    results.push({
      name: 'persistent-conversation-probe',
      passed: read.messages.length === 2 && read.activeJobId === null,
      profile: p.id,
      thread: t.id,
      job: j.jobId,
    });
  } finally {
    f.db.close();
  }
} catch (e) {
  results.push({
    name: 'persistent-conversation-probe',
    passed: false,
    error: e.stack,
    code: e.code,
    details: e.details,
  });
}
await writeFile('evidence/current/native-probe.json', JSON.stringify(results, null, 2));
if (results.some((r) => !r.passed)) process.exitCode = 1;
