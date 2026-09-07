// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { sha256, stableId, tokenize } from '../../contracts/src/index.mjs';

function mostCommon(entries, fallback = null) {
  if (!entries.length) return fallback;
  const count = new Map();
  for (const entry of entries) count.set(entry, (count.get(entry) ?? 0) + 1);
  return [...count.entries()].sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
  )[0][0];
}

function classifyColor(name, value) {
  const n = name.toLowerCase();
  if (/primary|brand|accent/.test(n)) return 'brand';
  if (/danger|error|destructive/.test(n)) return 'danger';
  if (/success|positive/.test(n)) return 'success';
  if (/warning|caution/.test(n)) return 'warning';
  if (/background|surface|panel/.test(n)) return 'surface';
  if (/text|foreground|ink/.test(n)) return 'text';
  return /^#(?:fff|ffffff|000|000000)$/i.test(value) ? 'neutral' : 'other';
}

export function buildDesignGenome(scan, { projectId = scan.projectId ?? 'project' } = {}) {
  const tokens = scan.designTokens ?? [];
  const classSignals = scan.classSignals ?? [];
  const componentSignals = scan.componentSignals ?? [];
  const tokenMap = Object.fromEntries(tokens.map((token) => [token.name, token.value]));
  const colors = tokens
    .filter((x) => x.kind === 'color')
    .map((x) => ({ ...x, role: classifyColor(x.name, x.value) }));
  const spacings = tokens.filter((x) => x.kind === 'spacing');
  const radii = tokens.filter((x) => x.kind === 'radius');
  const shadows = tokens.filter((x) => x.kind === 'shadow');

  const utilityText = classSignals.flatMap((x) => x.classes ?? []);
  const cardCount = utilityText.filter((x) => /shadow|rounded|border/.test(x)).length;
  const dividerCount = utilityText.filter((x) => /divide-|border-b|border-t/.test(x)).length;
  const compactCount = utilityText.filter((x) => /(?:^|-)p[xy]?-[12]$|gap-[12]/.test(x)).length;
  const spaciousCount = utilityText.filter((x) => /(?:^|-)p[xy]?-[678]$|gap-[678]/.test(x)).length;

  const grammar = {
    density:
      compactCount > spaciousCount * 1.3
        ? 'compact'
        : spaciousCount > compactCount * 1.3
          ? 'spacious'
          : 'balanced',
    surfaceTreatment:
      cardCount > dividerCount * 1.4
        ? 'carded'
        : dividerCount > cardCount * 1.4
          ? 'borderless-divided'
          : 'mixed',
    preferredRadius: mostCommon(
      radii.map((x) => x.value),
      '0.5rem',
    ),
    preferredSpacing: mostCommon(
      spacings.map((x) => x.value),
      '0.75rem',
    ),
    preferredShadow: mostCommon(
      shadows.map((x) => x.value),
      'none',
    ),
    actionPlacement: componentSignals.some((x) => /toolbar|actionbar|command/i.test(x.id))
      ? 'clustered-toolbar'
      : 'contextual',
    statusTreatment: componentSignals.some((x) => /badge|status|chip/i.test(x.id))
      ? 'badge'
      : 'text',
    collectionPreference: componentSignals.some((x) => /table/i.test(x.id))
      ? 'table'
      : componentSignals.some((x) => /grid/i.test(x.id))
        ? 'grid'
        : 'list',
  };

  const rules = [
    {
      id: 'token-only-color',
      severity: 'error',
      text: 'Generated UI must reference semantic color tokens, never raw colors.',
    },
    {
      id: 'host-density',
      severity: 'warning',
      text: `Default to ${grammar.density} information density.`,
    },
    {
      id: 'host-surfaces',
      severity: 'warning',
      text: `Prefer ${grammar.surfaceTreatment} surface treatment.`,
    },
    {
      id: 'state-completeness',
      severity: 'error',
      text: 'Every data-bound region requires loading, empty and error states.',
    },
    {
      id: 'host-action-placement',
      severity: 'warning',
      text: `Use ${grammar.actionPlacement} action placement.`,
    },
  ];

  const body = {
    schemaVersion: 2,
    projectId,
    hardTokens: { all: tokenMap, colors, spacings, radii, shadows },
    grammar,
    rules,
    references: (scan.referenceScreens ?? []).map((x) => ({ id: stableId('screen', x), ...x })),
    componentFamilies: inferComponentFamilies(componentSignals),
    sourceHashes: [...new Set(tokens.map((x) => x.sourceHash).filter(Boolean))],
  };
  return {
    ...body,
    genomeVersion: sha256(body).slice(0, 20),
  };
}

export function inferComponentFamilies(components) {
  const families = new Map();
  for (const component of components) {
    const words = tokenize(`${component.id} ${component.purpose ?? ''}`);
    const family =
      [
        'table',
        'list',
        'grid',
        'form',
        'dialog',
        'button',
        'navigation',
        'card',
        'detail',
        'queue',
      ].find((x) => words.includes(x)) ?? 'other';
    const list = families.get(family) ?? [];
    list.push(component.id);
    families.set(family, list);
  }
  return [...families.entries()].map(([id, members]) => ({ id, members: members.sort() }));
}

export function scoreNativeFit({ component, genome }) {
  const used = new Set(component.tokensUsed ?? []);
  const available = new Set(Object.keys(genome.hardTokens.all ?? {}));
  const tokenScore = used.size ? [...used].filter((x) => available.has(x)).length / used.size : 1;
  const hasStates = ['loading', 'empty', 'error'].every((state) => component.states?.[state]);
  const roleFit = component.layoutRole !== 'unknown';
  return {
    tokenScore,
    stateScore: hasStates ? 1 : 0,
    roleScore: roleFit ? 1 : 0.5,
    total: Number(
      (tokenScore * 0.5 + (hasStates ? 1 : 0) * 0.3 + (roleFit ? 1 : 0.5) * 0.2).toFixed(3),
    ),
  };
}
