import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BundleRegistry,
  BundleResolver,
  CapabilityDispatcher,
  LruCache,
  MemoryAuditSink,
  TriggerBus,
  applyBoundedRuntimePatch,
  assertBundleContextCompatible,
  generateSigningKeyPair,
  normalizeContext,
  projectFields,
  signBundle,
  structuralCacheKey,
  verifySignedBundle,
  wireStructuralInvalidation,
} from '../packages/runtime/src/index.mjs';
import { renderBundle } from '../packages/adapters/dom/src/index.mjs';
import { compileAdditiveExperience } from '../packages/experience-compiler/src/index.mjs';
import { buildFixtureModel } from './helpers.mjs';

async function signedFixture() {
  const { model } = await buildFixtureModel();
  const context = {
    projectId: model.projectId,
    projectVersion: model.projectVersion,
    slotId: 'customer.detail.right-rail',
    role: 'support_manager',
    permissions: ['customer.read', 'customer.intervene', 'customer.archive'],
    taskCluster: 'review',
    entity: { type: 'Customer', id: 'c1' },
    locale: 'en',
    density: 'compact',
  };
  const compiled = compileAdditiveExperience({
    actor: context.role,
    context,
    goal: 'Review customer risk and intervene',
    projectModel: model,
    slotId: context.slotId,
    contextClass: {
      role: context.role,
      taskCluster: context.taskCluster,
      entityType: 'Customer',
      locale: 'en',
      density: 'compact',
    },
  });
  const keys = generateSigningKeyPair({ keyId: 'test-key' });
  const signed = signBundle(compiled.bundle, keys);
  return { model, context, compiled, keys, signed };
}

test('Ed25519 bundle signing verifies canonical content', async () => {
  const { keys, signed } = await signedFixture();
  assert.equal(verifySignedBundle(signed, { [keys.keyId]: keys.publicKey }), true);
  assert.equal(signed.signature.algorithm, 'Ed25519');
  assert.ok(signed.signature.payloadHash);
});

test('tampering with any signed bundle field is rejected', async () => {
  const { keys, signed } = await signedFixture();
  const tampered = structuredClone(signed);
  tampered.manifest.root.children[0].props.text = 'Injected title';
  assert.throws(
    () => verifySignedBundle(tampered, { [keys.keyId]: keys.publicKey }),
    /hash does not match/,
  );
});

