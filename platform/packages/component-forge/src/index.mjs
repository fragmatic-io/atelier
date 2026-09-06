// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  canonicalJson,
  sha256,
  similarity,
  stableId,
  tokenize,
  validateComponentContract,
} from '../../contracts/src/index.mjs';
import { scoreNativeFit } from '../../design-genome/src/index.mjs';

function componentText(component) {
  return [component.id, component.purpose, ...(component.goodFor ?? []), component.layoutRole].join(
    ' ',
  );
}

export class ForgeMemory {
  constructor(records = []) {
    this.records = records.map((record) => structuredClone(record));
  }
  record({ brief, componentId, outcome, notes = null }) {
    const entry = {
      id: stableId('forge-memory', { brief, componentId, outcome, notes }),
      brief: structuredClone(brief),
      componentId,
      outcome,
      notes,
      at: new Date().toISOString(),
    };
    this.records.push(entry);
    return entry;
  }
  accepted(brief, componentId, notes) {
    return this.record({ brief, componentId, outcome: 'accepted', notes });
  }
  rejected(brief, componentId, notes) {
    return this.record({ brief, componentId, outcome: 'rejected', notes });
  }
  adjustment(brief, componentId) {
    const target = `${brief.goal ?? ''} ${(brief.requiredInformation ?? []).join(' ')}`;
    let adjustment = 0;
    for (const record of this.records.filter((x) => x.componentId === componentId)) {
      const relevance = similarity(
        target,
        `${record.brief?.goal ?? ''} ${(record.brief?.requiredInformation ?? []).join(' ')}`,
      );
      adjustment += relevance * (record.outcome === 'accepted' ? 0.15 : -0.2);
    }
    return Math.max(-0.35, Math.min(0.35, adjustment));
  }
  export() {
    return this.records.map((record) => structuredClone(record));
  }
}

export class ComponentForge {
  constructor({
    reuseThreshold = 0.22,
    compositionThreshold = 0.12,
    maxNewComponentsPerBrief = 1,
    memory = new ForgeMemory(),
  } = {}) {
    this.reuseThreshold = reuseThreshold;
    this.compositionThreshold = compositionThreshold;
    this.maxNewComponentsPerBrief = maxNewComponentsPerBrief;
    this.memory = memory;
  }

  findReusable(brief, projectModel) {
    const target = `${brief.goal ?? ''} ${(brief.requiredInformation ?? []).join(' ')} ${(brief.candidateActions ?? []).join(' ')}`;
    const ranked = (projectModel.components ?? [])
      .map((component) => ({
        component,
        score: Math.max(
          0,
          similarity(target, componentText(component)) +
            this.memory.adjustment(brief, component.id),
        ),
      }))
      .sort((a, b) => b.score - a.score || a.component.id.localeCompare(b.component.id));
    if (ranked[0]?.score >= this.reuseThreshold) {
      return {
        kind: 'reuse',
        componentIds: [ranked[0].component.id],
        score: ranked[0].score,
        alternatives: ranked.slice(1, 4),
      };
    }
    const composable = ranked.filter((x) => x.score >= this.compositionThreshold).slice(0, 3);
    if (composable.length >= 2) {
      return {
        kind: 'compose',
        componentIds: composable.map((x) => x.component.id),
        score: composable.reduce((s, x) => s + x.score, 0) / composable.length,
      };
    }
    return {
      kind: 'forge',
      componentIds: [],
      score: ranked[0]?.score ?? 0,
      noveltyReason: 'No existing component or composition meets semantic compatibility threshold.',
    };
  }

  noveltyGate(brief, projectModel) {
    const decision = this.findReusable(brief, projectModel);
    return {
      allowed: decision.kind === 'forge',
      decision,
      budget: this.maxNewComponentsPerBrief,
    };
  }

