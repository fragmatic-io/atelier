import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './v21/helpers.mjs';
import { DiscoveryService } from '../packages/discovery/src/service.mjs';

async function importedFixture(t) {
  const f = await fixture();
  t.after(() => f.db.close());
  const discovery = new DiscoveryService(f.service);
  await discovery.importSpec(f.who, f.tenant.id, f.project.id, {
    sourceName: 'sitewatch.openapi.json',
    document: {
      openapi: '3.1.0',
      info: { title: 'SiteWatch', version: '1' },
      paths: {
        '/analytics/summary': {
          get: {
            operationId: 'analytics.summary',
            summary: 'Read analytics summary',
            responses: { 200: { description: 'ok' } },
          },
        },
        '/analytics/by-site': {
          get: {
            operationId: 'analytics.by-site',
            summary: 'Read analytics by site',
            responses: { 200: { description: 'ok' } },
          },
        },
        '/findings/{findingId}/review': {
          post: {
            operationId: 'findings.review',
            summary: 'Review a finding',
            parameters: [
              {
                name: 'findingId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: { 200: { description: 'reviewed' } },
          },
        },
      },
    },
  });
  return f;
}

test('bulk review atomically approves the exact model without enabling agent access', async (t) => {
  const f = await importedFixture(t);
  const before = f.service.model(f.who, f.tenant.id, f.project.id);
  const ids = before.capabilities.map((capability) => capability.id);
  const result = f.service.bulkReviewCapabilities(f.who, f.tenant.id, f.project.id, {
    projectVersion: before.projectVersion,
    capabilityIds: ids,
    approved: true,
    agentEnabled: false,
  });
  assert.equal(result.reviewed, 3);
  assert.equal(result.agentAccessChanged, false);
  const after = f.service.model(f.who, f.tenant.id, f.project.id);
  assert(after.capabilities.every((capability) => capability.securityReviewed));
  assert(after.capabilities.every((capability) => capability.agentEnabled === false));
  const command = after.capabilities.find((capability) => capability.kind === 'command');
  assert.equal(command.reversible, false);
  assert.equal(command.confirmation, 'inline');
  assert.notEqual(after.projectVersion, before.projectVersion);
});

test('bulk review rejects stale or invalid selections without partial approval', async (t) => {
  const f = await importedFixture(t);
  const before = f.service.model(f.who, f.tenant.id, f.project.id);
  assert.throws(
    () =>
      f.service.bulkReviewCapabilities(f.who, f.tenant.id, f.project.id, {
        projectVersion: 'stale-version',
        capabilityIds: [before.capabilities[0].id],
        approved: true,
      }),
    { code: 'MODEL_VERSION_CHANGED' },
  );
  assert.throws(
    () =>
      f.service.bulkReviewCapabilities(f.who, f.tenant.id, f.project.id, {
        projectVersion: before.projectVersion,
        capabilityIds: [before.capabilities[0].id, 'missing.capability'],
        approved: true,
      }),
    { code: 'NOT_FOUND' },
  );
  const after = f.service.model(f.who, f.tenant.id, f.project.id);
  assert(after.capabilities.every((capability) => capability.securityReviewed === false));
  assert.equal(after.projectVersion, before.projectVersion);
});

test('bulk agent access is a separate exact-version gate for reviewed capabilities', async (t) => {
  const f = await importedFixture(t);
  let model = f.service.model(f.who, f.tenant.id, f.project.id);
  const ids = model.capabilities.map((capability) => capability.id);
  assert.throws(
    () =>
      f.service.bulkSetCapabilityAgentAccess(f.who, f.tenant.id, f.project.id, {
        projectVersion: model.projectVersion,
        capabilityIds: ids,
        enabled: true,
      }),
    { code: 'AGENT_REQUIRES_APPROVAL' },
  );
  f.service.bulkReviewCapabilities(f.who, f.tenant.id, f.project.id, {
    projectVersion: model.projectVersion,
    capabilityIds: ids,
    approved: true,
  });
  model = f.service.model(f.who, f.tenant.id, f.project.id);
  const enabled = f.service.bulkSetCapabilityAgentAccess(f.who, f.tenant.id, f.project.id, {
    projectVersion: model.projectVersion,
    capabilityIds: ids,
    enabled: true,
  });
  assert.equal(enabled.updated, 3);
  assert(
    f.service
      .model(f.who, f.tenant.id, f.project.id)
      .capabilities.every((capability) => capability.agentEnabled),
  );
});

test('bulk reopen returns reviewed capabilities to pending and disables agents without erasing audit', async (t) => {
  const f = await importedFixture(t);
  let model = f.service.model(f.who, f.tenant.id, f.project.id);
  const ids = model.capabilities.map((capability) => capability.id);
  f.service.bulkReviewCapabilities(f.who, f.tenant.id, f.project.id, {
    projectVersion: model.projectVersion,
    capabilityIds: ids,
    approved: true,
  });
  model = f.service.model(f.who, f.tenant.id, f.project.id);
  f.service.bulkSetCapabilityAgentAccess(f.who, f.tenant.id, f.project.id, {
    projectVersion: model.projectVersion,
    capabilityIds: ids,
    enabled: true,
  });
  model = f.service.model(f.who, f.tenant.id, f.project.id);
  const result = f.service.bulkReopenCapabilityReviews(f.who, f.tenant.id, f.project.id, {
    projectVersion: model.projectVersion,
    capabilityIds: ids,
  });
  assert.equal(result.reopened, 3);
  const after = f.service.model(f.who, f.tenant.id, f.project.id);
  assert(
    after.capabilities.every(
      (capability) =>
        capability.securityReviewed === false &&
        capability.reviewDecision === 'pending' &&
        capability.agentEnabled === false &&
        capability.reviewedBy === undefined,
    ),
  );
  const actions = f.service
    .audit(f.who, f.tenant.id, f.project.id)
    .map((event) => event.action);
  assert(actions.includes('capability.reviewed'));
  assert(actions.includes('capability.review_reopened'));
  assert(actions.includes('capability.bulk_review_reopened'));
});
