// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Browser-only surface SDK. No Node imports, eval, remote code or raw HTML. */
export const escapeHtml = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const humanize = (s) =>
  String(s ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
const denied = new Set(['__proto__', 'prototype', 'constructor']);
export function readField(value, path) {
  let v = value;
  for (const part of String(path).split('.')) {
    if (denied.has(part) || !v || typeof v !== 'object' || !Object.hasOwn(v, part))
      return undefined;
    v = v[part];
  }
  return v;
}
export function formatValue(value, field = '') {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number')
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (typeof value === 'object')
    return Array.isArray(value) ? `${value.length} items` : 'View details';
  const s = String(value);
  if (/At$|date|Date/.test(field) && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(+d))
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return s.length > 1000 ? s.slice(0, 1000) + '…' : s;
}
function node(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined)
      el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
function states(kind, retry) {
  if (kind === 'loading')
    return node('div', { class: 'as-state as-loading', role: 'status', 'aria-live': 'polite' }, [
      node('span', { class: 'as-spinner', 'aria-hidden': 'true' }),
      'Loading context…',
    ]);
  if (kind === 'error')
    return node('div', { class: 'as-state', role: 'alert' }, [
      node('strong', { text: 'This information couldn’t be loaded.' }),
      node('p', { text: 'Your existing app is unaffected. Try the request again.' }),
      node('button', {
        class: 'as-btn as-secondary',
        type: 'button',
        onclick: retry,
        text: 'Try again',
      }),
    ]);
  return node('div', { class: 'as-state' }, [
    node('span', { class: 'as-empty-symbol', text: '○', 'aria-hidden': 'true' }),
    node('strong', { text: 'Nothing here yet' }),
    node('p', { text: 'Information will appear when it becomes available.' }),
  ]);
}
function renderRows(section, value) {
  const rows = Array.isArray(value) ? value : value == null ? [] : [value];
  if (!rows.length) return states('empty');
  const visible = rows.slice(0, 100);
  if (section.variant === 'table') {
    const head = node(
      'tr',
      {},
      section.fields.map((f) => node('th', { scope: 'col', text: humanize(f) })),
    );
    const body = visible.map((row) =>
      node(
        'tr',
        {},
        section.fields.map((f) => node('td', { text: formatValue(readField(row, f), f) })),
      ),
    );
    return node('div', { class: 'as-table-wrap', tabindex: 0, 'aria-label': section.title }, [
      node('table', { class: 'as-table' }, [node('thead', {}, [head]), node('tbody', {}, body)]),
      ...(rows.length > 100 ? [node('p', { text: 'Showing the first 100 records.' })] : []),
    ]);
  }
  const container = node(section.variant === 'timeline' ? 'ol' : 'div', {
    class: `as-values as-${section.variant}`,
  });
  for (const row of visible) {
    const group = node(section.variant === 'timeline' ? 'li' : 'dl', { class: 'as-record' });
    for (const field of section.fields) {
      const value = readField(row, field);
      const box = node('div', {
        class: `as-field ${section.variant === 'metrics' && typeof value === 'number' ? 'as-numeric' : ''}`,
      });
      box.append(node('dt', { text: humanize(field) }));
      const dd = node('dd', { text: formatValue(value, field) });
      if (/status|priority|risk$/i.test(field)) {
        dd.className = 'as-tag';
      }
      box.append(dd);
      group.append(box);
    }
    if (section.variant === 'timeline') {
      const dl = node('dl');
      while (group.firstChild) dl.append(group.firstChild);
      group.append(dl);
    }
    container.append(group);
  }
  return container;
}
export async function collectAction(contract, context = {}, label = humanize(contract.id)) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const dialog = node('dialog', { class: 'as-dialog', 'aria-label': label });
    const form = node('form', {});
    form.append(
      node('div', { class: 'as-dialog-head' }, [
        node('span', { class: 'as-eyebrow', text: 'Confirm an action' }),
        node('h2', { text: label }),
        node('p', {
          text:
            contract.risk === 'destructive'
              ? 'This change may be irreversible. Review the details before continuing.'
              : 'Review the details. Your app will verify permission before making any change.',
        }),
      ]),
    );
    const controls = new Map();
    const required = new Set(contract.inputSchema?.required ?? []);
    for (const [name, schema] of Object.entries(contract.inputSchema?.properties ?? {})) {
      if (denied.has(name)) continue;
      let control;
      const preset = Object.hasOwn(context, name) ? context[name] : undefined;
      if (schema.enum) {
        control = node('select', { name, required: required.has(name) }, [
          node('option', { value: '', text: 'Choose…' }),
          ...schema.enum.map((v) => node('option', { value: String(v), text: humanize(v) })),
        ]);
      } else if (schema.type === 'boolean') control = node('input', { type: 'checkbox', name });
      else if (schema.type === 'object' || schema.type === 'array')
        control = node('textarea', {
          name,
          required: required.has(name),
          placeholder: schema.type === 'array' ? '[]' : '{}',
          rows: 3,
        });
      else
        control = node(
          schema.maxLength > 200 || /reason|message|description/i.test(name) ? 'textarea' : 'input',
          {
            name,
            type: schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text',
            required: required.has(name),
            ...(schema.type === 'integer' ? { step: 1 } : {}),
            ...(schema.maxLength ? { maxlength: schema.maxLength } : {}),
            ...(schema.minimum !== undefined ? { min: schema.minimum } : {}),
            ...(schema.maximum !== undefined ? { max: schema.maximum } : {}),
          },
        );
      if (preset !== undefined) {
        if (schema.type === 'boolean') control.checked = !!preset;
        else control.value = typeof preset === 'object' ? JSON.stringify(preset) : String(preset);
      }
      controls.set(name, { control, schema });
      form.append(
        node('label', { class: 'as-control' }, [
          node('span', { text: humanize(name) + (required.has(name) ? ' *' : '') }),
          control,
        ]),
      );
    }
    let phrase;
    if (contract.confirmation === 'verbal_required') {
      phrase = node('input', { required: true, autocomplete: 'off', placeholder: 'CONFIRM' });
      form.append(
        node('label', { class: 'as-control' }, [
          node('span', { text: 'Type CONFIRM to proceed' }),
          phrase,
        ]),
      );
    }
    const error = node('p', { class: 'as-error', role: 'alert' });
    form.append(error);
    const close = (value) => {
      dialog.close();
      dialog.remove();
      previous?.focus();
      resolve(value);
    };
    const cancel = node('button', {
      type: 'button',
      class: 'as-btn as-secondary',
      text: 'Cancel',
      onclick: () => close(null),
    });
    const submit = node('button', {
      type: 'submit',
      class: `as-btn ${contract.risk === 'destructive' ? 'as-danger' : ''}`,
      text: label,
    });
    form.append(node('div', { class: 'as-dialog-actions' }, [cancel, submit]));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        if (phrase && phrase.value !== 'CONFIRM') throw new Error('Type CONFIRM exactly.');
        const input = {};
        for (const [name, { control, schema }] of controls) {
          if (control.value === '' && !required.has(name)) continue;
          let v = control.value;
          if (schema.enum) {
            v = schema.enum.find((item) => String(item) === control.value);
            if (v === undefined) throw new Error('Choose a valid option.');
          } else if (schema.type === 'boolean') v = control.checked;
          else if (schema.type === 'number' || schema.type === 'integer') {
            v = Number(v);
            if (!Number.isFinite(v)) throw new Error('Enter a valid number.');
          } else if (schema.type === 'object' || schema.type === 'array') v = JSON.parse(v);
          input[name] = v;
        }
        close({ input, confirmed: true, phrase: phrase?.value });
      } catch (err) {
        error.textContent = err.message;
      }
    });
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    (dialog.querySelector('input,textarea,select') ?? cancel).focus();
  });
}
/** load and dispatch are host-owned callbacks. Backend authorization is mandatory.
 * dispose aborts stale loads and prevents writes into a replaced route. */