test('bounded LRU evicts the least recently used entry', () => {
  const cache = new LruCache({ maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a');
  cache.set('c', 3);
  assert.equal(cache.get('b'), null);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('structural cache cohorts exclude entity IDs but include role and task', async () => {
  const { model, context } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  assert.equal(
    structuralCacheKey(context, slot),
    structuralCacheKey({ ...context, entity: { type: 'Customer', id: 'different' } }, slot),
  );
  assert.notEqual(
    structuralCacheKey(context, slot),
    structuralCacheKey({ ...context, role: 'viewer' }, slot),
  );
});

test('registry exact and nearest paths verify signatures', async () => {
  const { model, context, keys, signed } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  const registry = new BundleRegistry({ publicKeys: { [keys.keyId]: keys.publicKey } });
  registry.register(context, signed, { slotContract: slot });
  assert.equal(
    registry.getExact({ ...context, entity: { type: 'Customer', id: 'c2' } }, slot).bundleId,
    signed.bundleId,
  );
  const nearest = registry.getNearest(
    { ...context, density: 'balanced', role: 'support_manager' },
    slot,
    { minimumScore: 5 },
  );
  assert.equal(nearest.bundle.bundleId, signed.bundleId);
});

test('last-known-good path cannot bypass signature verification', async () => {
  const { model, context, keys, signed } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  const registry = new BundleRegistry({ publicKeys: { [keys.keyId]: keys.publicKey } });
  registry.register(context, signed, { slotContract: slot });
  const lkgKey = structuralCacheKey(context, slot);
  const tampered = structuredClone(signed);
  tampered.slotId = 'evil.slot';
  registry.lastKnownGood.set(lkgKey, tampered);
  assert.equal(registry.getLastKnownGood(context, slot), null);
});

test('resolver returns exact cache and host fallback deterministically', async () => {
  const { model, context, keys, signed } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  const registry = new BundleRegistry({ publicKeys: { [keys.keyId]: keys.publicKey } });
  registry.register(context, signed, { slotContract: slot });
  const resolver = new BundleResolver({ registry });
  assert.equal((await resolver.resolve(context, slot)).source, 'exact-cache');
  assert.equal(
    (
      await resolver.resolve(
        { ...context, projectId: 'other', role: 'unknown', taskCluster: 'unknown' },
        slot,
        { allowNearest: false, allowCompile: false },
      )
    ).source,
    'host-fallback',
  );
});

test('field projection denies PII unless slot explicitly allows it', () => {
  const record = { id: 'c1', name: 'Name', email: 'secret@example.test', nested: { phone: '123' } };
  const safe = projectFields(record, ['id', 'name', 'email', 'nested.phone'], {
    capabilityPiiFields: ['email', 'nested.phone'],
  });
  assert.equal(safe.email, '[REDACTED]');
  assert.equal(safe.nested.phone, '[REDACTED]');
  const allowed = projectFields(record, ['email'], {
    capabilityPiiFields: ['email'],
    allowedPiiFields: ['email'],
  });
  assert.equal(allowed.email, 'secret@example.test');
});

test('dispatcher rejects missing permissions before reaching the host executor', async () => {
  const { model } = await signedFixture();
  let called = false;
  const dispatcher = new CapabilityDispatcher({
    projectModel: model,
    executors: {
      'customer.archive': async () => {
        called = true;
      },
    },
    confirm: async () => true,
  });
  await assert.rejects(
    dispatcher.dispatch('customer.archive', { customerId: 'c1' }, { permissions: [] }),
    (error) => error.code === 'PERMISSION_DENIED',
  );
  assert.equal(called, false);
});

test('dispatcher requires confirmation for sensitive and destructive actions', async () => {
  const { model } = await signedFixture();
  const dispatcher = new CapabilityDispatcher({
    projectModel: model,
    executors: { 'customer.archive': async () => ({ ok: true }) },
    confirm: async () => false,
  });
  await assert.rejects(
    dispatcher.dispatch(
      'customer.archive',
      { customerId: 'c1' },
      { permissions: ['customer.archive'] },
    ),
    (error) => error.code === 'ACTION_NOT_CONFIRMED',
  );
});

test('successful dispatch records immutable provenance events', async () => {
  const { model } = await signedFixture();
  const audit = new MemoryAuditSink();
  const dispatcher = new CapabilityDispatcher({
    projectModel: model,
    executors: { 'customer.archive': async () => ({ id: 'c1', status: 'archived' }) },
    confirm: async () => true,
    audit,
  });
  const output = await dispatcher.dispatch(
    'customer.archive',
    { customerId: 'c1' },
    { permissions: ['customer.archive'], userId: 'u1', bundleId: 'b1' },
  );
  assert.equal(output.ok, true);
  assert.deepEqual(
    audit.events.map((x) => x.type),
    ['action.started', 'action.completed'],
  );
  assert.equal(audit.events[0].inputHash.length, 64);
});

test('structural events invalidate only affected signed bundles', async () => {
  const { model, context, keys, signed } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  const registry = new BundleRegistry({ publicKeys: { [keys.keyId]: keys.publicKey } });
  registry.register(context, signed, { slotContract: slot });
  const bus = new TriggerBus();
  const dispose = wireStructuralInvalidation({ bus, registry });
  await bus.publish({
    type: 'capability.schema_changed',
    projectId: model.projectId,
    capabilityId: 'customer.get',
  });
  assert.equal(registry.getExact(context, slot), null);
  dispose();
});

test('DOM renderer escapes untrusted data and never emits customer email', async () => {
  const { signed } = await signedFixture();
  const html = renderBundle(signed, {
    'customer.get': {
      name: '<img src=x onerror=alert(1)>',
      status: 'at_risk',
      riskScore: 90,
      email: 'hidden@test',
    },
  });
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('hidden@test'), false);
});

test('runtime patch helper drops unregistered actions and executable fields', async () => {
  const { model, signed } = await signedFixture();
  const patched = applyBoundedRuntimePatch(
    signed,
    {
      density: 'spacious',
      javascript: 'evil()',
      suggestedActions: ['customer.archive', 'evil.action'],
    },
    { maxAdaptationLevel: 1, projectModel: model },
  );
  assert.equal(patched.runtimePatch.density, 'spacious');
  assert.equal(patched.runtimePatch.javascript, undefined);
  assert.deepEqual(patched.runtimePatch.suggestedActions, ['customer.archive']);
  assert.equal(patched.signature, undefined);
});

test('privileged bundle is never reused for a lower-permission context', async () => {
  const { model, context, keys, signed } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  const registry = new BundleRegistry({ publicKeys: { [keys.keyId]: keys.publicKey } });
  registry.register(context, signed, { slotContract: slot });
  const lower = { ...context, permissions: ['customer.read'], density: 'balanced' };
  assert.equal(registry.getNearest(lower, slot, { minimumScore: 0 }), null);
});

test('resolver serves stale signed structure within SWR and can compile a cold miss', async () => {
  const { model, context, compiled, keys } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  const old = signBundle(
    {
      ...compiled.bundle,
      cachePolicy: { ...compiled.bundle.cachePolicy, ttlMs: 10, staleWhileRevalidateMs: 100 },
    },
    { ...keys, clock: () => new Date(0) },
  );
  const registry = new BundleRegistry({
    publicKeys: { [keys.keyId]: keys.publicKey },
    clock: () => 50,
  });
  registry.register(context, old, { slotContract: slot });
  const staleResolver = new BundleResolver({ registry, clock: () => 50 });
  assert.equal(
    (await staleResolver.resolve(context, slot, { allowCompile: false })).source,
    'stale-while-revalidate',
  );

  const empty = new BundleRegistry({ publicKeys: { [keys.keyId]: keys.publicKey } });
  let compiledCount = 0;
  const cold = new BundleResolver({
    registry: empty,
    compile: async () => {
      compiledCount += 1;
      return old;
    },
  });
  const result = await cold.resolve(context, slot, { allowNearest: false });
  assert.equal(result.source, 'compiled-miss');
  assert.equal(compiledCount, 1);
  assert.equal(empty.getExact(context, slot).bundleId, old.bundleId);
});

test('bundle activation cannot be registered against another role or project', async () => {
  const { model, context, signed } = await signedFixture();
  const slot = model.slots.find((x) => x.id === context.slotId);
  assert.throws(
    () => assertBundleContextCompatible(signed, { ...context, role: 'viewer' }, slot),
    (error) => error.code === 'BUNDLE_ACTIVATION_MISMATCH',
  );
  assert.throws(
    () => assertBundleContextCompatible(signed, { ...context, projectId: 'other' }, slot),
    (error) => error.code === 'BUNDLE_PROJECT_MISMATCH',
  );
});
