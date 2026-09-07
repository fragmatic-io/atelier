// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { MemoryJournal } from './journal.mjs';
const sleep = (ms, signal) =>
  new Promise((ok, bad) => {
    if (signal?.aborted) return bad(signal.reason ?? new Error('Cancelled'));
    const stop = () => {
        clearTimeout(timer);
        bad(signal.reason ?? new Error('Cancelled'));
      },
      timer = setTimeout(() => {
        signal?.removeEventListener('abort', stop);
        ok();
      }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
export class AgentClient {
  constructor({
    transport,
    journal = new MemoryJournal(),
    tools = [],
    pollIntervalMs = 700,
    onError = () => {},
  }) {
    if (typeof transport !== 'function') throw new Error('Supply an authenticated host transport');
    Object.assign(this, { transport, journal, pollIntervalMs, onError });
    this.listeners = new Set();
    this.controllers = new Map();
    this.tools = new Map(tools.map((t) => [t.name, t]));
    this.executing = new Map();
    this.closed = false;
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e) {
    for (const fn of this.listeners)
      try {
        fn(e);
      } catch (error) {
        this.onError(error);
      }
  }
  async rpc(action, input = {}, signal) {
    if (this.closed) throw new Error('Agent client is closed');
    return this.transport({ action, ...input }, { signal });
  }
  list() {
    return this.rpc('list');
  }
  create(input = {}) {
    return this.rpc('create', { input });
  }
  read(threadId) {
    return this.rpc('read', { threadId });
  }
  async send(
    threadId,
    message,
    { mode = 'model', attachments = [], requestId = crypto.randomUUID(), signal } = {},
  ) {
    const input = { message, mode, attachments, requestId },
      key = `outbox:${threadId}:${requestId}`;
    await this.journal.set(key, { threadId, input });
    this.emit({ type: 'message.pending', threadId, message, requestId });
    try {
      const r = await this.rpc('turn', { threadId, input }, signal);
      await this.journal.delete(key);
      this.emit({ type: 'turn.admitted', threadId, ...r });
      return r;
    } catch (e) {
      this.emit({ type: 'message.retryable', threadId, requestId, error: e.message });
      throw e;
    }
  }
  async retryOutbox() {
    const out = [];
    for (const row of await this.journal.list('outbox:'))
      try {
        const r = await this.rpc('turn', row.value);
        await this.journal.delete(row.id);
        out.push({ admitted: true, ...r });
      } catch (e) {
        out.push({ admitted: false, error: e.message });
      }
    return out;
  }
  watch(threadId, { after = 0 } = {}) {
    this.stop(threadId);
    const controller = new AbortController();
    this.controllers.set(threadId, controller);
    let cursor = after;
    const done = (async () => {
      let failures = 0;
      while (!controller.signal.aborted && !this.closed) {
        try {
          const events = await this.rpc(
            'events',
            { threadId, input: { after: cursor } },
            controller.signal,
          );
          for (const e of events) {
            if (e.id <= cursor) continue;
            this.emit({ ...e, threadId });
            cursor = e.id;
            await this.journal.set(`cursor:${threadId}`, cursor);
          }
          failures = 0;
          await sleep(this.pollIntervalMs, controller.signal);
        } catch (e) {
          if (controller.signal.aborted) break;
          this.emit({ type: 'connection.retrying', threadId, error: e.message });
          if ([401, 403, 404, 409].includes(e.status)) {
            this.onError(e);
            break;
          }
          await sleep(Math.min(10000, 500 * 2 ** Math.min(++failures, 4)), controller.signal).catch(
            () => {},
          );
        }
      }
    })();
    return { stop: () => this.stop(threadId), done };
  }
  stop(threadId) {
    this.controllers.get(threadId)?.abort();
    this.controllers.delete(threadId);
  }
  cancel(threadId) {
    return this.rpc('cancel', { threadId });
  }
  archive(threadId) {
    this.stop(threadId);
    return this.rpc('archive', { threadId });
  }
  async purge(threadId) {
    this.stop(threadId);
    const r = await this.rpc('purge', { threadId });
    for (const item of await this.journal.list())
      if (item.id.includes(threadId)) await this.journal.delete(item.id);
    return r;
  }
  artifact(threadId, artifactId) {
    return this.rpc('artifact', { threadId, artifactId });
  }
  pin(threadId, artifactId, pinned = true) {
    return this.rpc('pin', { threadId, artifactId, input: { pinned } });
  }
  revise(threadId, artifactId, revision, data) {
    return this.rpc('revise', { threadId, artifactId, input: { revision, data } });
  }
  feedback(threadId, messageId, value) {
    return this.rpc('feedback', { threadId, input: { messageId, value } });
  }
  proposeAction(threadId, artifactId, input) {
    return this.rpc('artifact-action', { threadId, artifactId, input });
  }
  async attach(threadId, file) {
    if (file.size > 1024 * 1024) throw new Error('Attachment limit is 1 MB');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return this.rpc('attach', {
      threadId,
      input: { name: file.name, mediaType: file.type || 'text/plain', base64: btoa(binary) },
    });
  }
  async executeClientTool(threadId, call, { confirmed = false } = {}) {
    const key = `client:${threadId}:${call.id}`;
    if (this.executing.has(key)) return this.executing.get(key);
    const promise = (async () => {
      const old = await this.journal.get(key);
      if (old?.completion)
        return this.rpc('client-result', { threadId, callId: call.id, input: old.completion });
      if (old) throw new Error('Client tool was interrupted; reconcile or cancel before retrying');
      const tool = this.tools.get(call.capabilityId);
      if (!tool) throw new Error('This client tool is not registered');
      const lease = await this.rpc('client-lease', {
        threadId,
        callId: call.id,
        input: { confirmed, inputHash: call.inputHash },
      });
      await this.journal.set(key, { started: true });
      let completion;
      try {
        completion = { leaseToken: lease.leaseToken, result: await tool.execute(lease.input) };
      } catch {
        completion = {
          leaseToken: lease.leaseToken,
          error: true,
          uncertain: call.contract?.kind === 'command',
        };
      }
      await this.journal.set(key, { completion });
      return this.rpc('client-result', { threadId, callId: call.id, input: completion });
    })();
    this.executing.set(key, promise);
    try {
      return await promise;
    } finally {
      this.executing.delete(key);
    }
  }
  async close({ clear = false } = {}) {
    for (const t of [...this.controllers.keys()]) this.stop(t);
    this.closed = true;
    this.listeners.clear();
    if (clear) await this.journal.clear();
    await this.journal.close();
  }
}
export function defineClientTool(tool) {
  if (!tool?.name || !tool.inputSchema || !tool.outputSchema || typeof tool.execute !== 'function')
    throw new Error('Client tools require names, schemas and an implementation');
  return Object.freeze({ ...tool });
}
export function sameOriginTransport(endpoint, { csrf = () => null, fetcher = fetch } = {}) {
  const url = new URL(endpoint, location.href);
  if (url.origin !== location.origin)
    throw new Error('Use a same-origin authenticated host endpoint');
  return async (body, { signal } = {}) => {
    const res = await fetcher(url, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf() ? { 'X-CSRF-Token': csrf() } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    if (!res.ok)
      throw Object.assign(new Error(data.error?.message ?? 'Request failed'), {
        status: res.status,
        code: data.error?.code,
      });
    return data;
  };
}