  generate(brief, projectModel, genome, options = {}) {
    const gate = this.noveltyGate(brief, projectModel);
    if (!gate.allowed && !options.force)
      return { kind: gate.decision.kind, reused: gate.decision.componentIds, noveltyGate: gate };
    const id = options.name ?? inferComponentName(brief.goal);
    const fields = (brief.requiredInformation ?? []).slice(0, 8);
    const actions = (brief.candidateActions ?? [])
      .filter((id) => projectModel.capabilities.some((c) => c.id === id))
      .slice(0, 4);
    const availableTokens = Object.keys(genome?.hardTokens?.all ?? {});
    const token = (needle, fallback) => availableTokens.find((x) => x.includes(needle)) ?? fallback;
    const tokensUsed = [
      token('surface', 'surface'),
      token('text', 'text'),
      token('space', 'spacing-md'),
      token('radius', 'radius-md'),
    ];
    const source = generateTsx({ id, fields, actions, genome });
    const story = generateStory({ id, fields });
    const test = generateTest({ id });
    const contract = validateComponentContract({
      id,
      framework: 'react',
      sourcePath: `src/atelier-generated/${id}.tsx`,
      exportName: id,
      chunkId: stableId('chunk', { project: projectModel.projectVersion, id }),
      contentHash: sha256(source),
      purpose: brief.goal,
      goodFor: [...new Set(tokenize(brief.goal))],
      avoidFor: ['unrelated workflows', 'unregistered capabilities'],
      propsSchema: {
        type: 'object',
        properties: {
          data: { type: 'object', additionalProperties: true },
          onAction: { type: 'function' },
          state: { type: 'string', enum: ['ready', 'loading', 'empty', 'error'] },
        },
        required: ['data'],
        additionalProperties: false,
      },
      slots: [],
      events: actions.map((action) => ({ name: 'action', capabilityId: action })),
      acceptedDataShapes: [
        {
          type: 'object',
          properties: Object.fromEntries(fields.map((field) => [field.split('.').at(-1), {}])),
        },
      ],
      allowedCapabilityKinds: ['query', 'command'],
      layoutRole: 'workflow',
      states: { loading: true, empty: true, error: true, disabled: true, readonly: true },
      responsiveBehavior: { strategy: 'stack-below-640', breakpoints: ['sm'] },
      accessibilityContract: {
        keyboard: true,
        semanticRegions: ['section', 'heading', 'button'],
        liveRegions: ['status'],
      },
      tokensUsed,
      visualExamples: [`src/atelier-generated/${id}.stories.tsx`],
      provenance: {
        generatedBy: 'ComponentForge',
        projectVersion: projectModel.projectVersion,
        genomeVersion: genome?.genomeVersion,
        briefHash: sha256(brief),
      },
    });
    const fit = genome ? scoreNativeFit({ component: contract, genome }) : { total: 0.7 };
    return {
      kind: 'forged',
      contract,
      files: {
        [`src/atelier-generated/${id}.tsx`]: source,
        [`src/atelier-generated/${id}.stories.tsx`]: story,
        [`src/atelier-generated/${id}.test.tsx`]: test,
        [`src/atelier-generated/${id}.contract.json`]: `${JSON.stringify(contract, null, 2)}\n`,
      },
      nativeFit: fit,
      noveltyGate: gate,
      artifactHash: sha256({ contract, source, story, test }),
    };
  }

  async write(projectRoot, result) {
    if (result.kind !== 'forged') return [];
    const written = [];
    for (const [rel, content] of Object.entries(result.files)) {
      const file = join(projectRoot, rel);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content, 'utf8');
      written.push(file);
    }
    return written;
  }
}

function inferComponentName(goal = 'AdaptivePanel') {
  const words = tokenize(goal)
    .filter((x) => !['a', 'an', 'the', 'and', 'to', 'for', 'of', 'in'].includes(x))
    .slice(0, 4);
  const value = words.map((word) => word[0].toUpperCase() + word.slice(1)).join('');
  return `${value || 'Adaptive'}Panel`;
}