export function mountSurface(
  root,
  bundle,
  { load, dispatch, context = {}, exampleState = null, components = {} } = {},
) {
  if (!(root instanceof Element)) throw new Error('A mount element is required');
  const ac = new AbortController();
  let disposed = false,
    busy = false;
  const data = new Map(),
    pending = new Map(),
    readySources = new Set();
  const design = bundle.presentation ?? {
    title: bundle.taskSpec?.goal ?? 'Your workspace',
    description: '',
    layout: 'focus',
    sections: (bundle.experiencePlan?.queryPlan ?? []).map((q, i) => ({
      id: `region_${i}`,
      title: humanize(q.capabilityId),
      source: q.capabilityId,
      fields: q.fields,
      variant: 'facts',
    })),
    actions: (bundle.experiencePlan?.actionPlan ?? []).map((a) => ({
      capabilityId: a.capabilityId,
      label: humanize(a.capabilityId),
    })),
  };
  const shell = node('section', {
    class: `atelier-surface as-layout-${design.layout}`,
    'aria-label': design.title,
  });
  const header = node('header', { class: 'as-header' }, [
    node('span', { class: 'as-eyebrow', text: 'A focused workspace' }),
    node('h2', { text: design.title }),
    node('p', { text: design.description }),
  ]);
  const grid = node('div', { class: 'as-regions' });
  const footer = node('footer', { class: 'as-actions' });
  const message = node('p', { class: 'as-message', role: 'status', 'aria-live': 'polite' });
  shell.append(header, grid, footer, message);
  root.replaceChildren(shell);
  const updateActions = () => {
    for (const b of footer.querySelectorAll('button'))
      b.disabled =
        busy || !dispatch || readySources.size < new Set(design.sections.map((s) => s.source)).size;
  };
  const refreshers = [];
  for (const section of design.sections) {
    const region = node('section', { class: `as-region as-region-${section.variant}` }, [
      node('h3', { text: section.title }),
    ]);
    const content = node('div', { class: 'as-region-body' });
    region.append(content);
    grid.append(region);
    const refresh = async () => {
      if (disposed) return;
      content.replaceChildren(states('loading'));
      if (exampleState === 'loading') return;
      try {
        if (exampleState === 'error') throw new Error('Example state');
        const value =
          exampleState === 'empty'
            ? []
            : await (pending.get(section.source) ??
                (() => {
                  const work = Promise.resolve().then(() =>
                    load(section.source, context, ac.signal),
                  );
                  pending.set(section.source, work);
                  return work;
                })());
        if (disposed) return;
        data.set(section.source, value);
        readySources.add(section.source);
        updateActions();
        if (components[section.componentId]) {
          const rendered = components[section.componentId]({ data: value, section, context });
          if (!(rendered instanceof Node)) throw new Error('Host component must return a DOM node');
          content.replaceChildren(rendered);
        } else content.replaceChildren(renderRows(section, value));
      } catch (err) {
        if (!disposed && !ac.signal.aborted) {
          readySources.delete(section.source);
          updateActions();
          content.replaceChildren(
            states('error', () => {
              pending.delete(section.source);
              refresh();
            }),
          );
        }
      }
    };
    refreshers.push(refresh);
    refresh();
  }
  for (const action of design.actions) {
    const contract = bundle.actionContracts?.find((c) => c.id === action.capabilityId) ?? {
      id: action.capabilityId,
      inputSchema: { type: 'object', properties: {} },
      risk: 'sensitive',
      confirmation: 'modal',
    };
    const button = node('button', {
      class: `as-btn ${contract.risk === 'destructive' ? 'as-danger as-secondary' : ''}`,
      type: 'button',
      text: action.label,
      disabled: !dispatch || readySources.size < new Set(design.sections.map((s) => s.source)).size,
    });
    button.addEventListener('click', async () => {
      if (busy || disposed) return;
      const request = await collectAction(contract, context, action.label);
      if (!request || disposed) return;
      busy = true;
      for (const b of footer.querySelectorAll('button')) b.disabled = true;
      button.textContent = 'Working…';
      message.textContent = '';
      try {
        await dispatch(action.capabilityId, request.input, {
          confirmed: true,
          signal: ac.signal,
          bundleId: bundle.bundleId,
        });
        if (!disposed) {
          message.textContent = 'Action completed.';
          pending.clear();
          readySources.clear();
          await Promise.all(refreshers.map((f) => f()));
        }
      } catch (err) {
        if (!disposed) message.textContent = err.message ?? 'The action could not be completed.';
      } finally {
        busy = false;
        if (!disposed) {
          button.textContent = action.label;
          updateActions();
        }
      }
    });
    footer.append(button);
  }
  return {
    refresh: () => {
      pending.clear();
      readySources.clear();
      updateActions();
      return Promise.all(refreshers.map((f) => f()));
    },
    dispose() {
      disposed = true;
      ac.abort();
      root.replaceChildren();
    },
  };
}
export function exampleData(bundle) {
  const out = {};
  for (const c of bundle.dataContracts ?? []) {
    const schema = c.outputSchema?.items ?? c.outputSchema;
    const row = {};
    for (const f of c.fields) {
      const s = schema?.properties?.[f] ?? {};
      row[f] =
        s.enum?.[0] ??
        (s.type === 'number' || s.type === 'integer'
          ? /score/i.test(f)
            ? 72
            : 3
          : s.type === 'boolean'
            ? true
            : /At$|date/i.test(f)
              ? '2026-08-24T09:00:00Z'
              : /status/i.test(f)
                ? 'Needs attention'
                : /name/i.test(f)
                  ? 'Example account'
                  : /plan/i.test(f)
                    ? 'Business'
                    : /action/i.test(f)
                      ? 'Review the open escalation'
                      : humanize(f));
    }
    out[c.id] = c.outputSchema?.type === 'array' ? [row] : row;
  }
  return out;
}
