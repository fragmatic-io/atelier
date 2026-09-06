// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mountArtifactFrame } from './frame.mjs';
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of children.flat())
    if (c != null) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
};
export function confirmAction(
  root,
  { title = 'Confirm this action', description = '', input, accept = 'Confirm' } = {},
) {
  return new Promise((resolve) => {
    let accepted = false;
    const d = el(
      'dialog',
      { class: 'agent-dialog' },
      el('span', { class: 'eyebrow', text: 'YOU STAY IN CONTROL' }),
      el('h3', { text: title }),
      el('p', { text: description }),
      input ? el('pre', { text: JSON.stringify(input, null, 2) }) : null,
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'button ghost', text: 'Cancel', onclick: () => d.close() }),
        el('button', {
          class: 'button primary',
          text: accept,
          onclick: () => {
            accepted = true;
            d.close();
          },
        }),
      ),
    );
    d.onclose = () => {
      d.remove();
      resolve(accepted);
    };
    root.append(d);
    d.showModal();
    d.querySelector('button').focus();
  });
}
export function mountAgentChat(
  root,
  {
    client,
    name = 'Project assistant',
    subtitle = 'Your context. Your tools. A useful next step.',
    mode = 'model',
    context = {},
    onTool,
    onError = () => {},
  } = {},
) {
  const state = {
    thread: null,
    busy: false,
    epoch: 0,
    disposed: false,
    attachments: [],
    art: null,
  };
  let frame = null,
    watch = null,
    refreshing = false,
    again = false;
  const notice = el('div', { class: 'chat-notice', role: 'status', 'aria-live': 'polite' }),
    list = el('div', { class: 'chat-messages', role: 'log', 'aria-label': 'Conversation' }),
    history = el('select', { 'aria-label': 'Conversation history' }),
    input = el('textarea', {
      rows: '2',
      placeholder: 'Ask, compare, or find the next step…',
      'aria-label': 'Message',
    }),
    send = el('button', { class: 'button primary', type: 'submit', text: 'Send' }),
    stop = el('button', {
      class: 'button ghost',
      type: 'button',
      text: 'Stop',
      onclick: () => run(() => client.cancel(state.thread)),
    }),
    attachments = el('div', { class: 'attachment-list' }),
    file = el('input', {
      type: 'file',
      accept: '.txt,.csv,.json,.png,.jpg,.jpeg,.webp',
      class: 'file-input',
      'aria-label': 'Attach context',
    }),
    artifactTitle = el('h3', { text: 'An artifact belongs here.' }),
    artifactMeta = el('p', { class: 'muted', text: 'Interactive work, kept beside its evidence.' }),
    artifactBody = el('div', { class: 'artifact-body' });
  const newButton = el('button', {
      class: 'button ghost',
      text: 'New conversation',
      onclick: () => run(newThread),
    }),
    deleteButton = el('button', {
      class: 'button ghost',
      text: 'Delete',
      onclick: () =>
        run(async () => {
          if (
            state.thread &&
            (await confirmAction(root, {
              title: 'Delete this conversation?',
              description:
                'This removes its transcript, attachments and generated artifact data from the active database.',
              accept: 'Delete conversation',
            }))
          ) {
            await client.purge(state.thread);
            await newThread();
          }
        }),
    });
  const form = el(
    'form',
    { class: 'chat-composer' },
    input,
    attachments,
    el(
      'div',
      { class: 'composer-actions' },
      el('label', { class: 'button ghost' }, 'Attach context', file),
      el('span', { class: 'muted micro', text: 'Enter to send · Shift+Enter for a new line' }),
      stop,
      send,
    ),
  );
  const heading = el(
    'div',
    { class: 'chat-heading' },
    el('span', {
      class: 'eyebrow',
      text: mode === 'demo' ? 'OFFLINE REFERENCE DEMO' : 'PROJECT ASSISTANT',
    }),
    el('h2', { text: name }),
    el('p', { class: 'muted', text: subtitle }),
    el('div', { class: 'row' }, history, newButton, deleteButton),
  );
  root.replaceChildren(
    el(
      'div',
      { class: 'atelier-chat' },
      el('section', { class: 'chat-pane' }, heading, notice, list, form),
      el(
        'aside',
        { class: 'chat-artifacts', 'aria-label': 'Artifact workspace' },
        el(
          'div',
          { class: 'artifact-heading' },
          el('span', { class: 'eyebrow', text: 'ARTIFACT WORKSPACE' }),
          artifactTitle,
          artifactMeta,
        ),
        artifactBody,
      ),
    ),
  );
  function error(e) {
    notice.textContent = e.message;
    state.busy = false;
    updateBusy();
    onError(e);
  }
  async function run(fn) {
    try {
      return await fn();
    } catch (e) {
      error(e);
    }
  }
  function updateBusy() {
    send.disabled = state.busy;
    stop.hidden = !state.busy;
  }
  async function loadHistory() {
    const threads = await client.list();
    history.replaceChildren(...threads.map((t) => el('option', { value: t.id, text: t.title })));
    if (state.thread) history.value = state.thread;
    return threads;
  }
  async function newThread() {
    const t = await client.create({
      title:
        'Workspace ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      context,
    });
    await switchThread(t.id);
    await loadHistory();
  }
  async function switchThread(id) {
    watch?.stop();
    state.epoch++;
    state.thread = id;
    state.attachments = [];
    attachments.replaceChildren();
    frame?.destroy();
    frame = null;
    artifactBody.replaceChildren();
    artifactTitle.textContent = 'An artifact belongs here.';
    artifactMeta.textContent = 'Interactive work, kept beside its evidence.';
    await refresh();
    watch = client.watch(id);
  }
  history.onchange = () => run(() => switchThread(history.value));
  file.onchange = () =>
    run(async () => {
      if (!file.files?.[0]) return;
      if (!state.thread) await newThread();
      const a = await client.attach(state.thread, file.files[0]);
      state.attachments.push(a);
      attachments.append(el('span', { class: 'tag', text: a.name }));
      file.value = '';
    });
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      if (!input.value.trim() || state.busy) return;
      const message = input.value;
      input.value = '';
      state.busy = true;
      updateBusy();
      if (!state.thread) await newThread();
      await client.send(state.thread, message, {
        mode,
        attachments: state.attachments.map((a) => a.id),
      });
      state.attachments = [];
      attachments.replaceChildren();
      await refresh();
    });
  };
  async function execute(call, thread = state.thread) {
    if (!onTool)
      throw new Error(
        'Execute this tool inside its authenticated host application. Studio does not impersonate end users.',
      );
    const result = await onTool({
      threadId: thread,
      call,
      confirm: (detail) => confirmAction(root, detail),
    });
    await refresh();
    return result;
  }
  async function refresh() {
    if (!state.thread || state.disposed) return;
    if (refreshing) {
      again = true;
      return;
    }
    refreshing = true;
    const epoch = state.epoch,
      thread = state.thread;
    try {
      const current = await client.read(thread);
      if (state.disposed || epoch !== state.epoch) return;
      state.busy = Boolean(current.activeJobId);
      updateBusy();
      notice.textContent = state.busy
        ? 'Working on this turn. Application actions remain subject to current host authorization.'
        : '';
      list.replaceChildren();
      if (!current.messages.length) {
        const emptyState = el(
          'div',
          { class: 'chat-empty' },
          el('div', { class: 'spark', text: '✦' }),
          el('h3', { text: 'What would you like to make clearer?' }),
          el('p', {
            class: 'muted',
            text: 'Start with the context you have. Turn an answer into something useful.',
          }),
        );
        list.append(emptyState);
      }
      for (const m of current.messages) {
        if (m.role === 'system') continue;
        const body = m.content ?? {},
          block = el(
            'article',
            { class: 'chat-message ' + m.role },
            el('span', {
              class: 'message-role',
              text: m.role === 'user' ? 'You' : m.role === 'assistant' ? name : 'Tool result',
            }),
          );
        block.append(
          el('div', {
            class: 'message-text',
            text:
              m.role === 'tool'
                ? `${body.capabilityId ?? body.name ?? 'Calculation'} · ${body.status ?? 'complete'}`
                : (body.text ?? ''),
          }),
        );
        for (const a of body.artifacts ?? [])
          block.append(
            el(
              'button',
              { class: 'artifact-link', onclick: () => run(() => showArtifact(a.id)) },
              el('span', { class: 'artifact-icon', text: '▧' }),
              el(
                'span',
                {},
                el('strong', { text: a.title }),
                el('small', {
                  text:
                    a.grounding === 'static'
                      ? 'Reference interaction'
                      : a.grounding === 'generated'
                        ? 'Generated creative draft'
                        : 'Authorized project data',
                }),
              ),
              el('span', { text: 'Open →' }),
            ),
          );
        if (m.role === 'assistant') {
          block.append(
            el(
              'div',
              { class: 'message-feedback' },
              el('button', {
                class: 'button micro ghost',
                text: 'Helpful',
                onclick: () => run(() => client.feedback(thread, m.id, 1)),
              }),
              el('button', {
                class: 'button micro ghost',
                text: 'Not helpful',
                onclick: () => run(() => client.feedback(thread, m.id, -1)),
              }),
            ),
          );
          for (const s of body.suggestions ?? [])
            block.append(
              el('button', {
                class: 'suggestion',
                text: s,
                onclick: () => {
                  input.value = s;
                  input.focus();
                },
              }),
            );
        }
        list.append(block);
      }
      for (const c of current.pending ?? []) {
        const card = el(
          'div',
          { class: 'tool-card' },
          el('span', {
            class: 'eyebrow',
            text: c.contract.kind === 'command' ? 'ACTION PROPOSAL' : 'CONTEXT QUERY',
          }),
          el('strong', { text: c.capabilityId }),
          el('pre', { text: JSON.stringify(c.input, null, 2) }),
          el('p', {
            class: 'muted micro',
            text:
              c.status === 'uncertain'
                ? 'Outcome unknown. Reconcile in the host rather than retrying blindly.'
                : 'Nothing executes merely because the assistant proposed it.',
          }),
        );
        if (c.status === 'pending')
          card.append(
            el('button', {
              class: 'button primary',
              text: c.contract.kind === 'command' ? 'Review and confirm' : 'Load context',
              onclick: () => run(() => execute(c, thread)),
            }),
            el('button', {
              class: 'button ghost',
              text: 'Decline',
              onclick: () =>
                run(async () => {
                  await client.rpc('deny', { threadId: thread, callId: c.id });
                  await refresh();
                }),
            }),
          );
        list.append(card);
      }
      list.scrollTop = list.scrollHeight;
    } finally {
      refreshing = false;
      if (again) {
        again = false;
        queueMicrotask(() => refresh().catch(error));
      }
    }
  }
  async function showArtifact(id) {
    const epoch = state.epoch,
      a = await client.artifact(state.thread, id);
    if (state.disposed || state.epoch !== epoch) return;
    state.art = a;
    frame?.destroy();
    artifactTitle.textContent = a.title;
    artifactMeta.textContent = `Revision ${a.revision} · ${a.grounding ?? 'reviewed'} · Saved with this conversation`;
    const target = el('div', { class: 'artifact-mount' });
    artifactBody.replaceChildren(
      el(
        'div',
        { class: 'artifact-toolbar' },
        el('button', {
          class: 'button ghost',
          text: 'Pin',
          onclick: () => run(() => client.pin(state.thread, id, true)),
        }),
        el('button', {
          class: 'button ghost',
          text: 'Refresh',
          onclick: () => run(() => showArtifact(id)),
        }),
        el('button', { class: 'button ghost', text: 'Edit data', onclick: () => edit(a) }),
        el('button', {
          class: 'button ghost',
          text: 'Export data',
          onclick: () => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    { title: a.title, data: a.data, grounding: a.grounding, revision: a.revision },
                    null,
                    2,
                  ),
                ],
                { type: 'application/json' },
              ),
            );
            el('a', { href: url, download: 'atelier-artifact.json' }).click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
          },
        }),
      ),
      target,
    );
    frame = mountArtifactFrame(target, a.preview, {
      title: a.title,
      onError: error,
      onAction: async (action) => {
        const proposal = await client.proposeAction(state.thread, id, action);
        const fresh = await client.read(state.thread);
        const c = fresh.pending.find((c) => c.id === proposal.callId);
        if (!c) throw new Error('Action is no longer available');
        return execute(c);
      },
    });
  }
  function edit(a) {
    const d = el('dialog', { class: 'agent-dialog' }),
      area = el('textarea', { rows: '14', 'aria-label': 'Artifact JSON data' }),
      err = el('p', { role: 'alert' });
    area.value = JSON.stringify(a.data, null, 2);
    d.append(
      el('h3', { text: 'Create an edited revision' }),
      el('p', {
        class: 'muted',
        text: 'Edits create a new immutable, user-edited artifact—not verified business data.',
      }),
      area,
      err,
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'button ghost', text: 'Cancel', onclick: () => d.close() }),
        el('button', {
          class: 'button primary',
          text: 'Save revision',
          onclick: async () => {
            try {
              const result = await client.revise(
                state.thread,
                a.id,
                a.revision,
                JSON.parse(area.value),
              );
              d.close();
              await showArtifact(result.id);
              await refresh();
            } catch (e) {
              err.textContent = e.message;
            }
          },
        }),
      ),
    );
    d.onclose = () => d.remove();
    root.append(d);
    d.showModal();
  }
  const off = client.on((e) => {
    if (e.threadId !== state.thread) return;
    if (e.type === 'connection.retrying')
      notice.textContent =
        'Connection interrupted. The durable outbox retains your pending request.';
    if (
      [
        'message.created',
        'artifact.created',
        'artifact.revised',
        'tool.proposed',
        'tool.completed',
        'tool.denied',
        'turn.completed',
        'turn.failed',
        'turn.cancelled',
        'turn.queued',
        'turn.admitted',
      ].includes(e.type)
    )
      refresh().catch(error);
  });
  run(async () => {
    const history = await loadHistory();
    if (history[0]) await switchThread(history[0].id);
    else await newThread();
  });
  return {
    newConversation: () => run(newThread),
    showArtifact,
    destroy() {
      state.disposed = true;
      state.epoch++;
      watch?.stop();
      frame?.destroy();
      off();
      root.replaceChildren();
    },
  };
}
