import { projectFields } from '../../../runtime/src/index.mjs';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function kebab(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase();
}

function renderValue(value) {
  if (value === null || value === undefined || value === '')
    return '<span class="atelier-empty-value">—</span>';
  if (typeof value === 'object') return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  return escapeHtml(value);
}

function resolveData(node, dataByCapability) {
  if (!node.data?.source) return undefined;
  const value = dataByCapability[node.data.source];
  if (value instanceof Error) return { state: 'error', value };
  if (value === undefined) return { state: 'loading', value: null };
  if (value === null || (Array.isArray(value) && value.length === 0))
    return { state: 'empty', value };
  return { state: 'ready', value };
}

function renderState(node, state) {
  const stateNode = node.data?.states?.[state];
  if (stateNode) return renderNode(stateNode, {});
  if (state === 'loading') return '<div class="atelier-state" aria-busy="true">Loading…</div>';
  if (state === 'empty') return '<div class="atelier-state">No data</div>';
  return '<div class="atelier-state" role="alert">Unable to load data</div>';
}

function renderDataComponent(node, resolved) {
  if (resolved.state !== 'ready') return renderState(node, resolved.state);
  const data = resolved.value;
  const title = node.props?.title ? `<h3>${escapeHtml(node.props.title)}</h3>` : '';
  if (node.component === 'Table' && Array.isArray(data)) {
    const fields = node.props?.fields ?? node.data?.select ?? Object.keys(data[0] ?? {});
    return `${title}<table><thead><tr>${fields.map((f) => `<th>${escapeHtml(f)}</th>`).join('')}</tr></thead><tbody>${data.map((row) => `<tr>${fields.map((f) => `<td>${renderValue(row[f])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  const record = Array.isArray(data) ? (data[0] ?? {}) : data;
  const fields = node.props?.fields ?? node.data?.select ?? Object.keys(record ?? {});
  return `${title}<dl class="atelier-kv">${fields.map((field) => `<div><dt>${escapeHtml(field.replace(/[_-]+/g, ' '))}</dt><dd>${renderValue(record?.[field])}</dd></div>`).join('')}</dl>`;
}

export function renderNode(node, dataByCapability = {}, options = {}) {
  if (!node) return '';
  const children = (node.children ?? [])
    .map((child) => renderNode(child, dataByCapability, options))
    .join('');
  const data = resolveData(node, dataByCapability);
  if (data)
    return `<div class="atelier-node atelier-${kebab(node.component)}" data-component="${escapeHtml(node.component)}">${renderDataComponent(node, data)}</div>`;
  const props = node.props ?? {};
  switch (node.component) {
    case 'Heading': {
      const level = Math.min(6, Math.max(1, Number(props.level ?? 2)));
      return `<h${level}>${escapeHtml(props.text ?? '')}</h${level}>`;
    }
    case 'Text':
      return `<p class="atelier-text atelier-tone-${escapeHtml(props.tone ?? 'default')}">${escapeHtml(props.text ?? '')}</p>`;
    case 'StatusBadge':
      return `<span class="atelier-badge">${escapeHtml(props.label ?? props.text ?? '')}</span>`;
    case 'Button': {
      const action = node.actions?.[0] ?? '';
      return `<button type="button" class="atelier-button atelier-button-${escapeHtml(props.variant ?? 'default')}" data-atelier-action="${escapeHtml(action)}" data-confirmation="${escapeHtml(node.confirmation ?? 'none')}">${escapeHtml(props.label ?? action)}</button>`;
    }
    case 'Spinner':
      return `<div class="atelier-spinner" role="status" aria-label="${escapeHtml(props.label ?? 'Loading')}">Loading…</div>`;
    case 'EmptyState':
      return `<div class="atelier-state">${escapeHtml(props.title ?? 'No data')}</div>`;
    case 'ErrorState':
      return `<div class="atelier-state" role="alert">${escapeHtml(props.title ?? 'Unable to load')}</div>`;
    case 'Alert':
      return `<div role="alert" class="atelier-alert">${escapeHtml(props.text ?? props.title ?? '')}${children}</div>`;
    case 'ActionBar':
      return `<div class="atelier-action-bar">${children}</div>`;
    case 'Section':
      return `<section class="atelier-section atelier-density-${escapeHtml(props.density ?? 'balanced')}">${children}</section>`;
    case 'Stack':
      return `<div class="atelier-stack">${children}</div>`;
    case 'Grid':
      return `<div class="atelier-grid">${children}</div>`;
    case 'UndoToast':
      return `<div class="atelier-undo" aria-live="polite" hidden>Action completed. <button type="button">Undo</button></div>`;
    default:
      return `<div class="atelier-node atelier-host-component" data-component="${escapeHtml(node.component)}">${props.title ? `<h3>${escapeHtml(props.title)}</h3>` : ''}${children}</div>`;
  }
}

export function renderBundle(bundle, dataByCapability = {}, options = {}) {
  return `<div class="atelier-extension" data-atelier-bundle="${escapeHtml(bundle.bundleId)}" data-atelier-slot="${escapeHtml(bundle.slotId)}">${renderNode(bundle.manifest.root, dataByCapability, options)}</div>`;
}

export const DEFAULT_STYLES = `
.atelier-extension{font:inherit;color:inherit}.atelier-section{display:grid;gap:.75rem;padding:1rem;border:1px solid var(--border,#ddd);border-radius:var(--radius,.75rem);background:var(--surface,#fff)}
.atelier-density-compact{gap:.45rem;padding:.75rem}.atelier-text{margin:0}.atelier-tone-muted{opacity:.7}.atelier-kv{display:grid;gap:.5rem;margin:0}.atelier-kv>div{display:grid;grid-template-columns:minmax(7rem,1fr) 2fr;gap:.75rem;padding:.35rem 0;border-bottom:1px solid var(--border,#eee)}.atelier-kv dt{font-size:.8rem;opacity:.7;text-transform:capitalize}.atelier-kv dd{margin:0}.atelier-action-bar{display:flex;flex-wrap:wrap;gap:.5rem}.atelier-button{font:inherit;padding:.55rem .8rem;border-radius:var(--radius,.55rem);border:1px solid var(--border,#bbb);background:var(--primary,#222);color:var(--primary-contrast,#fff);cursor:pointer}.atelier-button-destructive{background:var(--danger,#a11)}.atelier-state,.atelier-alert{padding:.75rem;border:1px dashed var(--border,#ccc);border-radius:.5rem}.atelier-badge{display:inline-flex;padding:.2rem .45rem;border-radius:999px;background:var(--muted,#eee);font-size:.8rem}.atelier-extension h2,.atelier-extension h3{margin:0}.atelier-extension pre{white-space:pre-wrap;overflow-wrap:anywhere}
`;
