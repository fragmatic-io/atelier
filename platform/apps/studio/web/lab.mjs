// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { AgentClient, sameOriginTransport } from '/assets/agent-client.mjs';
import { IndexedDbJournal } from '/assets/agent-journal.mjs';
import { mountAgentChat, confirmAction } from '/assets/chat.mjs';
import { mountArtifactFrame } from '/assets/artifact-frame.mjs';
const root = document.getElementById('lab');
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children.flat())
    if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
};
const state = {
  me: null,
  t: null,
  p: null,
  projects: [],
  tab: 'forge',
  epoch: 0,
  frame: null,
  chat: null,
  client: null,
  mode: 'model',
};
const base = () => `/api/tenants/${state.t}/projects/${state.p}`;
async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(state.me?.csrf ? { 'X-CSRF-Token': state.me.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(v.error?.message ?? 'Request failed'), {
      status: r.status,
      code: v.error?.code,
    });
  return v;
}
const notice = (e) => {
  const n = document.getElementById('notice');
  if (n) n.textContent = typeof e === 'string' ? e : e.message;
};
const run =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      notice(e);
    }
  };
async function reset() {
  state.epoch++;
  state.frame?.destroy();
  state.frame = null;
  state.chat?.destroy();
  state.chat = null;
  await state.client?.close();
  state.client = null;
}
async function login() {
  const form = el(
    'form',
    { class: 'login' },
    el('div', { class: 'wordmark' }, el('span', { text: 'a' }), 'atelier'),
    el('h1', { text: 'A workspace for useful intelligence.' }),
    el('p', {
      class: 'muted',
      text: 'Generate, inspect and publish experiences for your projects.',
    }),
  );
  const email = el('input', {
      type: 'email',
      required: '',
      autocomplete: 'username',
      value: 'builder@example.test',
      'aria-label': 'Email',
    }),
    password = el('input', {
      type: 'password',
      required: '',
      autocomplete: 'current-password',
      'aria-label': 'Password',
    }),
    error = el('p', { role: 'alert' });
  form.append(
    el('label', {}, 'Email', email),
    el('label', {}, 'Password', password),
    error,
    el('button', { class: 'button primary', type: 'submit', text: 'Open workspace' }),
  );
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/login', { email: email.value, password: password.value });
      await boot();
    } catch (err) {
      error.textContent = err.message;
    }
  };
  root.replaceChildren(form);
}
async function projects() {
  state.projects = await api(`/api/tenants/${state.t}/projects`);
  state.p = state.projects.some((p) => p.id === state.p)
    ? state.p
    : (state.projects.find((p) => p.modelId)?.id ?? state.projects[0]?.id);
}
function shell() {
  const tenants = el(
    'select',
    { 'aria-label': 'Tenant' },
    ...state.me.tenants.map((t) => el('option', { value: t.id, text: t.name })),
  );
  tenants.value = state.t;
  tenants.onchange = run(async () => {
    await reset();
    state.t = tenants.value;
    state.p = null;
    await projects();
    shell();
    await render();
  });
  const ps = el(
    'select',
    { 'aria-label': 'Project' },
    ...state.projects.map((p) => el('option', { value: p.id, text: p.name })),
  );
  ps.value = state.p;
  ps.onchange = run(async () => {
    await reset();
    state.p = ps.value;
    await render();
  });
  const nav = el('nav', { class: 'nav', 'aria-label': 'Experience Lab' });
  for (const [key, label] of [
    ['forge', 'Component Forge'],
    ['assistant', 'Agent workspace'],
    ['inventory', 'Project knowledge'],
  ])
    nav.append(
      el('button', {
        'data-tab': key,
        class: key === state.tab ? 'active' : '',
        text: label,
        onclick: run(async () => {
          await reset();
          state.tab = key;
          await render();
        }),
      }),
    );
  const side = el(
    'aside',
    { class: 'sidebar' },
    el('div', { class: 'wordmark' }, el('span', { text: 'a' }), 'atelier'),
    el('label', {}, 'TENANT', tenants),
    el('label', {}, 'PROJECT', ps),
    nav,
    el(
      'div',
      { class: 'sidebar-footer' },
      el('a', { href: '/', class: 'button', text: 'Control plane ↗' }),
      el('p', {
        class: 'micro muted',
        text: 'Every source release is reviewed, versioned and revocable.',
      }),
      el('button', {
        class: 'button',
        text: 'Sign out',
        onclick: run(async () => {
          await reset();
          await api('/api/auth/logout', {});
          await login();
        }),
      }),
    ),
  );
  root.replaceChildren(
    el(
      'div',
      { class: 'shell' },
      side,
      el(
        'main',
        { class: 'main' },
        el(
          'header',
          { class: 'topbar' },
          el('span', { class: 'crumb', text: 'WORKSPACE / EXPERIENCE LAB' }),
          el(
            'div',
            { class: 'row' },
            el('span', { class: 'tag', text: '2.3 · reconstructed source' }),
            el('button', {
              class: 'button',
              text: 'Switch theme',
              onclick: () => {
                document.documentElement.dataset.theme =
                  document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
              },
            }),
          ),
        ),
        el(
          'div',
          { class: 'workspace' },
          el('div', { id: 'notice', class: 'notice', role: 'status', 'aria-live': 'polite' }),
          el('div', { id: 'content' }),
        ),
      ),
    ),
  );
}
function heading(title, description, actions = []) {
  return el(
    'div',
    { class: 'page-heading' },
    el(
      'div',
      {},
      el('span', { class: 'eyebrow', text: 'BUILD ON WHAT YOUR APP ALREADY KNOWS' }),
      el('h1', { text: title }),
      el('p', { class: 'muted', text: description }),
    ),
    el('div', { class: 'row' }, ...actions),
  );
}
async function render() {
  notice('');
  document
    .querySelectorAll('.nav button')
    .forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const content = document.getElementById('content');
  content.replaceChildren(el('p', { class: 'empty', text: 'Loading current project context…' }));
  if (!state.p) {
    content.replaceChildren(el('a', { href: '/', text: 'Create a project in the control plane.' }));
    return;
  }
  const epoch = state.epoch;
  if (state.tab === 'forge') await forge(content, epoch);
  else if (state.tab === 'assistant') await assistant(content, epoch);
  else await inventory(content, epoch);
}
function picture() {
  return el(
    'div',
    { class: 'kit-art' },
    ...Array.from({ length: 3 }, () =>
      el(
        'div',
        { class: 'mini-col' },
        ...Array.from({ length: 3 }, () => el('span', { class: 'mini-line' })),
      ),
    ),
  );
}
async function forge(c, epoch) {
  const kits = await api(base() + '/components');
  if (epoch !== state.epoch) return;
  const file = el('input', { type: 'file', accept: '.json', 'aria-label': 'Import source kit' });
  file.onchange = run(async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (f.size > 500000) throw new Error('Source kit exceeds 500 KB');
    const v = await api(base() + '/components', { kit: JSON.parse(await f.text()) });
    await detail(c, v.id, state.epoch);
  });
  c.replaceChildren(
    heading(
      'Make the interface fit the work.',
      'Real React components, project-owned modules and an inspectable artifact lifecycle.',
      [
        file,
        el('button', { class: 'button primary', text: 'Generate component', onclick: generate }),
      ],
    ),
    el(
      'div',
      { class: 'metrics' },
      el(
        'div',
        { class: 'metric' },
        el('strong', { text: kits.length }),
        el('span', { text: 'Project components' }),
      ),
      el(
        'div',
        { class: 'metric' },
        el('strong', { text: kits.filter((k) => k.status === 'published').length }),
        el('span', { text: 'Signed and published' }),
      ),
      el(
        'div',
        { class: 'metric' },
        el('strong', { text: '17' }),
        el('span', { text: 'Browser state/viewport cases' }),
      ),
    ),
  );
  const grid = el('div', { class: 'catalog' });
  for (const kit of kits)
    grid.append(
      el(
        'button',
        { class: 'kit-card', onclick: run(() => detail(c, kit.id, state.epoch)) },
        picture(),
        el(
          'div',
          { class: 'kit-body' },
          el('h3', { text: kit.name }),
          el('p', {
            class: 'muted',
            text: 'Editable source, typed data and task-based browser checks.',
          }),
          el('span', { class: 'badge ' + kit.status, text: kit.status }),
          el('span', { class: 'micro muted', text: ' · ' + kit.digest.slice(0, 10) }),
        ),
      ),
    );
  if (!kits.length)
    grid.append(
      el(
        'div',
        { class: 'panel' },
        el('h3', { text: 'Start with your own task.' }),
        el('p', {
          class: 'muted',
          text: 'Import source or describe the interface your application is missing.',
        }),
      ),
    );
  c.append(grid);
  try {
    const examples = await api(base() + '/source-examples');
    if (epoch !== state.epoch) return;
    const section = el(
      'section',
      { class: 'panel mt24' },
      el('span', { class: 'eyebrow', text: 'ORIGINAL REFERENCE EXPERIENCES' }),
      el('h3', { text: 'Different tasks deserve different interfaces.' }),
      el('p', {
        class: 'muted',
        text: 'Boards, analytics, journeys, learning, booking and creative work. Examples are not the generation ceiling.',
      }),
    );
    const row = el('div', { class: 'row' });
    for (const ex of examples)
      row.append(
        el('button', {
          class: 'button',
          text: ex.name,
          onclick: run(async () => {
            const v = await api(base() + '/components', { kit: ex });
            await detail(c, v.id, state.epoch);
          }),
        }),
      );
    section.append(row);
    c.append(section);
  } catch (e) {
    if (e.status !== 404) notice(e);
  }
}
async function waitJob(id) {
  const epoch = state.epoch;
  for (let i = 0; i < 240; i++) {
    if (epoch !== state.epoch) return;
    const j = await api(base() + '/jobs/' + id);
    if (j.status === 'succeeded') return j;
    if (['failed', 'cancelled'].includes(j.status)) throw new Error(j.error?.message ?? j.status);
    notice((j.stage ?? j.status) + ' · ' + id);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Job still queued/running. Inspect the durable job in the control plane.');
}
async function detail(c, id, epoch) {
  const v = await api(base() + '/components/' + id);
  if (epoch !== state.epoch) return;
  const mount = el('div', { class: 'artifact-mount' }),
    select = el(
      'select',
      { 'aria-label': 'Preview state' },
      ...['ready', 'loading', 'empty', 'error'].map((s) => el('option', { value: s, text: s })),
    );
  const review = el(
    'aside',
    { class: 'panel' },
    el('span', { class: 'eyebrow', text: 'ARTIFACT LIFECYCLE' }),
    el('h3', { text: 'Evidence before publication.' }),
    el('p', {
      class: 'muted',
      text: 'A model cannot approve its own code. Changing source, contracts or the runtime invalidates acceptance.',
    }),
    el('pre', { class: 'micro', text: 'SHA-256\n' + v.digest }),
  );
  c.replaceChildren(
    heading(v.name, v.compiled.kit.description, [
      el('button', {
        class: 'button',
        text: '← All components',
        onclick: run(() => forge(c, state.epoch)),
      }),
      el('span', { class: 'badge ' + v.status, text: v.status }),
    ]),
    el(
      'div',
      { class: 'detail-grid' },
      el(
        'section',
        {},
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'eyebrow', text: 'LIVE ISOLATED REACT PREVIEW' }),
          select,
        ),
        mount,
        el(
          'details',
          { class: 'panel mt20' },
          el('summary', { text: 'Inspect source and contracts' }),
          el('pre', { class: 'source-code', text: v.compiled.kit.source }),
          el('pre', {
            class: 'source-code',
            text: JSON.stringify(v.compiled.kit.dataSchema, null, 2),
          }),
        ),
      ),
      review,
    ),
  );
  if (v.status === 'draft') {
    review.append(
      el('button', {
        class: 'button primary',
        text: 'Run browser certification',
        onclick: run(async (e) => {
          e.target.disabled = true;
          const job = await api(base() + `/components/${id}/certify`, {});
          await waitJob(job.id);
          await detail(c, id, state.epoch);
        }),
      }),
    );
    if (v.evidence)
      review.append(
        el('p', {
          text:
            (v.evidence.passed ? 'Passed' : 'Needs repair') +
            ' · ' +
            v.evidence.checks.length +
            ' browser cases',
        }),
        el(
          'details',
          {},
          el('summary', { text: 'Check results' }),
          el('pre', { class: 'micro', text: JSON.stringify(v.evidence.checks, null, 2) }),
        ),
      );
    if (v.evidence?.passed) {
      const note = el('textarea', {
        'aria-label': 'Review note',
        rows: '4',
        placeholder: 'Describe your source, task and visual review…',
      });
      review.append(
        note,
        el('button', {
          class: 'button primary',
          text: 'Approve exact artifact',
          onclick: run(async () => {
            if (
              await confirmAction(root, {
                title: 'Approve this artifact?',
                description:
                  'Confirm you inspected source, interactive states and task expectations.',
                accept: 'Approve',
              })
            ) {
              await api(base() + `/components/${id}/approve`, {
                digest: v.digest,
                previewReviewed: true,
                tasksReviewed: true,
                note: note.value,
              });
              await detail(c, id, state.epoch);
            }
          }),
        }),
      );
    }
  }
  if (v.status === 'approved')
    review.append(
      el('button', {
        class: 'button primary',
        text: 'Publish signed component',
        onclick: run(async () => {
          await api(base() + `/components/${id}/publish`, {});
          await detail(c, id, state.epoch);
        }),
      }),
    );
  if (v.status === 'published')
    review.append(
      el('button', {
        class: 'button',
        text: 'Revoke publication',
        onclick: run(async () => {
          if (
            await confirmAction(root, {
              title: 'Revoke this component?',
              description: 'Existing artifacts using this source will stop rendering.',
              accept: 'Revoke',
            })
          ) {
            await api(base() + `/components/${id}/revoke`, {});
            await forge(c, state.epoch);
          }
        }),
      }),
    );
  async function preview() {
    state.frame?.destroy();
    if (v.status === 'revoked') {
      mount.textContent = 'This component is revoked.';
      return;
    }
    const grant = await api(base() + `/components/${id}/preview`, {
      state: select.value,
      theme: document.documentElement.dataset.theme ?? 'light',
    });
    if (epoch !== state.epoch) return;
    state.frame = mountArtifactFrame(mount, grant, { title: v.name, onError: notice });
  }
  select.onchange = run(preview);
  await preview();
}
function generate() {
  const d = el('dialog', { class: 'agent-dialog' }),
    goal = el('textarea', {
      'aria-label': 'Component goal',
      rows: '6',
      placeholder: 'A capacity planner for exploring how moving work changes team availability…',
    }),
    error = el('p', { role: 'alert' });
  d.append(
    el('span', { class: 'eyebrow', text: 'PROJECT-NATIVE CODE GENERATION' }),
    el('h3', { text: 'What is missing from your app?' }),
    el('p', {
      class: 'muted',
      text: 'The configured architect, component and critic models/CLI create and inspect a draft. Nothing publishes automatically.',
    }),
    goal,
    error,
    el(
      'div',
      { class: 'row' },
      el('button', { class: 'button', text: 'Cancel', onclick: () => d.close() }),
      el('button', {
        class: 'button primary',
        text: 'Generate draft',
        onclick: async () => {
          try {
            const job = await api(base() + '/components/generate', {
              goal: goal.value,
              actions: [],
            });
            d.close();
            if (job.reused) {
              notice('A published project component matches this task.');
              return;
            }
            await waitJob(job.id);
            await render();
          } catch (e) {
            error.textContent = e.message;
          }
        },
      }),
    ),
  );
  d.onclose = () => d.remove();
  root.append(d);
  d.showModal();
  goal.focus();
}
async function configureAgent() {
  const inv = await api(base() + '/agent-inventory');
  let old;
  try {
    old = await api(base() + '/agent-profile');
  } catch {}
  const d = el('dialog', { class: 'agent-dialog' }),
    name = el('input', { 'aria-label': 'Agent name', value: old?.name ?? inv.voice.name }),
    tone = el('textarea', { 'aria-label': 'Product voice', rows: '3' });
  tone.value = old?.voice?.tone ?? inv.voice.tone;
  const choices = [];
  const tools = el('div');
  for (const c of inv.capabilities.filter((c) => c.securityReviewed && c.kind === 'query')) {
    const check = el('input', { type: 'checkbox', checked: '', value: c.id });
    choices.push(check);
    tools.append(el('label', { class: 'row' }, check, c.id));
  }
  const error = el('p', { role: 'alert' });
  d.append(
    el('h3', { text: 'The assistant belongs to this project.' }),
    el('label', { class: 'field' }, 'Product name', name),
    el('label', { class: 'field' }, 'Voice and tone', tone),
    el('h3', { text: 'Reviewed reads' }),
    tools,
    el('p', {
      class: 'micro muted',
      text: 'Commands need explicit opt-in and current host authorization. Observations do not grant tool access.',
    }),
    error,
    el(
      'div',
      { class: 'row' },
      el('button', { class: 'button', text: 'Cancel', onclick: () => d.close() }),
      el('button', {
        class: 'button primary',
        text: 'Save reviewed profile',
        onclick: async () => {
          try {
            await api(base() + '/agent-profile', {
              revision: old?.revision ?? 0,
              voiceReviewed: true,
              voice: { name: name.value, tone: tone.value, locale: 'en' },
              tools: choices.filter((c) => c.checked).map((c) => c.value),
              componentIds: inv.components.filter((c) => c.status === 'published').map((c) => c.id),
            });
            d.close();
            await reset();
            await render();
          } catch (e) {
            error.textContent = e.message;
          }
        },
      }),
    ),
  );
  d.onclose = () => d.remove();
  root.append(d);
  d.showModal();
}
async function assistant(c, epoch) {
  const mode = el(
    'select',
    { 'aria-label': 'Execution mode' },
    el('option', { value: 'model', text: 'Configured model / CLI' }),
    el('option', { value: 'demo', text: 'Offline reference demonstration' }),
  );
  mode.value = state.mode;
  mode.onchange = run(async () => {
    state.mode = mode.value;
    await reset();
    await render();
  });
  const chatRoot = el('div', { class: 'mt20' });
  c.replaceChildren(
    heading(
      'A conversation that becomes useful work.',
      'Keep context, approved tools and interactive artifacts together.',
      [
        mode,
        el('button', { class: 'button', text: 'Configure agent', onclick: run(configureAgent) }),
      ],
    ),
    chatRoot,
  );
  let p;
  try {
    p = await api(base() + '/agent-profile');
  } catch (e) {
    chatRoot.append(
      el(
        'div',
        { class: 'panel' },
        el('h3', { text: 'Review the agent inventory first.' }),
        el('p', {
          class: 'muted',
          text: 'An assistant can use only explicitly reviewed capabilities and published project components.',
        }),
        el('button', {
          class: 'button primary',
          text: 'Configure project agent',
          onclick: run(configureAgent),
        }),
      ),
    );
    return;
  }
  if (epoch !== state.epoch) return;
  state.client = new AgentClient({
    transport: sameOriginTransport(base() + '/agent/rpc', { csrf: () => state.me.csrf }),
    journal: new IndexedDbJournal({ namespace: `${state.t}:${state.p}:${state.me.user.id}` }),
    onError: notice,
  });
  state.chat = mountAgentChat(chatRoot, {
    client: state.client,
    name: p.name,
    mode: state.mode,
    onError: notice,
  });
}
async function inventory(c, epoch) {
  let inv;
  try {
    inv = await api(base() + '/agent-inventory');
  } catch {
    c.replaceChildren(
      heading(
        'Map the app before extending it.',
        'Upload a source snapshot in the main control plane first.',
      ),
      el('a', { href: '/', class: 'button primary', text: 'Open project setup' }),
    );
    return;
  }
  if (epoch !== state.epoch) return;
  c.replaceChildren(
    heading(
      'A model of your real application.',
      'Discovered evidence, declared contracts and reviewed authority remain distinct.',
    ),
  );
  const table = el(
    'table',
    {},
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...['Capability', 'Kind', 'Risk', 'Authority', 'Permissions'].map((t) =>
          el('th', { text: t }),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...inv.capabilities.map((x) =>
        el(
          'tr',
          {},
          el('td', { text: x.id }),
          el('td', { text: x.kind }),
          el('td', { text: x.risk }),
          el(
            'td',
            {},
            el('span', {
              class: 'badge ' + (x.securityReviewed ? 'published' : ''),
              text: x.securityReviewed ? 'Reviewed' : 'Needs review',
            }),
          ),
          el('td', { text: (x.requiredPermissions ?? []).join(', ') }),
        ),
      ),
    ),
  );
  c.append(
    el('div', { class: 'panel table-wrap' }, table),
    el(
      'section',
      { class: 'panel mt20' },
      el('h3', { text: 'Coverage is evidence, not a guess.' }),
      el('p', {
        class: 'muted',
        text:
          inv.coverage?.explanation ??
          'Only supplied sources and observations are represented. Unvisited workflows remain unknown.',
      }),
      el('a', { href: '/', class: 'button', text: 'Review capabilities in the control plane ↗' }),
    ),
  );
}
async function boot() {
  try {
    state.me = await api('/api/me');
  } catch (e) {
    if (e.status === 401) return login();
    throw e;
  }
  state.t = state.me.tenants[0]?.id;
  if (!state.t) {
    root.replaceChildren(el('a', { href: '/', text: 'Create a tenant in the main Studio first.' }));
    return;
  }
  await projects();
  shell();
  await render();
}
boot().catch((e) => root.replaceChildren(el('p', { role: 'alert', text: e.message })));
