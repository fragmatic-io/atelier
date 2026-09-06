import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AtelierError,
  canonicalJson,
  evidence,
  inferRisk,
  isPiiField,
  sha256,
  stableId,
  validateSlotContract,
} from '../packages/contracts/src/index.mjs';
import {
  parseGraphql,
  parseOpenApi,
  scanProject,
  summarizeRuntimeObservations,
} from '../packages/scanner/src/index.mjs';
import {
  buildProjectModel,
  modelSummary,
  searchProjectModel,
} from '../packages/project-model/src/index.mjs';
import { buildDesignGenome, scoreNativeFit } from '../packages/design-genome/src/index.mjs';
import { FIXTURE, buildFixtureModel } from './helpers.mjs';

test('canonical JSON and content IDs are deterministic', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));
  assert.match(stableId('x', { a: 1 }), /^x_[0-9a-f]{20}$/);
});

test('evidence and slot contracts reject invalid authority data', () => {
  assert.throws(() => evidence({ source: 'x', confidence: 2 }), AtelierError);
  assert.throws(
    () =>
      validateSlotContract({
        id: 'x',
        mode: 'wild',
        allowedCapabilityGroups: [],
        maxAdaptationLevel: 0,
      }),
    /Unsupported slot mode/,
  );
  assert.equal(inferRisk('customer.delete', 'DELETE'), 'destructive');
  assert.equal(isPiiField('billing_email'), true);
  assert.equal(isPiiField('riskScore'), false);
});

test('OpenAPI importer creates typed capabilities, entities, permissions, PII and action risk', async () => {
  const content = await readFile(join(FIXTURE, 'openapi.json'), 'utf8');
  const parsed = parseOpenApi(JSON.parse(content), { sourcePath: 'openapi.json', content });
  const get = parsed.capabilities.find((x) => x.id === 'customer.get');
  const create = parsed.capabilities.find((x) => x.id === 'intervention.create');
  const archive = parsed.capabilities.find((x) => x.id === 'customer.archive');
  assert.equal(get.kind, 'query');
  assert.deepEqual(get.requiredPermissions, ['customer.read']);
  assert.ok(get.piiFields.includes('email'));
  assert.deepEqual(create.inputSchema.required.sort(), ['customerId', 'kind', 'reason']);
  assert.equal(create.confirmation, 'modal');
  assert.equal(archive.risk, 'destructive');
  assert.ok(parsed.entities.some((x) => x.id === 'Customer'));
});

test('GraphQL parser handles multiline arguments and trailing directives', async () => {
  const sdl = await readFile(join(FIXTURE, 'schema.graphql'), 'utf8');
  const parsed = parseGraphql(sdl, { sourcePath: 'schema.graphql' });
  const query = parsed.capabilities.find((x) => x.id === 'graphql.query.customer');
  const mutation = parsed.capabilities.find((x) => x.id === 'graphql.mutation.setCustomerPriority');
  assert.ok(query);
  assert.deepEqual(query.inputSchema.required, ['id']);
  assert.ok(query.inputSchema.properties.includeHistory);
  assert.ok(mutation);
  assert.deepEqual(mutation.inputSchema.required.sort(), ['customerId', 'priority']);
  assert.ok(
    parsed.entities.find((x) => x.id === 'Customer').fields.some((x) => x.name === 'riskScore'),
  );
});

test('scanner inventories routes, host components, slots, APIs, tokens and observations', async () => {
  const scan = await scanProject(FIXTURE, { typescript: false, strict: true });
  assert.ok(scan.routes.some((x) => x.path === '/customers/:customerId'));
  assert.ok(scan.components.some((x) => x.id === 'CustomerSummaryCard'));
  assert.ok(scan.slots.some((x) => x.id === 'customer.detail.right-rail'));
  assert.ok(scan.capabilities.some((x) => x.id === 'customer.get'));
  assert.ok(scan.capabilities.some((x) => x.id === 'graphql.query.customer'));
  assert.ok(scan.designTokens.some((x) => x.name === 'color-primary'));
  assert.ok(scan.observations.some((x) => x.capabilityId === 'customer.get'));
  assert.equal(scan.observations[0].valuesCaptured, false);
  assert.ok(scan.sourceSummary.filesScanned > 5);
});