function fieldLabel(field) {
  return field
    .split('.')
    .at(-1)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (x) => x.toUpperCase());
}

function generateTsx({ id, fields, actions, genome }) {
  const surface = genome?.grammar?.surfaceTreatment ?? 'mixed';
  return `import React from 'react';\n\nexport interface ${id}Props {\n  data: Record<string, unknown>;\n  state?: 'ready' | 'loading' | 'empty' | 'error';\n  error?: string;\n  disabled?: boolean;\n  onAction?: (capabilityId: string, data: Record<string, unknown>) => void | Promise<void>;\n}\n\nconst FIELDS = ${JSON.stringify(
    fields.map((field) => ({ key: field.split('.').at(-1), label: fieldLabel(field) })),
    null,
    2,
  )} as const;\nconst ACTIONS = ${JSON.stringify(actions, null, 2)} as const;\n\n/** Generated against host design grammar: ${surface}. */\nexport function ${id}({ data, state = 'ready', error, disabled = false, onAction }: ${id}Props) {\n  if (state === 'loading') return <section aria-busy=\"true\" aria-label=\"Loading\"><div className=\"host-skeleton\" /></section>;\n  if (state === 'error') return <section role=\"alert\" className=\"host-error\">{error ?? 'This panel could not be loaded.'}</section>;\n  if (state === 'empty') return <section className=\"host-empty\"><p>No relevant information is available.</p></section>;\n  return (\n    <section className=\"host-panel host-panel--atelier\" data-atelier-component=\"${id}\">\n      <header className=\"host-section-header\"><h2>${fieldLabel(id.replace(/Panel$/, ''))}</h2></header>\n      <dl className=\"host-key-value-list\">\n        {FIELDS.map(({ key, label }) => <React.Fragment key={key}><dt>{label}</dt><dd>{String(data[key] ?? '—')}</dd></React.Fragment>)}\n      </dl>\n      {ACTIONS.length > 0 && <div className=\"host-action-cluster\">\n        {ACTIONS.map((action) => <button key={action} type=\"button\" disabled={disabled} onClick={() => onAction?.(action, data)}>{action.split('.').at(-1)?.replace(/_/g, ' ')}</button>)}\n      </div>}\n    </section>\n  );\n}\n`;
}

function generateStory({ id, fields }) {
  const data = Object.fromEntries(
    fields.map((field) => [field.split('.').at(-1), `Example ${field.split('.').at(-1)}`]),
  );
  return `import type { Meta, StoryObj } from '@storybook/react';\nimport { ${id} } from './${id}';\n\nconst meta = { component: ${id}, args: { data: ${JSON.stringify(data, null, 2)} } } satisfies Meta<typeof ${id}>;\nexport default meta;\ntype Story = StoryObj<typeof meta>;\nexport const Ready: Story = {};\nexport const Loading: Story = { args: { state: 'loading' } };\nexport const Empty: Story = { args: { state: 'empty' } };\nexport const Error: Story = { args: { state: 'error', error: 'Example failure' } };\n`;
}

function generateTest({ id }) {
  return `import { render, screen } from '@testing-library/react';\nimport { ${id} } from './${id}';\n\nit('renders all runtime states', () => {\n  const { rerender } = render(<${id} data={{}} state=\"loading\" />);\n  expect(screen.getByLabelText('Loading')).toBeTruthy();\n  rerender(<${id} data={{}} state=\"empty\" />);\n  expect(screen.getByText(/No relevant information/)).toBeTruthy();\n  rerender(<${id} data={{}} state=\"error\" />);\n  expect(screen.getByRole('alert')).toBeTruthy();\n});\n`;
}

export function componentArtifactSummary(result) {
  return result.kind === 'forged'
    ? {
        kind: result.kind,
        id: result.contract.id,
        files: Object.keys(result.files),
        hash: result.artifactHash,
        nativeFit: result.nativeFit.total,
      }
    : { kind: result.kind, reused: result.reused ?? result.componentIds ?? [] };
}
