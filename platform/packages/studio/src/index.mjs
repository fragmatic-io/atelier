// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { modelSummary, searchProjectModel } from '../../project-model/src/index.mjs';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function badge(text, tone = '') {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}
function section(title, body, id = '') {
  return `<section ${id ? `id="${esc(id)}"` : ''}><h2>${esc(title)}</h2>${body}</section>`;
}

function capabilityRows(model) {
  return model.capabilities
    .map(
      (cap) =>
        `<tr><td><code>${esc(cap.id)}</code></td><td>${badge(cap.kind)}</td><td>${badge(cap.risk, cap.risk)}</td><td>${badge(cap.verification ?? 'inferred')}</td><td>${esc(cap.requiredPermissions.join(', ') || '—')}</td><td>${esc(cap.operation?.method ?? cap.operation?.operationType ?? '')} ${esc(cap.operation?.path ?? cap.operation?.field ?? '')}</td></tr>`,
    )
    .join('');
}

function componentCards(model) {
  return model.components
    .map(
      (component) =>
        `<article class="card"><h3>${esc(component.id)}</h3><p>${esc(component.purpose)}</p><p>${badge(component.layoutRole)} ${badge(`${Math.round((component.confidence ?? 0) * 100)}%`)}</p><small>${esc(component.sourcePath)}</small></article>`,
    )
    .join('');
}

function opportunityCards(opportunities) {
  if (!opportunities?.length)
    return '<p>No opportunity crossed the configured evidence threshold.</p>';
  return opportunities
    .map(
      (item) =>
        `<article class="card"><h3>${esc(item.proposedGoal)}</h3><p>${esc(item.observedWorkflow)}</p><p>${badge(`${Math.round(item.confidence * 100)}% confidence`)} ${badge(`${item.frictionEvidence.sessionCount} sessions`)}</p><p>Suggested slots: ${esc(item.candidateInsertionPoints.join(', ') || 'new additive route')}</p></article>`,
    )
    .join('');
}

export function renderStudio({ model, opportunities = [], bundles = [], evaluations = [] }) {
  const summary = modelSummary(model);
  const unverified = model.capabilities.filter((x) => x.verification !== 'verified');
  const design = model.designGenome;
  const nav = ['overview', 'capabilities', 'design', 'components', 'opportunities', 'bundles']
    .map((id) => `<a href="#${id}">${id}</a>`)
    .join('');
  const body = `
  <header><div><p class="eyebrow">ATELIER V2 STUDIO</p><h1>${esc(model.projectId)}</h1><p>Project version <code>${esc(model.projectVersion)}</code></p></div><nav>${nav}</nav></header>
  <main>
    ${section(
      'Project map',
      `<div class="metrics">${Object.entries(summary)
        .filter(([k]) => !['projectId', 'projectVersion'].includes(k))
        .map(([k, v]) => `<div><strong>${esc(v)}</strong><span>${esc(k)}</span></div>`)
        .join('')}</div><p>Adapters: ${esc(model.adapters.join(', '))}</p>`,
      'overview',
    )}
    ${section('Capability review', `<p>${unverified.length} capabilities require developer review.</p><div class="table"><table><thead><tr><th>ID</th><th>Kind</th><th>Risk</th><th>Evidence</th><th>Permissions</th><th>Operation</th></tr></thead><tbody>${capabilityRows(model)}</tbody></table></div>`, 'capabilities')}
    ${section('Design genome', `<div class="metrics"><div><strong>${esc(design?.grammar?.density)}</strong><span>density</span></div><div><strong>${esc(design?.grammar?.surfaceTreatment)}</strong><span>surfaces</span></div><div><strong>${esc(Object.keys(design?.hardTokens?.all ?? {}).length)}</strong><span>tokens</span></div><div><strong>${esc(design?.componentFamilies?.length ?? 0)}</strong><span>families</span></div></div><ul>${(design?.rules ?? []).map((rule) => `<li>${badge(rule.severity)} ${esc(rule.text)}</li>`).join('')}</ul>`, 'design')}
    ${section('Project kit', `<div class="cards">${componentCards(model)}</div>`, 'components')}
    ${section('Workflow opportunities', `<div class="cards">${opportunityCards(opportunities)}</div>`, 'opportunities')}
    ${section(
      'Published experiences',
      `<div class="cards">${
        bundles
          .map((bundle) => {
            const evaluation = evaluations.find((x) => x.bundleId === bundle.bundleId);
            return `<article class="card"><h3>${esc(bundle.taskSpec?.goal)}</h3><p><code>${esc(bundle.slotId)}</code></p><p>${badge(evaluation?.approved ? 'approved' : 'not approved', evaluation?.approved ? 'verified' : 'destructive')} ${badge(evaluation ? `${Math.round(evaluation.score * 100)}%` : 'not evaluated')}</p></article>`;
          })
          .join('') || '<p>No bundles published.</p>'
      }</div>`,
      'bundles',
    )}
  </main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atelier Studio · ${esc(model.projectId)}</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#171717;background:#f6f6f3}*{box-sizing:border-box}body{margin:0}header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:2rem;align-items:end;padding:1.5rem max(1.5rem,calc((100vw - 1200px)/2));background:rgba(246,246,243,.94);backdrop-filter:blur(16px);border-bottom:1px solid #ddd}h1{margin:.1rem 0;font-size:2rem}.eyebrow{font-size:.7rem;letter-spacing:.2em;margin:0;color:#555}nav{display:flex;flex-wrap:wrap;gap:.8rem}nav a{color:inherit;text-decoration:none;font-size:.85rem}main{max-width:1200px;margin:auto;padding:2rem 1.5rem 5rem}section{padding:2rem 0;border-bottom:1px solid #ddd}section h2{font-size:1.3rem}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem}.metrics>div,.card{background:#fff;border:1px solid #ddd;border-radius:14px;padding:1rem}.metrics strong{display:block;font-size:1.7rem}.metrics span{display:block;font-size:.75rem;color:#666;margin-top:.2rem}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.8rem}.card h3{margin-top:0}.badge{display:inline-block;padding:.17rem .45rem;border-radius:999px;background:#e9e9e5;font-size:.72rem}.badge.destructive{background:#fee2e2;color:#991b1b}.badge.sensitive{background:#fef3c7;color:#92400e}.badge.read_only,.badge.verified{background:#dcfce7;color:#166534}.table{overflow:auto}table{width:100%;border-collapse:collapse;background:#fff}th,td{text-align:left;padding:.65rem;border-bottom:1px solid #eee;font-size:.8rem;vertical-align:top}code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.85em}ul{padding-left:1.2rem}li{margin:.4rem 0}
  </style></head><body>${body}</body></html>`;
}

export async function writeStudio(outputDir, input) {
  await mkdir(outputDir, { recursive: true });
  const html = renderStudio(input);
  await writeFile(join(outputDir, 'index.html'), html, 'utf8');
  await writeFile(
    join(outputDir, 'studio-data.json'),
    `${JSON.stringify(input, null, 2)}\n`,
    'utf8',
  );
  return { html: join(outputDir, 'index.html'), data: join(outputDir, 'studio-data.json') };
}
