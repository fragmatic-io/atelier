// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { escapeHtml as e, humanize, mountSurface, exampleData } from '/assets/surface.mjs';
import { renderOnboarding, snippet as observerSnippet } from '/assets/onboarding.mjs';
import {
  codingAgentPrompt,
  installBundleSummary,
  installSurfaceFields,
} from '/assets/install-surface.mjs';
import { agentSetupFields, specialistSetup } from '/assets/agent-setup.mjs';
import { designOverrides, designReviewFields } from '/assets/design-setup.mjs';
import { authScreen } from '/assets/auth-screen.mjs';
import {
  capabilitySelectionSummary,
  renderCapabilityCatalog,
  selectedCapabilityIds,
  visibleCapabilityIds,
} from '/assets/capability-catalog.mjs';
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  folder:
    '<path d="M3 6h6l2 2h10v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/><path d="M3 6V4h7l2 2h7a2 2 0 0 1 2 2"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  link: '<path d="m9 15 6-6M8 12l-2 2a3 3 0 0 0 4 4l3-3M11 9l3-3a3 3 0 0 1 4 4l-2 2"/>',
  team: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  moon: '<path d="M20 14a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 4 2 3 1 4 4 2 4-1 4-1 2-4-1-4-2-4-4-1Z"/>',
  logout: '<path d="M10 4H4v16h6m4-4 4-4-4-4m-6 4h10"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  code: '<path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-14-2 18"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-10 12 10 6 10-6M2 12l10 6 10-6"/>',
};
const icon = (n) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n] ?? icons.grid}</svg>`;
const logo = `<svg viewBox="0 0 28 32" fill="none" aria-hidden="true"><path d="m4 27 8-22h4l8 22h-5l-5-15-5 15H4Z" fill="currentColor"/><path d="M10 21h8" stroke="currentColor" stroke-width="3"/></svg>`;
const state = {
  me: null,
  t: null,
  projects: [],
  project: null,
  model: null,
  view: 'overview',
  tab: 'overview',
  release: null,
  jobTimer: null,
  renderToken: 0,
  surface: null,
  apiSpec: null,
  onboarding: null,
  theme: localStorage.getItem('atelier-theme') ?? 'light',
};
document.documentElement.dataset.theme = state.theme;
const format = (n) => new Intl.NumberFormat().format(n ?? 0);
const when = (n) =>
  n ? new Date(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const ago = (n) =>
  !n
    ? 'Not yet'
    : Date.now() - n < 60000
      ? 'Just now'
      : Date.now() - n < 3600000
        ? `${Math.floor((Date.now() - n) / 60000)}m ago`
        : when(n);
function pill(value) {
  const good = ['published', 'succeeded', 'approved', 'query', 'verified', 'online'],
    bad = ['failed', 'rejected', 'destructive', 'revoked'],
    warn = ['draft', 'queued', 'running', 'sensitive', 'unreviewed'];
  return `<span class="pill ${good.includes(value) ? 'good' : bad.includes(value) ? 'bad' : warn.includes(value) ? 'warn' : ''}">${good.includes(value) ? '<i class="status-dot"></i>' : ''}${e(humanize(value))}</span>`;
}
function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `show ${error ? 'error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), 5000);
}
async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.me?.csrf ? { 'X-CSRF-Token': state.me.csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !['/auth/login', '/auth/signup'].includes(path)) {
      state.me = null;
      renderAuth();
    }
    const err = new Error(value.error?.message ?? 'The request failed');
    err.code = value.error?.code;
    err.status = res.status;
    throw err;
  }
  return value;
}
const base = () => `/tenants/${state.t}/projects/${state.project.id}`;
const tbase = () => `/tenants/${state.t}`;
function navigate(path) {
  history.pushState({}, '', path);
  route();
}
function empty(title, description, button = '') {
  return `<div class="empty"><span class="empty-mark">${icon('layers')}</span><h2>${e(title)}</h2><p>${e(description)}</p>${button}</div>`;
}
function heading(kicker, title, description, actions = '') {
  return `<div class="page-heading"><div><span class="eyebrow">${e(kicker)}</span><h1>${e(title)}</h1><p>${e(description)}</p></div>${actions ? `<div class="buttons">${actions}</div>` : ''}</div>`;
}
function button(action, label, ico = 'plus', secondary = false, extra = '') {
  return `<button class="btn ${secondary ? 'secondary' : ''}" data-action="${action}" ${extra}>${icon(ico)}<span>${e(label)}</span></button>`;
}
function shell() {
  const tenant = state.me.tenants.find((t) => t.id === state.t);
  return `<div class="shell"><aside class="sidebar"><a class="brand" href="/">${logo}atelier<sup>2.3</sup></a><select class="workspace-select" id="workspace" aria-label="Current workspace">${state.me.tenants.map((t) => `<option value="${t.id}" ${t.id === state.t ? 'selected' : ''}>${e(t.name)}</option>`).join('')}<option value="__new">＋ New workspace</option></select><div class="nav-title">Workspace</div><nav class="nav" aria-label="Main navigation">${[
    ['overview', 'Overview', 'grid'],
    ['projects', 'Projects', 'folder'],
    ['connections', 'Connections', 'link'],
    ['team', 'Team & access', 'team'],
    ['audit', 'Audit trail', 'clock'],
  ]
    .map(
      ([v, title, ico]) =>
        `<a href="/${v}" class="${state.view === v || (state.view === 'project' && v === 'projects') ? 'active' : ''}">${icon(ico)}${title}</a>`,
    )
    .join(
      '',
    )}</nav><div class="nav-title">Tools</div><nav class="nav"><a href="/account">${icon('shield')}Account security</a><a href="#" data-action="search">${icon('search')}Search project</a></nav><div class="sidebar-foot"><div class="build-label"><strong><i class="status-dot"></i>Compile. Review. Extend.</strong><p>Native experiences for the apps<br>your team already uses.</p></div><div class="profile"><span class="avatar">${e(state.me.user.displayName.slice(0, 2).toUpperCase())}</span><div><div class="profile-name">${e(state.me.user.displayName)}</div><div class="profile-role">${e(humanize(tenant?.role ?? 'member'))}</div></div><button class="icon-btn" data-action="logout" aria-label="Sign out">${icon('logout')}</button></div></div></aside><div class="main-column"><header class="topbar"><div class="crumbs"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Open navigation">${icon('menu')}</button>${e(tenant?.name ?? 'Workspace')}${icon('chevron')}<strong>${e(state.project?.name ?? humanize(state.view))}</strong></div><div class="top-actions"><button class="search-btn" data-action="search">${icon('search')}<span>Find anything…</span><kbd>⌘ K</kbd></button><button class="icon-btn" data-action="theme" aria-label="Toggle dark theme">${icon('moon')}</button><span class="avatar">${e(state.me.user.displayName.slice(0, 1).toUpperCase())}</span></div></header><main id="main" class="main"><div class="loading-page"><span class="spinner" role="status" aria-label="Loading"></span></div></main></div></div>`;
}
function renderAuth({ mode = 'login', joinToken = null } = {}) {
  state.surface?.dispose();
  $('#app').innerHTML = authScreen({ mode, joinToken, logo, arrowIcon: icon('arrow') });
  $$('[data-auth-route]').forEach((link) => {
    link.onclick = (event) => {
      event.preventDefault();
      navigate(link.getAttribute('href'));
    };
  });
  $('#auth-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget,
      b = $('button[type=submit]', form);
    b.disabled = true;
    $('.form-error', form).textContent = '';
    try {
      const body = Object.fromEntries(new FormData(form));
      if (joinToken) {
        await api('/auth/accept-invitation', {
          method: 'POST',
          body: { ...body, token: joinToken },
        });
        history.replaceState({}, '', '/');
        renderAuth();
        toast('Invitation accepted. Sign in to continue.');
      } else if (mode === 'signup') {
        await api('/auth/signup', { method: 'POST', body });
        state.me = await api('/me');
        state.t = null;
        history.replaceState({}, '', '/');
        await route();
      } else {
        await api('/auth/login', { method: 'POST', body });
        state.me = await api('/me');
        state.t = state.me.tenants[0]?.id;
        await route();
      }
    } catch (err) {
      $('.form-error', form).textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}
async function route() {
  const generation = ++state.renderToken;
  clearInterval(state.jobTimer);
  state.surface?.dispose();
  state.surface = null;
  if (location.pathname === '/join') {
    renderAuth({ joinToken: decodeURIComponent(location.hash.slice(1)) });
    return;
  }
  if (!state.me && ['/login', '/signup'].includes(location.pathname)) {
    renderAuth({ mode: location.pathname === '/signup' ? 'signup' : 'login' });
    return;
  }
  if (!state.me) {
    try {
      state.me = await api('/me');
    } catch {
      return renderAuth();
    }
  }
  if (!state.t || !state.me.tenants.some((t) => t.id === state.t))
    state.t = state.me.tenants[0]?.id;
  if (!state.t) {
    $('#app').innerHTML = shell();
    $('#main').innerHTML = empty(
      'Your first workspace',
      'Create a workspace, then add as many independently configured projects as you need.',
      button('new-workspace', 'Create workspace'),
    );
    return;
  }
  const parts = location.pathname.split('/').filter(Boolean);
  state.view = parts[0] ?? 'overview';
  state.project = null;
  state.model = null;
  state.release = null;
  state.apiSpec = null;
  state.onboarding = null;
  state.tab = parts[2] ?? 'overview';
  if (
    !['overview', 'projects', 'project', 'connections', 'team', 'audit', 'account'].includes(
      state.view,
    )
  )
    state.view = 'overview';
  try {
    state.projects = await api(tbase() + '/projects');
    if (state.view === 'project') {
      state.project = state.projects.find((p) => p.id === parts[1]);
      if (!state.project) throw new Error('Project not found in this workspace.');
      [state.project, state.model] = await Promise.all([api(base()), api(base() + '/model')]);
    }
    if (generation !== state.renderToken) return;
    $('#app').innerHTML = shell();
    let html;
    if (state.view === 'overview') html = await overview();
    else if (state.view === 'projects') html = projectsPage();
    else if (state.view === 'project') html = await projectPage(parts[3]);
    else if (state.view === 'connections') html = await connectionsPage();
    else if (state.view === 'team') html = await teamPage();
    else if (state.view === 'audit') html = await auditPage();
    else html = accountPage();
    if (generation !== state.renderToken) return;
    $('#main').innerHTML = html;
    bindPage();
  } catch (err) {
    if (generation !== state.renderToken) return;
    if (!$('#main')) $('#app').innerHTML = shell();
    $('#main').innerHTML =
      `${heading('Something needs attention', 'Let’s try that again.', err.message)}${button('reload', 'Reload', 'arrow', true)}`;
  }
}
function cards(projects) {
  return `<div class="project-grid">${projects.map((p) => `<a class="project-card" href="/project/${p.id}"><div class="project-card-top"><span class="project-glyph">${icon('layers')}</span>${pill(p.modelId ? 'verified' : 'not scanned')}</div><h3>${e(p.name)}</h3><p>${e(p.description || 'A new place to extend your application with native, reviewed experiences.')}</p><div class="project-card-bottom"><span>${p.modelId ? 'Project model connected' : 'Waiting for source'}</span><span>${when(p.createdAt)} ${icon('arrow')}</span></div></a>`).join('')}</div>`;
}
async function overview() {
  const o = await api(tbase() + '/overview'),
    m = o.metrics;
  return `${heading('Your workspace, at a glance', 'Room for what’s next.', 'A clear view of your applications, the experiences you’re building, and what’s ready to ship.', button('new-project', 'New project'))}<section class="metrics" aria-label="Workspace metrics">${[
    ['Projects', m.projects, 'Independently scoped', 'folder'],
    ['Published surfaces', m.publishedSurfaces, 'Signed & versioned', 'layers'],
    ['Active builds', m.activeJobs, 'Durable build queue', 'spark'],
    ['Model cache hits', m.cacheHits, `${format(m.modelCalls)} completed calls`, 'clock'],
  ]
    .map(
      ([title, n, note, ico]) =>
        `<div class="metric"><div class="metric-label">${title}${icon(ico)}</div><div class="metric-number">${format(n)}</div><div class="metric-meta">${note}</div></div>`,
    )
    .join(
      '',
    )}</section><div class="section-head"><h2>Your projects <span class="count">${m.projects}</span></h2><a class="btn ghost sm" href="/projects">View all projects ${icon('arrow')}</a></div>${o.projects.length ? cards(o.projects.slice(0, 3)) : empty('Start with an app you know', 'Add a project and upload its source snapshot. Atelier will map its components, capabilities and design patterns.', button('new-project', 'Create a project'))}<div class="split"><section><div class="section-head"><h2>Recent activity</h2><span class="muted small-text">Across your projects</span></div><div class="panel">${o.recentJobs.length ? o.recentJobs.map((j) => `<div class="activity-row"><span class="activity-icon">${icon(j.kind === 'scan' ? 'code' : 'spark')}</span><div><strong>${j.kind === 'scan' ? 'Application model scanned' : 'Experience build'} ${pill(j.status)}</strong><p>${e(j.stage)}</p></div><time class="activity-time">${ago(j.updatedAt)}</time></div>`).join('') : '<p>Your first build will appear here.</p>'}</div></section><section><div class="section-head"><h2>A thoughtful starting point</h2></div><div class="callout"><span class="eyebrow">Additive by design</span><h2>Don’t replace your app.<br>Make it more useful.</h2><p>Start with a context rail, an exception queue or an approval workspace. Use your own APIs, patterns and permissions.</p>${button('new-project', 'Build something useful', 'arrow')}</div></section></div><div class="footer-note"><span>Your data stays scoped to its workspace and project.</span><span>Atelier Studio · 2.3</span></div>`;
}
function projectsPage() {
  return `${heading('Your applications', 'Built around your work.', 'Each project has its own sources, design genome, model connection, releases and access controls.', button('new-project', 'New project'))}${state.projects.length ? cards(state.projects) : empty('Your next project starts here', 'Connect an existing application without replacing its frontend.', button('new-project', 'Create project'))}`;
}
function projectHeading() {
  return `${heading('Project studio', state.project.name, state.project.description || 'Discover capabilities. Review agent access. Publish with confidence.', `<a class="btn secondary" href="/project/${state.project.id}/setup">${icon('check')}<span>Setup</span></a>` + button('generate', 'New experience', 'spark'))}<nav class="tabs" aria-label="Project sections">${[
    ['setup', 'Setup'],
    ['overview', 'Overview'],
    ['model', 'App model'],
    ['api-docs', 'API reference'],
    ['design', 'Design genome'],
    ['lab', 'Experience lab'],
    ['releases', 'Releases'],
    ['jobs', 'Builds'],
    ['settings', 'Settings'],
  ]
    .map(
      ([tab, title]) =>
        `<a href="/project/${state.project.id}/${tab}" class="${state.tab === tab ? 'active' : ''}">${title}</a>`,
    )
    .join('')}</nav>`;
}
async function projectPage(releaseId) {
  let content = '';
  const model = state.model;
  if (releaseId) {
    state.release = await api(base() + '/releases/' + releaseId);
    return projectHeading() + previewPage();
  }
  if (state.tab === 'setup') {
    state.onboarding = await api(base() + '/onboarding');
    content = renderOnboarding({
      status: state.onboarding,
      model,
      projectId: state.project.id,
      e,
      icon,
      pill,
      button,
    });
    if (state.onboarding.state !== 'ready')
      state.jobTimer = setInterval(() => {
        if (!document.querySelector('dialog[open]')) route();
      }, 5000);
  } else if (state.tab === 'overview') {
    const jobs = await api(base() + '/jobs');
    content = `${
      !model
        ? empty(
            'Connect this application.',
            'Install the privacy-safe observer or import an API contract. Source code is not required.',
            `<a class="btn" href="/project/${state.project.id}/setup">${icon('arrow')}Start guided setup</a>`,
          )
        : `<section class="metrics">${[
            ['Capabilities', model.capabilities.length],
            ['Host components', model.components.length],
            ['Entity types', model.entities.length],
            ['Extension slots', model.slots.length],
          ]
            .map(
              ([title, n]) =>
                `<div class="metric"><div class="metric-label">${title}</div><div class="metric-number">${n}</div><div class="metric-meta">From connected evidence</div></div>`,
            )
            .join(
              '',
            )}</section><div class="split"><div class="panel"><h2>Your extension points</h2><p>Additive screens live in explicit, developer-approved spaces.</p>${model.slots.map((s) => `<div class="activity-row"><span class="activity-icon">${icon('layers')}</span><div><strong>${e(s.id)}</strong><p>${e(s.mode)} · ${s.allowWriteActions ? 'Reviewed write actions allowed' : 'Read-only surface'}</p></div>${pill('verified')}</div>`).join('')}</div><div class="callout"><span class="eyebrow">A focused first step</span><h2>Less navigation.<br>More clarity.</h2><p>Describe a task. Atelier proposes different ways to bring the right context and actions together.</p>${button('generate', 'Create an experience', 'spark')}</div></div>`
    }<div class="section-head"><h2>Recent builds</h2><a href="/project/${state.project.id}/jobs" class="btn ghost sm">View builds ${icon('arrow')}</a></div>${jobsTable(jobs.slice(0, 6))}`;
  } else if (state.tab === 'model') {
    content = !model
      ? empty(
          'No project model yet',
          'Connect an observer or import an API contract before reviewing capabilities.',
          `<a class="btn" href="/project/${state.project.id}/setup">${icon('arrow')}Start setup</a>`,
        )
      : `${renderCapabilityCatalog(model, pill)}<div class="section-head"><h2>Host components</h2></div><div class="panel no-pad table-wrap"><table class="table"><thead><tr><th>COMPONENT</th><th>SOURCE</th><th>PROP CONTRACT</th></tr></thead><tbody>${model.components.map((c) => `<tr><td>${e(c.id)}</td><td class="code small">${e(c.sourcePath)}</td><td>${Object.keys(c.propsSchema?.properties ?? {}).length} typed properties</td></tr>`).join('')}</tbody></table></div>`;
  } else if (state.tab === 'api-docs') {
    state.apiSpec = await api(base() + '/openapi');
    const endpoint = `/api${base()}/openapi`;
    const operationCount = Object.values(state.apiSpec.paths).reduce(
      (count, path) =>
        count +
        ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].filter(
          (method) => path[method],
        ).length,
      0,
    );
    content = `<div class="info-strip">Generated automatically from project-model HTTP capabilities. <strong>Documentation does not grant execution authority; only security-reviewed capabilities can become agent tools.</strong></div><div class="section-head"><div><h2>API reference <span class="count">${operationCount} operations</span></h2><p class="muted">OpenAPI ${e(state.apiSpec.openapi)} · model ${e(state.apiSpec.info.version)}</p></div><div class="buttons">${button('download-openapi', 'Download OpenAPI', 'code', true)}<a class="btn secondary" href="${e(endpoint)}" target="_blank" rel="noopener">${icon('arrow')}<span>Open JSON</span></a></div></div><div class="api-docs-shell"><iframe class="api-docs-frame" title="${e(state.apiSpec.info.title)}" src="/api-reference/${encodeURIComponent(state.t)}/${encodeURIComponent(state.project.id)}" sandbox="allow-scripts allow-same-origin"></iframe></div>`;
  } else if (state.tab === 'design') {
    content = designPage();
  } else if (state.tab === 'lab' || state.tab === 'releases') {
    const releases = await api(base() + '/releases');
    content =
      state.tab === 'lab'
        ? `<div class="info-strip">A generated surface is a draft, not a deployment. Preview all states, review the task flow and approve before publishing.</div><div class="section-head"><h2>Explore your experiences <span class="count">${releases.length}</span></h2>${button('generate', 'Generate variants', 'spark')}</div>${releases.length ? `<div class="design-grid">${releases.map((rel, i) => designCard(rel, i)).join('')}</div>` : empty('Make space for a better workflow', 'Start with a goal. Use your model connection, or explicitly choose a deterministic preview to test the pipeline.', button('generate', 'Generate an experience', 'spark'))}`
        : releasesPage(releases);
  } else if (state.tab === 'jobs') {
    const jobs = await api(base() + '/jobs');
    content = `<div class="section-head"><h2>Build history</h2>${button('reload', 'Refresh', 'clock', true)}</div>${jobsTable(jobs)}`;
    if (jobs.some((j) => ['running', 'queued'].includes(j.status)))
      state.jobTimer = setInterval(() => {
        if (!document.querySelector('dialog[open]')) route();
      }, 3000);
  } else if (state.tab === 'settings') content = await settingsPage();
  return projectHeading() + content;
}
function jobsTable(jobs) {
  return jobs.length
    ? `<div class="panel no-pad table-wrap"><table class="table"><thead><tr><th>BUILD</th><th>STATUS</th><th>STAGE</th><th>UPDATED</th><th></th></tr></thead><tbody>${jobs.map((j) => `<tr><td>${e(humanize(j.kind))}<div class="muted code">${e(j.id.slice(0, 18))}…</div></td><td>${pill(j.status)}</td><td class="small">${e(j.error?.message ?? j.stage)}</td><td>${ago(j.updatedAt)}</td><td><button class="btn secondary sm" data-action="job" data-id="${j.id}">Trace</button></td></tr>`).join('')}</tbody></table></div>`
    : empty(
        'No builds yet',
        'Scans and generation runs appear here, including stage traces, cancellation and failure details.',
      );
}
function designCard(rel, i) {
  return `<a class="panel design-card" href="/project/${state.project.id}/lab/${rel.id}"><div class="mini-surface mini-${['focus', 'workbench', 'comparison'][i % 3]}"><div class="mini-window"><span class="mini-label">${e(rel.slot_id)}</span><div class="mini-title"></div><div class="mini-grid"><div class="mini-module"><i></i><i></i></div><div class="mini-module"><i></i><i></i></div></div></div></div><div class="design-card-body">${pill(rel.status)} <span class="pill">${e(rel.environment)}</span><h3>${e(humanize(rel.slot_id))}</h3><p>Created ${when(rel.created_at)} · Preview & review ${icon('arrow')}</p></div></a>`;
}
function releasesPage(releases) {
  return `<div class="section-head"><h2>Release ledger</h2>${button('deployments', 'Deployment history', 'layers', true)}</div><div class="info-strip">Staging approval is followed by explicit promotion. Production requires a different reviewer by default. A new model version invalidates old releases.</div>${releases.length ? `<div class="panel no-pad table-wrap"><table class="table"><thead><tr><th>SURFACE</th><th>ENVIRONMENT</th><th>STATUS</th><th>CREATED</th><th></th></tr></thead><tbody>${releases.map((rel) => `<tr><td class="code small">${e(rel.slot_id)}</td><td>${pill(rel.environment)}</td><td>${pill(rel.status)}</td><td>${when(rel.created_at)}</td><td><a class="btn secondary sm" href="/project/${state.project.id}/releases/${rel.id}">Open release</a></td></tr>`).join('')}</tbody></table></div>` : empty('Nothing has been released', 'Generate and inspect a draft in the Experience lab, then approve it for staging.')}`;
}
function previewPage() {
  const r = state.release,
    a = r.artifact,
    b = a.bundle;
  return `<div class="section-head"><h2>${e(b.presentation?.title ?? 'Experience preview')}</h2><div class="buttons">${pill(r.status)}${pill(r.environment)}${button('download-kit', 'Export kit', 'code', true)}</div></div><div class="preview-toolbar"><div class="segmented" id="state-switch">${['ready', 'loading', 'empty', 'error'].map((s, i) => `<button class="${i === 0 ? 'active' : ''}" data-state="${s}">${humanize(s)}</button>`).join('')}</div><div class="segmented" id="size-switch"><button class="active" data-size="desktop">Desktop</button><button data-size="mobile">Mobile</button></div></div><div class="preview-stage"><div class="preview-inner" id="preview"></div><div class="preview-note">EXAMPLE DATA · NO PRODUCTION ACTIONS ARE EXECUTED</div></div><div class="preview-summary"><span><strong>${b.experiencePlan.queryPlan.length}</strong> data sources</span><span><strong>${b.experiencePlan.actionPlan.length}</strong> reviewed actions</span><span><strong>${e(b.provenance.mode)}</strong> compilation</span><span>Model version <code>${e(b.projectVersion.slice(0, 10))}</code></span></div><div class="split"><div class="panel"><h2>Why this composition</h2><p>${e(b.presentation?.rationale ?? '')}</p><div class="check-list">${[
    ['Registered capabilities only', true],
    ['Explicit loading, empty and error states', true],
    ['Source syntax / AST validation', a.kit.verification.passed],
    ['Human visual review', ['approved', 'published', 'superseded'].includes(r.status)],
  ]
    .map(
      ([x, pass]) => `<div class="check">${icon(pass ? 'check' : 'clock')}<span>${x}</span></div>`,
    )
    .join(
      '',
    )}</div><p class="token-note">Automated checks do not prove aesthetic quality or task usability. Review the rendered states and interaction flow before approval.</p></div><div class="panel"><h2>Review & publish</h2><p>${r.environment === 'production' ? 'A reviewer other than the author must approve this release.' : 'Review the preview, then publish a signed staging bundle. Your host explicitly chooses the environment it serves.'}</p><div class="buttons">${r.status === 'draft' ? button('approve', 'Review draft', 'check') + button('reject', 'Reject', 'close', true) : r.status === 'approved' ? button('publish', 'Publish release', 'upload') : r.status === 'published' && r.environment === 'staging' ? button('promote', 'Promote to production', 'arrow') : ''}</div>${r.note ? `<div class="small-code">${e(r.note)}</div>` : ''}<div class="space-top"><h3>Screenshot critique</h3><p>Use a vision API on redacted screenshots. CLI text-only providers cannot inspect pixels.</p>${button('visual-review', 'Review screenshot', 'spark', true)}${(r.visualReviews ?? []).map((v) => `<p>${pill(v.result.approved ? 'passed' : 'needs work')} ${e(v.model)}<br>${e(v.result.issues.join(' · ') || v.result.strengths.join(' · '))}</p>`).join('')}</div></div></div>`;
}
function designPage() {
  const m = state.model;
  if (!m)
    return empty(
      'No design genome yet',
      'Connect source to extract CSS tokens, component contracts and design patterns.',
      button('upload', 'Add source', 'upload'),
    );
  const g = m.designGenome ?? {};
  const tokens = g.hardTokens?.all ?? g.tokens ?? {};
  let entries = Array.isArray(tokens)
    ? tokens
    : Object.entries(tokens).flatMap(([k, v]) =>
        typeof v === 'object'
          ? Object.entries(v).map(([n, x]) => ({
              name: k + '.' + n,
              value: typeof x === 'object' ? JSON.stringify(x) : x,
            }))
          : [{ name: k, value: v }],
      );
  if (!entries.length) entries = g.tokenEvidence ?? [];
  return `<div class="detail-grid"><div class="panel full"><h2>Design language</h2><p>Extracted evidence from your app—not a replacement theme. Generated project kits reference host variables and explicit component mappings.</p><div class="token-grid">${
    entries
      .slice(0, 24)
      .map(
        (t) =>
          `<div class="token"><div class="swatch" data-color="${e(t.value ?? t.$value ?? '')}"></div><strong>${e(t.name ?? t.path ?? t.id)}</strong><p>${e(t.value ?? t.$value ?? '')}</p></div>`,
      )
      .join('') ||
    '<p>No explicit color tokens discovered. Add CSS variables or a DTCG JSON token file.</p>'
  }</div></div><div class="panel"><h2>Observed grammar</h2><pre class="small-code">${e(JSON.stringify(g.grammar ?? {}, null, 2))}</pre></div><div class="panel"><h2>Host component families</h2><div class="check-list">${m.components
    .slice(0, 10)
    .map(
      (c) =>
        `<div class="check">${icon('layers')}<span>${e(c.id)}<br><span class="muted">${e(c.sourcePath)}</span></span></div>`,
    )
    .join('')}</div></div></div>`;
}
async function connectionsPage() {
  const items = await api(tbase() + '/connections');
  return `${heading('Bring your intelligence', 'One interface. Your models.', 'Use API keys or project-bound Codex and Claude Code runners. Credentials never reach the browser runtime.', button('new-connection', 'Add connection', 'link'))}<div class="info-strip">CLI inference runs on a dedicated, project-bound runner using its own local account. Atelier does not share a hosted developer CLI session across tenants.</div>${items.length ? `<div class="panel no-pad table-wrap"><table class="table"><thead><tr><th>CONNECTION</th><th>PROVIDER</th><th>MODEL</th><th>SCOPE</th><th></th></tr></thead><tbody>${items.map((c) => `<tr><td><strong>${e(c.name)}</strong><div class="muted">${c.hasSecret ? 'Encrypted server-side' : 'Project runner'}</div></td><td>${e(c.kind)}</td><td class="code">${e(c.config.model)}</td><td>${e(c.projectId ? (state.projects.find((p) => p.id === c.projectId)?.name ?? 'Project') : 'Workspace')}</td><td><button class="btn secondary sm" data-action="revoke-connection" data-id="${c.id}">Revoke</button></td></tr>`).join('')}</tbody></table></div>` : empty('Choose the intelligence behind your builds', 'Add an OpenAI, Anthropic, Gemini or compatible API connection. Register a runner inside a project for CLI-based inference.', button('new-connection', 'Add your first connection', 'link'))}<div class="section-head"><h2>Provider contract</h2></div><div class="detail-grid"><div class="panel"><h2>Build-time intelligence</h2><p>Task architect → interface designer → independent critic. Models produce schema-validated artifacts. They cannot call production APIs or execute uploaded source.</p></div><div class="panel"><h2>A deterministic runtime</h2><p>Published screen structure is signed and versioned. Your host loads fresh authorized data and handles actions; routine rendering needs no model call.</p></div></div>`;
}
async function teamPage() {
  const members = await api(tbase() + '/members');
  return `${heading('People & permissions', 'A workspace for your team.', 'Workspace roles and project roles are separate. Members only see the projects they’re granted.', button('invite', 'Invite member', 'team'))}<div class="panel no-pad table-wrap"><table class="table"><thead><tr><th>PERSON</th><th>EMAIL</th><th>WORKSPACE ROLE</th><th></th></tr></thead><tbody>${members.map((m) => `<tr><td>${e(m.name)}</td><td>${e(m.email)}</td><td>${pill(m.role)}</td><td><button class="btn secondary sm" data-action="member" data-id="${m.id}">Manage access</button></td></tr>`).join('')}</tbody></table></div><div class="section-head"><h2>Clear responsibilities</h2></div><div class="detail-grid"><div class="panel"><h2>Editors build. Reviewers approve.</h2><p>Project editors can scan and generate. Reviewers inspect security contracts and approve drafts. Administrators publish and manage credentials.</p></div><div class="panel"><h2>Isolation is part of the data model.</h2><p>Artifacts, runs, connections, caches, signatures and releases are bound to a workspace and project. Removing access invalidates the member’s scoped tokens.</p></div></div>`;
}
async function auditPage() {
  const rows = await api(tbase() + '/audit');
  return (
    heading(
      'Provenance, by default',
      'Every change has a trail.',
      'Append-only, per-workspace hash-chained events record actions without storing model prompts or credentials.',
    ) +
    `<div class="panel no-pad table-wrap"><table class="table"><thead><tr><th>EVENT</th><th>PROJECT</th><th>WHEN</th><th>SEQUENCE</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${e(humanize(x.action))}<div class="muted code">${e(x.resource_id ?? '')}</div></td><td>${e(state.projects.find((p) => p.id === x.project_id)?.name ?? 'Workspace')}</td><td>${new Date(x.created_at).toLocaleString()}</td><td class="code">#${x.seq} · ${x.row_hash.slice(0, 10)}</td></tr>`).join('')}</tbody></table></div>`
  );
}
async function settingsPage() {
  const [connections, runners, tokens] = await Promise.all([
    api(tbase() + '/connections').catch(() => []),
    api(base() + '/runners'),
    api(base() + '/tokens').catch(() => []),
  ]);
  state.connections = connections;
  return `<div class="detail-grid"><div class="panel"><h2>Project settings</h2><form class="form" id="project-settings"><label>Project name<input name="name" value="${e(state.project.name)}" required></label><label>Description<textarea name="description">${e(state.project.description)}</textarea></label><label>Default model connection<select name="providerId"><option value="">No model connected</option>${connections
    .filter((c) => !c.projectId || c.projectId === state.project.id)
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === state.project.providerId ? 'selected' : ''}>${e(c.name)} · ${e(c.kind)}</option>`,
    )
    .join(
      '',
    )}</select></label><label>Model identifier<input name="model" value="${e(state.project.model ?? '')}" placeholder="Use the model ID available in your account"></label><label class="checkbox"><input type="checkbox" name="separation" ${state.project.settings.separationOfDuties !== false ? 'checked' : ''}>Require a different production reviewer</label><label class="checkbox"><input type="checkbox" name="telemetry" ${state.project.settings.telemetryEnabled ? 'checked' : ''}>Enable redacted semantic workflow events</label><p class="form-error" role="alert"></p><button class="btn" type="submit">Save settings</button></form></div><div><div class="panel"><h2>Project runners</h2><p>Connect a dedicated local account. The runner is authorized for this project only.</p>${runners.map((x) => `<div class="activity-row"><div><strong>${e(x.name)}</strong><p>${e(x.providers.join(', '))}</p></div>${pill(x.online ? 'online' : x.revoked_at ? 'revoked' : 'offline')}<button class="btn ghost sm" data-action="revoke-runner" data-id="${x.id}">Revoke</button></div>`).join('')}<div class="buttons">${button('new-runner', 'Register runner', 'link', true)}</div></div><div class="panel space-top"><h2>Host-server tokens</h2><p>Never embed these tokens in browser code. Your application backend resolves signed bundles using a project-bound token.</p>${tokens
    .filter((t) => t.kind === 'project')
    .map(
      (t) =>
        `<div class="activity-row"><div><strong>${e(t.name)}</strong><p>Expires ${when(t.expires_at)}</p></div>${pill(t.revoked_at ? 'revoked' : 'active')}<button class="btn ghost sm" data-action="revoke-token" data-id="${t.id}">Revoke</button></div>`,
    )
    .join(
      '',
    )}${button('new-token', 'Create token', 'shield', true)}</div></div><div class="panel full"><h2>Extension slots & host mappings</h2><p>Changes take effect after a new source scan. A slot specifies where Atelier is allowed to render and which capabilities it can expose.</p><form class="form" id="advanced-settings"><label>Slot contracts (JSON)<textarea name="slots" rows="8">${e(JSON.stringify(state.project.settings.slots ?? state.model?.slots ?? [], null, 2))}</textarea></label><label>Host primitive import mappings (JSON)<textarea name="componentMappings" rows="3">${e(JSON.stringify(state.project.settings.componentMappings ?? {}, null, 2))}</textarea><span class="help">Example: {"Button":"@/components/ui/button", "Panel":"@/components/ui/panel"}. Exported components must be named Button and Panel.</span></label><label>Optional per-stage model routing (JSON)<textarea name="modelRouting" rows="3">${e(JSON.stringify(state.project.settings.modelRouting ?? {}, null, 2))}</textarea><span class="help">architect, designer, critic, visual, engineer → {"connectionId":"…", "model":"…"}</span></label><button class="btn secondary" type="submit">Save advanced settings</button></form></div><div class="panel full"><h2>Portability & lifecycle</h2><p>Export project artifacts without secrets or credentials. Archiving revokes project tokens and stops queued work.</p><div class="buttons">${button('export', 'Export project', 'code', true)}${button('archive', 'Archive project', 'folder', true)}</div></div></div>`;
}
function accountPage() {
  return `${heading('Protect your workspace', 'Account security.', 'Use a strong password and two-factor authentication for administrative and publishing access.')}<div class="detail-grid"><div class="panel"><h2>Two-factor authentication</h2><p>${state.me.user.mfaEnabled ? 'Your account is protected with TOTP. Recovery codes are single-use.' : 'Add an authenticator app. Setup also gives you eight single-use recovery codes.'}</p>${pill(state.me.user.mfaEnabled ? 'verified' : 'not enabled')}<div class="buttons space-top">${state.me.user.mfaEnabled ? button('disable-mfa', 'Disable 2FA', 'shield', true) : button('setup-mfa', 'Enable 2FA', 'shield')}</div></div><div class="panel"><h2>Change your password</h2><p>Changing your password signs out every browser session.</p><form class="form" id="password-form"><label>Current password<input type="password" name="currentPassword" autocomplete="current-password" required></label><label>New password<input type="password" name="newPassword" autocomplete="new-password" minlength="12" required></label><p class="form-error" role="alert"></p><button class="btn secondary">Update password</button></form></div></div>`;
}
function dialog(title, content, { wide = false } = {}) {
  const oldFocus = document.activeElement;
  const d = document.createElement('dialog');
  d.className = 'dialog' + (wide ? ' wide' : '');
  d.setAttribute('aria-label', title);
  d.innerHTML = `<div class="dialog-head"><h2>${e(title)}</h2><button class="icon-btn" data-close aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-content">${content}</div>`;
  document.body.append(d);
  d.closeDialog = () => {
    d.close();
    d.remove();
    oldFocus?.focus();
  };
  $('[data-close]', d).onclick = d.closeDialog;
  d.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    d.closeDialog();
  });
  d.showModal();
  queueMicrotask(() => ($('input,textarea,select', d) ?? $('[data-close]', d)).focus());
  return d;
}
function formDialog(title, fields, submit, onSubmit, info = '') {
  const d = dialog(
    title,
    `${info ? `<p>${info}</p>` : ''}<form class="form">${fields}<p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn secondary" data-cancel>Cancel</button><button class="btn" type="submit">${e(submit)}</button></div></form>`,
  );
  $('[data-cancel]', d).onclick = d.closeDialog;
  $('form', d).onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget,
      b = $('[type=submit]', f);
    b.disabled = true;
    $('.form-error', f).textContent = '';
    try {
      const body = Object.fromEntries(new FormData(f));
      await onSubmit(body, f, d);
    } catch (err) {
      $('.form-error', f).textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
  return d;
}
function secretDialog(title, value, note = 'Copy this now. It is never shown again.') {
  const d = dialog(
    title,
    `<p>${e(note)}</p><code class="secret">${e(value)}</code><button class="btn" data-copy>Copy to clipboard</button>`,
  );
  $('[data-copy]', d).onclick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Copied. Store it securely.');
    } catch {
      toast('Select and copy the value above.', true);
    }
  };
}
function download(name, value) {
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function uploadFiles(fileList) {
  const files = [];
  for (const f of fileList) {
    let path = f.webkitRelativePath ?? f.name;
    if (path.includes('/')) path = path.split('/').slice(1).join('/');
    if (
      path
        .split('/')
        .some(
          (p) =>
            ['node_modules', '.git', '.next', 'dist', '.atelier', 'coverage', 'data'].includes(p) ||
            p.startsWith('.env'),
        )
    )
      continue;
    if (!/\.(tsx?|jsx?|mjs|cjs|json|css|scss|graphql|gql|prisma|md|mdx|ya?ml)$/i.test(path))
      continue;
    if (f.size > 512 * 1024) continue;
    files.push({ path, content: await f.text() });
  }
  if (!files.length) throw new Error('No supported source files were selected.');
  await api(base() + '/sources', { method: 'POST', body: { files } });
  toast(`Uploaded ${files.length} files. Scan queued.`);
  navigate(`/project/${state.project.id}/jobs`);
}

function updateCapabilitySelectionUi() {
  const ids = selectedCapabilityIds();
  const selected = state.model?.capabilities.filter((capability) => ids.includes(capability.id)) ?? [];
  const count = $('#cap-selection-count');
  if (count) count.textContent = `${selected.length} selected`;
  const clear = $('[data-action="clear-capability-selection"]');
  const review = $('[data-action="bulk-review-selected"]');
  const reopen = $('[data-action="bulk-reopen-selected"]');
  const enable = $('[data-action="bulk-agent-enable"]');
  const disable = $('[data-action="bulk-agent-disable"]');
  if (clear) clear.disabled = selected.length === 0;
  if (review) review.disabled = selected.length === 0;
  if (reopen)
    reopen.disabled =
      selected.length === 0 || selected.every((capability) => !capability.securityReviewed);
  if (disable) disable.disabled = selected.length === 0;
  if (enable)
    enable.disabled =
      selected.length === 0 || selected.some((capability) => !capability.securityReviewed);
}

function bulkReviewDialog(capabilityIds, label) {
  const capabilities = state.model.capabilities.filter((capability) =>
    capabilityIds.includes(capability.id),
  );
  const summary = capabilitySelectionSummary(capabilities);
  formDialog(
    label,
    `<div class="bulk-review-summary"><strong>${summary.total} capabilities</strong><span>${summary.queries} queries</span><span>${summary.commands} commands</span><span>${summary.sensitive} sensitive</span><span>${summary.destructive} destructive</span><span>${summary.missingPermissions} without declared permissions</span></div><p>Atelier will accept the current title, purpose, risk, confirmation, permission and sensitive-field classifications for this exact model version.</p><label class="checkbox"><input type="checkbox" name="confirmed" required>I reviewed this inventory and understand approval does not expose these capabilities to agents.</label>`,
    `Approve ${summary.total}`,
    async (_body, _form, dialogHandle) => {
      const result = await api(base() + '/capabilities/bulk-review', {
        method: 'PATCH',
        body: {
          projectVersion: state.model.projectVersion,
          capabilityIds,
          approved: true,
          agentEnabled: false,
        },
      });
      dialogHandle.closeDialog();
      await route();
      toast(`${result.reviewed} capabilities approved. Agent access was not changed.`);
    },
    'This is one atomic review decision. If any capability is invalid or the inventory changed, none are approved.',
  );
}

function bulkAgentAccessDialog(capabilityIds, enabled) {
  const capabilities = state.model.capabilities.filter((capability) =>
    capabilityIds.includes(capability.id),
  );
  const summary = capabilitySelectionSummary(capabilities);
  formDialog(
    enabled ? 'Enable selected capabilities for agents' : 'Disable selected capabilities for agents',
    `<div class="bulk-review-summary"><strong>${summary.total} capabilities</strong><span>${summary.queries} queries</span><span>${summary.commands} commands</span><span>${summary.sensitive} sensitive</span><span>${summary.destructive} destructive</span></div><label class="checkbox"><input type="checkbox" name="confirmed" required>I understand this changes which reviewed tools chat and surface agents can call.</label>`,
    `${enabled ? 'Enable' : 'Disable'} ${summary.total}`,
    async (_body, _form, dialogHandle) => {
      const result = await api(base() + '/capabilities/bulk-agent-access', {
        method: 'PATCH',
        body: {
          projectVersion: state.model.projectVersion,
          capabilityIds,
          enabled,
        },
      });
      dialogHandle.closeDialog();
      await route();
      toast(`${result.updated} capabilities ${enabled ? 'enabled for' : 'removed from'} agents.`);
    },
    enabled
      ? 'Only already-approved capabilities can be enabled. Runtime authorization and confirmation rules still apply to every call.'
      : 'Disabling removes these tools from future agent sessions without changing their review status.',
  );
}

function bulkReopenDialog(capabilityIds) {
  const capabilities = state.model.capabilities.filter((capability) =>
    capabilityIds.includes(capability.id),
  );
  const summary = capabilitySelectionSummary(capabilities);
  formDialog(
    'Reopen selected capability reviews',
    `<div class="bulk-review-summary"><strong>${summary.total} capabilities</strong><span>${summary.queries} queries</span><span>${summary.commands} commands</span><span>${summary.sensitive} sensitive</span><span>${summary.destructive} destructive</span></div><p>This removes their accepted/rejected decision and disables their agent access. The original decisions remain in the audit trail.</p><label class="checkbox"><input type="checkbox" name="confirmed" required>I want these capabilities returned to pending human review.</label>`,
    `Reopen ${summary.total}`,
    async (_body, _form, dialogHandle) => {
      const result = await api(base() + '/capabilities/bulk-reopen', {
        method: 'PATCH',
        body: {
          projectVersion: state.model.projectVersion,
          capabilityIds,
        },
      });
      dialogHandle.closeDialog();
      await route();
      toast(`${result.reopened} capability reviews reopened. Agent access is disabled.`);
    },
    'Reopening is itself an audited action and does not erase earlier review history.',
  );
}

function bindPage() {
  if ($('#workspace'))
    $('#workspace').onchange = (ev) => {
      if (ev.target.value === '__new') actions['new-workspace']();
      else {
        state.t = ev.target.value;
        navigate('/overview');
      }
    };
  if ($('#cap-filter'))
    $('#cap-filter').oninput = (ev) => {
      $$('#cap-table tbody tr').forEach(
        (row) =>
          (row.hidden = !row.textContent.toLowerCase().includes(ev.target.value.toLowerCase())),
      );
      updateCapabilitySelectionUi();
    };
  $$('[data-cap-select]').forEach(
    (checkbox) => (checkbox.onchange = updateCapabilitySelectionUi),
  );
  $$('[data-color]').forEach((el) => {
    const v = el.dataset.color;
    if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl)a?\([\d\s.,%/]+\)$/.test(v))
      el.style.backgroundColor = v;
  });
  if (state.release && $('#preview')) {
    const render = (s = 'ready') => {
      state.surface?.dispose();
      const bundle = state.release.artifact.bundle;
      const examples = exampleData(bundle);
      state.surface = mountSurface($('#preview'), bundle, {
        load: async (id) => {
          await new Promise((r) => setTimeout(r, 100));
          return examples[id];
        },
        dispatch: async () => {
          await new Promise((r) => setTimeout(r, 300));
          toast('Preview only. No production action was executed.');
        },
        context: { customerId: 'example-customer' },
        exampleState: s === 'ready' ? null : s,
      });
    };
    render();
    $('#state-switch').onclick = (ev) => {
      const b = ev.target.closest('[data-state]');
      if (!b) return;
      $$('#state-switch button').forEach((x) => x.classList.toggle('active', x === b));
      render(b.dataset.state);
    };
    $('#size-switch').onclick = (ev) => {
      const b = ev.target.closest('[data-size]');
      if (!b) return;
      $$('#size-switch button').forEach((x) => x.classList.toggle('active', x === b));
      $('#preview').classList.toggle('mobile', b.dataset.size === 'mobile');
    };
  }
  const submitForm = (selector, handler) => {
    const form = $(selector);
    if (form)
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const b = $('button[type=submit],button', form);
        b.disabled = true;
        try {
          await handler(Object.fromEntries(new FormData(form)), form);
          toast('Saved.');
        } catch (err) {
          toast(err.message, true);
        } finally {
          b.disabled = false;
        }
      };
  };
  submitForm('#project-settings', async (body, form) => {
    await api(base(), {
      method: 'PATCH',
      body: {
        name: body.name,
        description: body.description,
        providerId: body.providerId || null,
        model: body.model || null,
        revision: state.project.revision,
        settings: {
          separationOfDuties: form.separation.checked,
          telemetryEnabled: form.telemetry.checked,
        },
      },
    });
    await route();
  });
  submitForm('#advanced-settings', async (body) => {
    await api(base(), {
      method: 'PATCH',
      body: {
        revision: state.project.revision,
        settings: {
          slots: JSON.parse(body.slots),
          componentMappings: JSON.parse(body.componentMappings),
          modelRouting: JSON.parse(body.modelRouting),
        },
      },
    });
    await route();
  });
  submitForm('#password-form', async (body) => {
    await api('/auth/password', { method: 'POST', body });
    state.me = null;
    renderAuth();
    toast('Password updated. Sign in again.');
  });
}
const actions = {
  'new-experience': () => actions.generate(),
  reload: () => route(),
  menu: () => $('.sidebar').classList.toggle('open'),
  theme: () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('atelier-theme', state.theme);
    document.documentElement.dataset.theme = state.theme;
  },
  logout: async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    state.me = null;
    renderAuth();
  },
  'new-workspace': () =>
    formDialog(
      'Create a workspace',
      '<label>Workspace name<input name="name" required placeholder="Your company"></label>',
      'Create workspace',
      async (body, _f, d) => {
        const t = await api('/tenants', { method: 'POST', body });
        d.closeDialog();
        state.me = await api('/me');
        state.t = t.id;
        navigate('/overview');
      },
    ),
  'new-project': () =>
    formDialog(
      'Start with your app',
      '<label>Project name<input name="name" required placeholder="Customer Operations"></label><label>Description<textarea name="description" placeholder="What does this application help people do?"></textarea></label>',
      'Create project',
      async (body, _f, d) => {
        const p = await api(tbase() + '/projects', { method: 'POST', body });
        d.closeDialog();
        navigate('/project/' + p.id + '/setup');
      },
      'A project is an isolated space for source, design patterns, model connections and published experiences.',
    ),
  'connect-observer': () =>
    formDialog(
      'Create browser observer',
      `<label>Application origin<input name="origin" type="url" required placeholder="https://app.example.com"><span class="help">Exact origin only. Requests from any other origin are rejected.</span></label><label>Environment<select name="environment"><option>production</option><option>staging</option><option>development</option></select></label><label class="checkbox"><input type="checkbox" name="designCapture" checked>Learn the host design contract from marked elements</label><span class="help">Add data-atelier-design-root to an approved shell and optional data-atelier-design-role="button|input|card|nav" markers. Only fixed computed CSS properties are sent.</span><label class="checkbox"><input type="checkbox" name="semanticSamples">Send locally redacted semantic samples</label><label>Safe categorical fields<input name="safeSampleFields" placeholder="status, severity, plan"><span class="help">Optional. Only these short categorical values may remain visible after local redaction. PII-shaped names are rejected.</span></label><div class="privacy-preview"><strong>Privacy boundary</strong><p>Raw bodies are inspected only inside the application page to derive schemas and redacted samples. Design capture sends fixed computed style values only. Headers, cookies, query strings, credentials, free text, identifiers, page text and DOM HTML are not transmitted.</p></div>`,
      'Create snippet',
      async (body, form, d) => {
        const semanticSamples = form.semanticSamples.checked;
        const source = await api(base() + '/discovery-sources', {
          method: 'POST',
          body: {
            kind: 'browser',
            name: `${new URL(body.origin).hostname} browser`,
            allowedOrigins: [new URL(body.origin).origin],
            semanticSamples,
            designCapture: form.designCapture.checked,
            safeSampleFields: semanticSamples
              ? body.safeSampleFields
                  .split(',')
                  .map((field) => field.trim())
                  .filter(Boolean)
              : [],
          },
        });
        d.closeDialog();
        secretDialog(
          'Paste this before the closing body tag',
          observerSnippet(location.origin, source, body.environment),
          'This public key can only submit redacted observations from the allowed origin. Copy the snippet now; rotating the source issues a new key.',
        );
        await route();
      },
      'The observer is source-code independent and does not execute API operations itself.',
    ),
  'approve-design': async () => {
    const design = await api(base() + '/design-contract');
    const latest = design.observations?.[0];
    if (!latest)
      return toast('Open a marked application page so the observer can learn styles.', true);
    formDialog(
      'Review host design contract',
      designReviewFields(latest, e),
      'Approve design contract',
      async (body, form, d) => {
        if (!form.reviewed.checked) throw new Error('Review the design contract first.');
        await api(base() + '/design-contract', {
          method: 'POST',
          body: { fingerprint: latest.fingerprint, overrides: designOverrides(body) },
        });
        d.closeDialog();
        toast('Versioned host design contract approved.');
        await route();
      },
      'Generated components inherit these approved values. A new observed revision does not silently replace this contract.',
    );
  },
  'synthesize-design': async () => {
    const job = await api(base() + '/design-synthesis', { method: 'POST', body: {} });
    toast('Agentic Design Genome synthesis queued against the approved contract.');
    navigate(`/project/${state.project.id}/jobs`);
    return job;
  },
  'review-design-synthesis': async () => {
    const design = await api(base() + '/design-contract');
    const synthesis = (design.syntheses ?? []).find(
      (candidate) =>
        candidate.status === 'draft' &&
        candidate.contractFingerprint === design.approved?.fingerprint,
    );
    if (!synthesis) return toast('No current design synthesis is waiting for review.', true);
    const value = synthesis.synthesis;
    formDialog(
      'Review intelligent design guidance',
      `<div class="privacy-preview"><strong>Approved contract remains authoritative</strong><p>The model interpreted only sanitized computed-style evidence. It cannot change tokens or grant UI/API authority.</p></div><h3>${e(value.summary)}</h3><div class="evidence-facts"><div><strong>${e(value.density)}</strong><span>density</span></div><div><strong>${e(value.hierarchy)}</strong><span>hierarchy</span></div><div><strong>${e(value.interactionTone)}</strong><span>interaction tone</span></div></div>${value.patterns.map((pattern) => `<details><summary>${e(pattern.name)} · ${Math.round(pattern.confidence * 100)}%</summary><p>${e(pattern.guidance)}</p><pre class="small-code">${e(JSON.stringify(pattern.evidence, null, 2))}</pre></details>`).join('')}<label>Decision<select name="decision"><option value="approved">Approve for generation</option><option value="rejected">Reject</option></select></label><label class="checkbox"><input type="checkbox" name="reviewed" required>I checked the cited evidence and semantic guidance.</label>`,
      'Save design decision',
      async (body, form, d) => {
        if (!form.reviewed.checked) throw new Error('Review the design synthesis first.');
        await api(base() + '/design-synthesis/' + synthesis.id + '/review', {
          method: 'POST',
          body: { approved: body.decision === 'approved' },
        });
        d.closeDialog();
        toast('Design synthesis decision saved.');
        await route();
      },
      'Only approved synthesis is supplied to the surface generator, alongside the unchanged deterministic contract.',
    );
  },
  'revoke-discovery': (el) =>
    formDialog(
      'Revoke discovery source',
      '<p>The installed snippet will stop sending observations immediately. Existing capability evidence and audit records remain.</p>',
      'Revoke source',
      async (_body, _form, d) => {
        await api(base() + '/discovery-sources/' + el.dataset.id, {
          method: 'DELETE',
          body: {},
        });
        d.closeDialog();
        await route();
      },
    ),
  'upload-spec': () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.className = 'file-input';
    picker.setAttribute('aria-label', 'OpenAPI document');
    picker.accept = '.json,.yaml,.yml,application/json,application/yaml,text/yaml';
    document.body.append(picker);
    const cleanup = () => picker.remove();
    picker.addEventListener('cancel', cleanup, { once: true });
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return cleanup();
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('OpenAPI files are limited to 2 MB.');
        await api(base() + '/specifications', {
          method: 'POST',
          body: { sourceName: file.name, document: await file.text() },
        });
        toast('OpenAPI contract imported. Review the discovered capabilities.');
        await route();
      } catch (err) {
        toast(err.message, true);
      } finally {
        cleanup();
      }
    };
    picker.click();
  },
  'import-spec-url': () =>
    formDialog(
      'Import an OpenAPI URL',
      '<label>Public HTTPS URL<input name="sourceUrl" type="url" required placeholder="https://api.example.com/openapi.json"><span class="help">Redirects, IP addresses, local hosts and private network destinations are rejected.</span></label><label>Source name<input name="sourceName" placeholder="Production API contract"></label>',
      'Import contract',
      async (body, _form, d) => {
        await api(base() + '/specifications', {
          method: 'POST',
          body: { sourceUrl: body.sourceUrl, sourceName: body.sourceName || undefined },
        });
        d.closeDialog();
        toast('OpenAPI contract imported.');
        await route();
      },
    ),
  'configure-agent': async () => {
    if (!state.model) return toast('Discover and review capabilities first.', true);
    const enabled = state.model.capabilities.filter(
      (capability) => capability.securityReviewed && capability.agentEnabled,
    );
    if (!enabled.length)
      return toast('Enable at least one approved capability for the chatbot.', true);
    const profile = await api(base() + '/agent-profile').catch(() => null);
    formDialog(
      'Configure project chatbot',
      agentSetupFields({
        profile,
        project: state.project,
        enabled,
        hasProvider: state.onboarding?.facts.provider,
        e,
        pill,
      }),
      'Save chatbot profile',
      async (body, form, d) => {
        const tools = new FormData(form).getAll('tools');
        if (!tools.length) throw new Error('Select at least one chatbot tool.');
        const delegation = specialistSetup(form, state.model.capabilities, tools);
        await api(base() + '/agent-profile', {
          method: 'POST',
          body: {
            tools,
            clientTools: tools,
            enableCommands: tools.some(
              (tool) =>
                state.model.capabilities.find((capability) => capability.id === tool)?.kind ===
                'command',
            ),
            voice: { name: body.name, tone: body.tone, locale: body.locale, terminology: [] },
            voiceReviewed: form.voiceReviewed.checked,
            retentionDays: Number(body.retentionDays),
            ...delegation,
            ...(profile ? { revision: profile.revision } : {}),
          },
        });
        d.closeDialog();
        toast('Chatbot profile saved against the current capability model.');
        await route();
      },
      'The hosted agent receives only this allowlist. Each selected API tool executes in the signed-in customer browser; model output cannot invent or enable tools.',
    );
  },
  'install-surface': () => {
    if (!state.model?.slots?.length)
      return toast('Discover a project model with at least one approved surface slot first.', true);
    if (!state.onboarding?.facts.designApproved)
      return toast(
        'Review the observed host design contract before generating an installer.',
        true,
      );
    formDialog(
      'Install a customer-owned surface',
      installSurfaceFields(state.model, e),
      'Generate install bundle',
      async (body, _form, d) => {
        const result = await api(base() + '/surface-installs', {
          method: 'POST',
          body,
        });
        d.closeDialog();
        const ready = dialog('Install bundle ready', installBundleSummary(result, e, icon), {
          wide: true,
        });
        const closeAndRefresh = async () => {
          ready.close();
          ready.remove();
          await route();
        };
        ready.closeDialog = closeAndRefresh;
        $('[data-close]', ready).onclick = closeAndRefresh;
        $('[data-download-install]', ready).onclick = () =>
          download(`atelier-${result.install.id}.install.json`, result.bundle);
        $('[data-copy-snippet]', ready).onclick = async () => {
          try {
            await navigator.clipboard.writeText(result.bundle.patches[0].snippet);
            toast('Hosted script copied.');
          } catch {
            toast('Clipboard access failed. Download the receipt bundle.', true);
          }
        };
        $('[data-copy-agent]', ready).onclick = async () => {
          try {
            await navigator.clipboard.writeText(codingAgentPrompt(result.bundle));
            toast('Coding-agent prompt copied. Attach the downloaded bundle.');
          } catch {
            toast(
              'Clipboard access failed. Download the bundle and use the customer handoff.',
              true,
            );
          }
        };
      },
      'Atelier serves the UI. The script calls only approved same-origin API contracts through the customer browser session; the customer API remains the authorization boundary.',
    );
  },
  'revoke-surface-install': (el) =>
    formDialog(
      'Revoke surface installer',
      '<p>The generated verification key stops working immediately. Existing customer files and signed releases are not removed.</p>',
      'Revoke installer',
      async (_body, _form, d) => {
        await api(base() + '/surface-installs/' + el.dataset.id, {
          method: 'DELETE',
          body: {},
        });
        d.closeDialog();
        await route();
      },
    ),
  upload: () => {
    if (!state.project) return toast('Open a project first.', true);
    const d = dialog(
      'Connect project sources',
      `<p>Choose an application folder. Source files are parsed without executing project code. Environment files, build output and dependency folders are skipped. Potential secrets are rejected server-side.</p><div class="source-drop">${icon('upload')}<p>React / Next.js · TypeScript · OpenAPI JSON<br>GraphQL · Prisma · CSS tokens</p><button class="btn" id="choose-folder">Choose source folder</button><input type="file" id="source-files" class="file-input" webkitdirectory multiple></div><p class="token-note">Up to 1,200 files, 512 KB per file and 8 MB total. Unsupported schema constructs remain explicit rather than being executed.</p><p class="form-error" role="alert"></p>`,
    );
    $('#choose-folder', d).onclick = () => $('#source-files', d).click();
    $('#source-files', d).onchange = async (ev) => {
      try {
        await uploadFiles(ev.target.files);
        d.closeDialog();
      } catch (err) {
        $('.form-error', d).textContent = err.message;
      }
    };
  },
  sample: async () => {
    const snapshot = await api('/examples/support');
    await api(base() + '/sources', { method: 'POST', body: snapshot });
    toast('Sample source scan queued.');
    navigate(`/project/${state.project.id}/jobs`);
  },
  generate: () => {
    if (!state.model) return toast('Upload and scan project source first.', true);
    const m = state.model;
    const permissions = [...new Set(m.capabilities.flatMap((c) => c.requiredPermissions))];
    formDialog(
      'Design a better workflow',
      `<label>What should this screen help someone do?<textarea name="goal" required minlength="8" placeholder="Help a support lead understand an at-risk customer and choose the right next action."></textarea></label><div class="two-fields"><label>Extension slot<select name="slotId">${m.slots.map((s) => `<option value="${e(s.id)}">${e(s.id)}</option>`).join('')}</select></label><label>Role / experience cohort<input name="role" value="support_manager" required></label></div><label>Host permission scopes<input name="permissions" value="${e(permissions.join(', '))}"><span class="help">This is an authoring context, not an authorization grant. Your backend must verify real permissions.</span></label><div class="two-fields"><label>Build mode<select name="mode"><option value="model" ${state.project.providerId ? '' : 'disabled'}>Model-assisted · configured provider</option><option value="deterministic" ${state.project.providerId ? '' : 'selected'}>Deterministic preview · no LLM</option></select></label><label>Variants<select name="variants"><option>3</option><option>2</option><option>1</option></select></label></div>`,
      'Generate drafts',
      async (body, _f, d) => {
        body.permissions = body.permissions
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        body.variants = Number(body.variants);
        await api(base() + '/generate', { method: 'POST', body });
        d.closeDialog();
        navigate(`/project/${state.project.id}/jobs`);
      },
      'Reuse your app’s contracts and design grammar. Every result remains a reviewable draft. Unreviewed commands are omitted.',
    );
  },
  'select-visible-capabilities': () => {
    const visible = new Set(visibleCapabilityIds());
    $$('[data-cap-select]').forEach((checkbox) => {
      if (visible.has(checkbox.value)) checkbox.checked = true;
    });
    updateCapabilitySelectionUi();
  },
  'clear-capability-selection': () => {
    $$('[data-cap-select]').forEach((checkbox) => (checkbox.checked = false));
    updateCapabilitySelectionUi();
  },
  'bulk-review-selected': () => {
    const ids = selectedCapabilityIds();
    if (!ids.length) return toast('Select at least one capability.', true);
    bulkReviewDialog(ids, 'Approve selected capabilities');
  },
  'bulk-reopen-selected': () => {
    const ids = selectedCapabilityIds();
    if (!ids.length) return toast('Select at least one reviewed capability.', true);
    bulkReopenDialog(ids);
  },
  'bulk-review-all': () => {
    const ids = state.model.capabilities
      .filter((capability) => !capability.securityReviewed)
      .map((capability) => capability.id);
    if (!ids.length) return toast('Every capability is already reviewed.');
    bulkReviewDialog(ids, 'Approve all pending capabilities');
  },
  'bulk-agent-enable': () => {
    const ids = selectedCapabilityIds();
    if (!ids.length) return toast('Select at least one approved capability.', true);
    bulkAgentAccessDialog(ids, true);
  },
  'bulk-agent-disable': () => {
    const ids = selectedCapabilityIds();
    if (!ids.length) return toast('Select at least one capability.', true);
    bulkAgentAccessDialog(ids, false);
  },
  'review-cap': (el) => {
    const c = state.model.capabilities.find((c) => c.id === el.dataset.id);
    formDialog(
      'Review capability',
      `<code class="code-tag">${e(c.id)}</code><div class="recommendation"><strong>Atelier recommendation: ${e(humanize(c.recommendation?.review ?? 'manual_review'))}</strong><p>${e((c.recommendation?.reasons ?? ['Verify actual authorization and behavior.']).join(' '))}</p></div><label>Capability name<input name="title" value="${e(c.title ?? humanize(c.id))}" required></label><label>Purpose<textarea name="description" required>${e(c.description ?? c.summary ?? `Use ${c.id}`)}</textarea></label><details><summary>Evidence and redacted samples</summary><pre class="small-code">${e(JSON.stringify({ input: c.inputSchema, output: c.outputSchema, operation: c.operation, evidence: c.evidence, redactedSamples: c.redactedSamples ?? [] }, null, 2))}</pre></details><div class="two-fields"><label>Decision<select name="decision"><option value="approved" ${c.securityReviewed ? 'selected' : ''}>Approve</option><option value="rejected" ${c.reviewDecision === 'rejected' ? 'selected' : ''}>Reject</option></select></label><label>Risk<select name="risk">${['read_only', 'low', 'sensitive', 'destructive'].map((x) => `<option ${x === c.risk ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div><label>Confirmation<select name="confirmation">${['none', 'inline', 'modal', 'verbal_required'].map((x) => `<option ${x === c.confirmation ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Required permissions<input name="requiredPermissions" value="${e(c.requiredPermissions.join(', '))}"></label><label>Sensitive field paths<input name="piiFields" value="${e((c.piiFields ?? []).join(', '))}"></label><label class="checkbox"><input type="checkbox" name="agentEnabled" ${c.agentEnabled === true ? 'checked' : ''}>Expose to the chatbot after approval</label><label class="checkbox"><input type="checkbox" name="reversible" ${c.reversible === true ? 'checked' : ''}>Reversible, with a registered rollback action</label><label>Rollback capability ID<input name="rollbackCapabilityId" value="${e(c.rollbackCapabilityId ?? '')}"></label>`,
      'Save decision',
      async (body, f, d) => {
        body.requiredPermissions = body.requiredPermissions
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        body.piiFields = body.piiFields
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        body.reversible = f.reversible.checked;
        body.agentEnabled = f.agentEnabled.checked;
        body.approved = body.decision === 'approved';
        delete body.decision;
        await api(base() + '/capabilities/' + encodeURIComponent(c.id), { method: 'PATCH', body });
        d.closeDialog();
        await route();
        toast(
          body.approved
            ? 'Capability approved with an explicit chatbot decision.'
            : 'Capability rejected and kept out of the chatbot.',
        );
      },
      'These semantics are authoritative. Confirm actual backend behavior; HTTP methods alone do not prove safety or reversibility.',
    );
  },
  job: async (el) => {
    const j = await api(base() + '/jobs/' + el.dataset.id);
    const d = dialog(
      'Build trace',
      `<p>${pill(j.status)} <span class="code-tag">${e(j.kind)}</span></p>${j.error ? `<div class="info-strip">${e(j.error.message)}<br><code>${e(j.error.code)}</code></div>` : ''}${j.trace.map((x) => `<div class="ledger-row"><span class="dotline"></span><span>${e(x.stage)}</span><time>${new Date(x.at).toLocaleTimeString()}</time></div>`).join('') || '<p>Waiting for a worker lease.</p>'}${j.result?.releaseIds ? `<div class="buttons space-top"><a class="btn" href="/project/${state.project.id}/lab" data-done>View drafts ${icon('arrow')}</a></div>` : ''}${['running', 'queued'].includes(j.status) ? '<button class="btn secondary" data-cancel-job>Cancel build</button>' : ''}`,
    );
    if ($('[data-cancel-job]', d))
      $('[data-cancel-job]', d).onclick = async () => {
        await api(base() + '/jobs/' + j.id + '/cancel', { method: 'POST', body: {} });
        d.closeDialog();
        await route();
      };
  },
  approve: () =>
    formDialog(
      'Approve this experience',
      `<label class="checkbox"><input type="checkbox" name="previewReviewed" required>I reviewed the rendered screen, loading / empty / error states, keyboard access and the intended task.</label><label>Review note<textarea name="note" placeholder="What did you verify? Include any deployment constraints."></textarea></label>`,
      'Approve draft',
      async (body, _f, d) => {
        await api(base() + '/releases/' + state.release.id + '/review', {
          method: 'POST',
          body: { approved: true, previewReviewed: body.previewReviewed === 'on', note: body.note },
        });
        d.closeDialog();
        await route();
      },
    ),
  reject: () =>
    formDialog(
      'Reject this draft',
      '<label>What needs to change?<textarea name="note" required></textarea></label>',
      'Reject',
      async (body, _f, d) => {
        await api(base() + '/releases/' + state.release.id + '/review', {
          method: 'POST',
          body: { approved: false, note: body.note },
        });
        d.closeDialog();
        await route();
      },
    ),
  publish: async () => {
    const deployments = await api(base() + '/deployments');
    const rev =
      deployments.find(
        (x) => x.slot_id === state.release.slot_id && x.environment === state.release.environment,
      )?.revision ?? 0;
    formDialog(
      'Publish a signed release',
      '<label>Rollout percentage<input name="rolloutPercent" type="number" min="0" max="100" value="100" required></label><p class="help">Users outside the cohort receive the previous release, or their existing host UI. No app code is replaced.</p>',
      'Publish',
      async (body, _f, d) => {
        await api(base() + '/releases/' + state.release.id + '/publish', {
          method: 'POST',
          body: { revision: rev, rolloutPercent: Number(body.rolloutPercent) },
        });
        d.closeDialog();
        await route();
        toast('Signed release published.');
      },
    );
  },
  promote: async () => {
    const r = await api(base() + '/releases/' + state.release.id + '/promote', {
      method: 'POST',
      body: {},
    });
    navigate(`/project/${state.project.id}/releases/${r.id}`);
  },
  deployments: async () => {
    const rows = await api(base() + '/deployments');
    const d = dialog(
      'Deployment history',
      rows
        .map(
          (x) =>
            `<div class="activity-row"><div><strong>${e(x.slot_id)}</strong><p>${e(x.environment)} · Revision ${x.revision} · ${x.rollout_percent}% rollout</p></div>${x.previous_release_id ? `<button class="btn secondary sm" data-rollback="${e(x.slot_id)}" data-env="${x.environment}" data-rev="${x.revision}">Rollback</button>` : ''}</div>`,
        )
        .join('') || '<p>No active deployments.</p>',
    );
    $$('[data-rollback]', d).forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await api(base() + '/rollback', {
              method: 'POST',
              body: {
                slotId: b.dataset.rollback,
                environment: b.dataset.env,
                revision: Number(b.dataset.rev),
              },
            });
            d.closeDialog();
            toast('Previous signed release restored.');
            await route();
          } catch (err) {
            toast(err.message, true);
          }
        }),
    );
  },
  'visual-review': () => {
    const f = document.createElement('input');
    f.type = 'file';
    f.accept = 'image/png,image/jpeg,image/webp';
    f.onchange = async () => {
      try {
        const file = f.files?.[0];
        if (!file) return;
        if (file.size > 1000000) throw new Error('Use a screenshot below 1 MB.');
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        formDialog(
          'Review screenshot',
          '<label>State<select name="state"><option>ready</option><option>loading</option><option>empty</option><option>error</option><option>mobile</option></select></label><label class="checkbox"><input type="checkbox" name="redacted" required>I confirm the screenshot contains only redacted or example data.</label>',
          'Queue visual review',
          async (body, _form, d) => {
            await api(base() + '/visual-review', {
              method: 'POST',
              body: {
                releaseId: state.release.id,
                images: [{ dataUrl, state: body.state }],
                redacted: true,
              },
            });
            d.closeDialog();
            navigate(`/project/${state.project.id}/jobs`);
          },
        );
      } catch (err) {
        toast(err.message, true);
      }
    };
    f.click();
  },
  'download-kit': () =>
    download(`${state.release.artifact.kit.name}.kit.json`, state.release.artifact.kit),
  'download-openapi': () =>
    download(`${state.project.slug || state.project.id}.openapi.json`, state.apiSpec),
  export: async () => download('atelier-project-export.json', await api(base() + '/export')),
  'new-connection': () =>
    formDialog(
      'Add a model connection',
      `<label>Connection name<input name="name" required placeholder="Design team · API"></label><label>Provider<select name="kind">${['openai', 'anthropic', 'gemini', 'openai-compatible', 'codex-cli', 'claude-cli'].map((x) => `<option>${x}</option>`).join('')}</select></label><label>Scope<select name="projectId"><option value="">Workspace · API only</option>${state.projects.map((p) => `<option value="${p.id}" ${state.project?.id === p.id ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></label><label>Model identifier<input name="model" placeholder="Claude CLI defaults to claude-opus-4-8"></label><label>Claude CLI effort<select name="effort"><option>high</option><option>low</option><option>medium</option><option>xhigh</option><option>max</option></select><span class="help">Used only by Claude CLI; high is the pinned default.</span></label><label>API key <span class="help">API providers only. Stored encrypted; never returned.</span><input name="apiKey" type="password" autocomplete="new-password"></label><label>Compatible API base URL <span class="help">Only for openai-compatible; operator allowlist required.</span><input name="baseUrl" type="url" placeholder="https://provider.example/v1"></label><label>Project runner ID <span class="help">CLI providers only. Register in project settings first.</span><input name="runnerId"></label>`,
      'Save connection',
      async (body, _f, d) => {
        body.projectId = body.projectId || null;
        body.model = body.model || undefined;
        body.effort = body.kind === 'claude-cli' ? body.effort : undefined;
        await api(tbase() + '/connections', { method: 'POST', body });
        d.closeDialog();
        await route();
      },
    ),
  'revoke-connection': (el) =>
    formDialog(
      'Revoke connection',
      '<p>Future model calls using this connection will fail closed. Existing signed screens keep rendering.</p>',
      'Revoke',
      async (_b, _f, d) => {
        await api(tbase() + '/connections/' + el.dataset.id, { method: 'DELETE', body: {} });
        d.closeDialog();
        await route();
      },
    ),
  'new-runner': () =>
    formDialog(
      'Register a project runner',
      '<label>Runner name<input name="name" required placeholder="Build machine · project account"></label><label>Provider<select name="provider"><option>codex-cli</option><option>claude-cli</option><option value="both">Codex + Claude</option></select></label>',
      'Register',
      async (body, _f, d) => {
        const result = await api(base() + '/runners', {
          method: 'POST',
          body: {
            name: body.name,
            providers: body.provider === 'both' ? ['codex-cli', 'claude-cli'] : [body.provider],
          },
        });
        d.closeDialog();
        await route();
        secretDialog(
          'Connect your runner',
          JSON.stringify(
            {
              server: location.origin,
              token: result.token,
              runnerId: result.id,
              providers: result.providers,
            },
            null,
            2,
          ),
          'Save this as a private runner configuration. Run: node scripts/runner.mjs --config /private/runner.json. Use a dedicated local CLI account for this project.',
        );
      },
    ),
  'new-token': () =>
    formDialog(
      'Create host-server token',
      '<label>Token name<input name="name" required placeholder="Production app backend"></label><label>Scopes<input name="scopes" value="read" required><span class="help">read, edit, run, publish, telemetry. Start with read only.</span></label><label>Expiry (days)<input name="days" type="number" value="30" min="1" max="90"></label>',
      'Create token',
      async (body, _f, d) => {
        const result = await api(base() + '/tokens', {
          method: 'POST',
          body: {
            ...body,
            scopes: body.scopes.split(',').map((x) => x.trim()),
            days: Number(body.days),
          },
        });
        d.closeDialog();
        await route();
        secretDialog('Your project token', result.token);
      },
    ),
  'revoke-token': async (el) => {
    await api(base() + '/tokens/' + el.dataset.id, { method: 'DELETE', body: {} });
    await route();
    toast('Token revoked.');
  },
  'revoke-runner': async (el) => {
    await api(base() + '/runners/' + el.dataset.id, { method: 'DELETE', body: {} });
    await route();
    toast('Runner revoked.');
  },
  invite: () =>
    formDialog(
      'Invite someone to your team',
      `<label>Email address<input name="email" type="email" required></label><div class="two-fields"><label>Workspace role<select name="role"><option>member</option><option>viewer</option><option>admin</option></select></label><label>Project role<select name="projectRole"><option>viewer</option><option>editor</option><option>reviewer</option><option>admin</option></select></label></div><label>Grant project access<select name="projectId"><option value="">None yet</option>${state.projects.map((p) => `<option value="${p.id}">${e(p.name)}</option>`).join('')}</select></label>`,
      'Create invitation',
      async (body, _f, d) => {
        body.projectId = body.projectId || null;
        const result = await api(tbase() + '/invitations', { method: 'POST', body });
        d.closeDialog();
        secretDialog(
          'Share this private invitation',
          `${location.origin}/join#${result.invitationToken}`,
          'Send through a trusted channel. It expires in seven days and can be used only once. No email delivery service is configured by default.',
        );
      },
    ),
  member: async (el) => {
    const members = await api(tbase() + '/members');
    const m = members.find((x) => x.id === el.dataset.id);
    formDialog(
      'Manage team access',
      `<p>${e(m.name)} · ${e(m.email)}</p><label>Workspace role<select name="role">${['owner', 'admin', 'member', 'viewer'].map((x) => `<option ${x === m.role ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Project<select name="projectId"><option value="">No project change</option>${state.projects.map((p) => `<option value="${p.id}">${e(p.name)}</option>`).join('')}</select></label><label>Project role<select name="projectRole">${['viewer', 'editor', 'reviewer', 'admin'].map((x) => `<option>${x}</option>`).join('')}</select></label><label class="checkbox"><input type="checkbox" name="remove">Remove from workspace and revoke scoped tokens</label>`,
      'Save access',
      async (body, f, d) => {
        await api(tbase() + '/members/' + m.id, {
          method: 'PATCH',
          body: { role: body.role, remove: f.remove.checked },
        });
        if (body.projectId && !f.remove.checked)
          await api(tbase() + '/projects/' + body.projectId + '/members/' + m.id, {
            method: 'PATCH',
            body: { role: body.projectRole },
          });
        d.closeDialog();
        state.me = await api('/me');
        await route();
      },
    );
  },
  archive: () =>
    formDialog(
      'Archive this project',
      '<p>Queued work will stop and project tokens will be revoked. Source and audit history are retained for operators; the project disappears from normal listings.</p><label>Type ARCHIVE<input name="confirm" pattern="ARCHIVE" required></label>',
      'Archive',
      async (_b, _f, d) => {
        await api(base(), { method: 'DELETE', body: {} });
        d.closeDialog();
        navigate('/projects');
      },
    ),
  'setup-mfa': () =>
    formDialog(
      'Set up two-factor authentication',
      '<label>Confirm your password<input name="password" type="password" required autocomplete="current-password"></label>',
      'Continue',
      async (body, _f, d) => {
        const result = await api('/auth/mfa/setup', { method: 'POST', body });
        d.closeDialog();
        formDialog(
          'Add to your authenticator',
          `<p>Enter this secret in an authenticator app, then enter the current six-digit code.</p><code class="secret">${e(result.secret)}</code><label>Verification code<input name="code" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="one-time-code"></label>`,
          'Enable 2FA',
          async (b, _f, d2) => {
            const enabled = await api('/auth/mfa/confirm', { method: 'POST', body: b });
            d2.closeDialog();
            state.me = await api('/me');
            await route();
            secretDialog(
              'Save your recovery codes',
              enabled.recoveryCodes.join('\n'),
              'Keep these offline. Each recovery code can be used once. They are never displayed again.',
            );
          },
        );
      },
    ),
  'disable-mfa': () =>
    formDialog(
      'Disable two-factor authentication',
      '<label>Password<input type="password" name="password" required autocomplete="current-password"></label><label>Current verification code<input name="code" required></label>',
      'Disable 2FA',
      async (body, _f, d) => {
        await api('/auth/mfa/disable', { method: 'POST', body });
        d.closeDialog();
        state.me = await api('/me');
        await route();
      },
    ),
  search: () => {
    const d = dialog(
      'Find your way',
      `<input class="palette-input" id="palette" placeholder="Search projects or this app’s capabilities…" aria-label="Search"><div class="palette-results" id="results"></div>`,
      { wide: true },
    );
    const draw = async (q) => {
      let hits = state.projects
        .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
        .map((p) => ({ label: p.name, kind: 'Project', href: '/project/' + p.id }));
      if (q && state.project) {
        const extra = await api(base() + '/search?q=' + encodeURIComponent(q));
        hits.push(
          ...extra.slice(0, 8).map((x) => ({
            label: x.ref,
            kind: x.kind,
            href: `/project/${state.project.id}/${x.kind === 'component' ? 'design' : 'model'}`,
          })),
        );
      }
      if (!d.isConnected) return;
      $('#results', d).innerHTML =
        hits
          .map(
            (h) =>
              `<a class="palette-item" href="${h.href}">${icon(h.kind === 'Project' ? 'folder' : 'code')}${e(h.label)}<span>${e(h.kind)}</span></a>`,
          )
          .join('') || '<p class="padded">No matching project facts.</p>';
    };
    let timer;
    $('#palette', d).oninput = (ev) => {
      clearTimeout(timer);
      timer = setTimeout(() => draw(ev.target.value).catch((err) => toast(err.message, true)), 250);
    };
    draw('');
  },
};
document.addEventListener('click', (ev) => {
  const action = ev.target.closest('[data-action]');
  if (action) {
    ev.preventDefault();
    Promise.resolve()
      .then(() => actions[action.dataset.action]?.(action))
      .catch((err) => toast(err.message, true));
    return;
  }
  const link = ev.target.closest('a[href]');
  if (
    link &&
    link.origin === location.origin &&
    link.pathname !== '/api' &&
    !ev.metaKey &&
    !ev.ctrlKey &&
    !ev.shiftKey
  ) {
    if (link.getAttribute('href') === '#') {
      ev.preventDefault();
      return;
    }
    ev.preventDefault();
    link.closest('dialog')?.closeDialog?.();
    navigate(link.pathname + link.search + link.hash);
  }
});
document.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k' && state.me) {
    ev.preventDefault();
    actions.search();
  }
});
window.addEventListener('popstate', route);
route();