test('runtime observation summaries retain aggregate shape but not values', () => {
  const out = summarizeRuntimeObservations([
    {
      capabilityId: 'x.get',
      durationMs: 10,
      status: 200,
      responseFields: ['id', 'email'],
      rawValue: 'secret',
    },
    { capabilityId: 'x.get', durationMs: 30, status: 500, responseFields: ['id'] },
  ]);
  assert.equal(out[0].sampleCount, 2);
  assert.equal(out[0].latencyMs.average, 20);
  assert.equal(out[0].valuesCaptured, false);
  assert.equal(JSON.stringify(out).includes('secret'), false);
});

test('project model applies developer-authoritative overrides and builds graph edges', async () => {
  const { model } = await buildFixtureModel();
  const archive = model.capabilities.find((x) => x.id === 'customer.archive');
  assert.equal(archive.verification, 'verified');
  assert.equal(archive.confidence, 1);
  assert.deepEqual(archive.requiredPermissions, ['customer.archive']);
  assert.ok(archive.evidence.some((x) => x.source === 'developer_override'));
  assert.ok(model.capabilityGraph.nodes.some((x) => x.id === 'customer.get'));
  assert.ok(model.projectVersion.length === 20);
  const summary = modelSummary(model);
  assert.ok(summary.capabilities >= 5);
  assert.ok(summary.components >= 3);
});

test('project knowledge index searches across APIs, entities, components and slots', async () => {
  const { model } = await buildFixtureModel();
  const customer = searchProjectModel(model, 'customer risk');
  assert.ok(customer.some((x) => ['capability', 'entity', 'component', 'slot'].includes(x.kind)));
  const slot = searchProjectModel(model, 'right rail', { kinds: ['slot'] });
  assert.equal(slot[0].ref, 'customer.detail.right-rail');
});

test('Design Genome derives hard tokens and host visual grammar', async () => {
  const scan = await scanProject(FIXTURE, { typescript: false });
  const genome = buildDesignGenome(scan);
  assert.ok(Object.keys(genome.hardTokens.all).length >= 10);
  assert.ok(['compact', 'balanced', 'spacious'].includes(genome.grammar.density));
  assert.ok(['carded', 'borderless-divided', 'mixed'].includes(genome.grammar.surfaceTreatment));
  assert.ok(genome.rules.some((x) => x.id === 'state-completeness'));
  const component = scan.components[0];
  const fit = scoreNativeFit({ component, genome });
  assert.ok(fit.total >= 0 && fit.total <= 1);
});

test('scanner discovers Prisma, Zod, tRPC and W3C design-token evidence', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'atelier-scanner-adapters-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'schema.prisma'),
    `model Account {\n id String @id\n billing_email String\n status String\n}\n`,
  );
  await writeFile(
    join(dir, 'src/router.ts'),
    `import { z } from 'zod';\nexport const AccountSchema = z.object({ id: z.string(), status: z.string() });\nexport const router = t.router({ account: protectedProcedure.input(AccountSchema).query(() => ({})), archiveAccount: protectedProcedure.mutation(() => ({})) });\n`,
  );
  await writeFile(
    join(dir, 'design.tokens.json'),
    JSON.stringify({
      color: { primary: { $value: '#222222', $type: 'color' } },
      radius: { md: { $value: '8px', $type: 'dimension' } },
    }),
  );
  const scan = await scanProject(dir, { typescript: false });
  assert.ok(scan.entities.some((x) => x.id === 'Account'));
  assert.ok(scan.capabilities.some((x) => x.id === 'trpc.account'));
  assert.ok(scan.designTokens.some((x) => x.name === 'color-primary'));
  assert.ok(scan.adapters.includes('prisma-schema'));
  assert.ok(scan.adapters.includes('w3c-design-tokens'));
});
