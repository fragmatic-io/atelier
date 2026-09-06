// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { validateData } from '../../providers/src/data-schema.mjs';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import {
  AtelierError,
  canonicalJson,
  deepClone,
  eventId,
  invariant,
  isPiiField,
  nowIso,
  sha256,
  stableId,
  stripSignature,
  validateScreenBundle,
} from '../../contracts/src/index.mjs';

export class LruCache {
  constructor({ maxEntries = 200, clock = () => Date.now() } = {}) {
    invariant(
      Number.isInteger(maxEntries) && maxEntries > 0 && maxEntries <= 100000,
      'INVALID_CACHE_LIMIT',
      'Cache size must be a positive bounded integer',
    );
    this.maxEntries = maxEntries;
    this.clock = clock;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    this.map.delete(key);
    entry.lastAccessedAt = this.clock();
    this.map.set(key, entry);
    return entry.value;
  }

  peekEntry(key) {
    return this.map.get(key) ?? null;
  }

  set(key, value, metadata = {}) {
    this.map.delete(key);
    this.map.set(key, { value, metadata, storedAt: this.clock(), lastAccessedAt: this.clock() });
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value);
    return value;
  }

  delete(key) {
    return this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  keys() {
    return [...this.map.keys()];
  }
  get size() {
    return this.map.size;
  }
}

export function normalizeContext(context, slotContract) {
  const normalized = {
    tenantId: String(context.tenantId ?? 'local'),
    projectId: String(context.projectId ?? ''),
    projectVersion: String(context.projectVersion ?? ''),
    slotId: String(context.slotId ?? slotContract?.id ?? ''),
    role: String(context.role ?? 'user'),
    permissions: [...new Set(context.permissions ?? [])].sort(),
    taskCluster: String(context.taskCluster ?? 'default'),
    entityType: String(context.entity?.type ?? context.entityType ?? 'none'),
    entityId: context.entity?.id ? String(context.entity.id) : null,
    locale: String(context.locale ?? 'en'),
    density: String(context.density ?? 'balanced'),
    viewportClass: String(context.viewportClass ?? 'desktop'),
    policySet: [...new Set(context.policySet ?? [])].sort(),
    featureFlags: Object.fromEntries(
      Object.entries(context.featureFlags ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  invariant(normalized.slotId, 'CONTEXT_SLOT_REQUIRED', 'Runtime context needs a slotId');
  return normalized;
}

export function structuralCacheKey(context, slotContract) {
  const c = normalizeContext(context, slotContract);
  const stable = {
    tenantId: c.tenantId,
    viewportClass: c.viewportClass,
    projectId: c.projectId,
    projectVersion: c.projectVersion,
    slotId: c.slotId,
    role: c.role,
    taskCluster: c.taskCluster,
    entityType: c.entityType,
    locale: c.locale,
    density: c.density,
    policySet: c.policySet,
    permissionHash: sha256(c.permissions),
    featureFlags: c.featureFlags,
  };
  return `screen:${sha256(stable)}`;
}

export function generateSigningKeyPair({ keyId = `key_${Date.now()}` } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    keyId,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

export function signBundle(bundle, { privateKey, keyId, clock = () => new Date() }) {
  invariant(privateKey && keyId, 'SIGNING_KEY_REQUIRED', 'privateKey and keyId are required');
  const unsigned = stripSignature(bundle);
  const payloadHash = sha256(unsigned);
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalJson(unsigned)),
    createPrivateKey(privateKey),
  ).toString('base64url');
  return {
    ...unsigned,
    signature: {
      algorithm: 'Ed25519',
      keyId,
      payloadHash,
      value: signature,
      signedAt: clock().toISOString(),
    },
  };
}

export function verifySignedBundle(bundle, publicKeys) {
  invariant(
    bundle?.signature?.algorithm === 'Ed25519',
    'BUNDLE_UNSIGNED',
    'Bundle has no supported signature',
  );
  const publicKey =
    publicKeys instanceof Map
      ? publicKeys.get(bundle.signature.keyId)
      : publicKeys?.[bundle.signature.keyId];
  invariant(publicKey, 'UNKNOWN_SIGNING_KEY', `Unknown signing key ${bundle.signature.keyId}`);
  const unsigned = stripSignature(bundle);
  invariant(
    sha256(unsigned) === bundle.signature.payloadHash,
    'BUNDLE_HASH_MISMATCH',
    'Signed bundle payload hash does not match',
  );
  const ok = cryptoVerify(
    null,
    Buffer.from(canonicalJson(unsigned)),
    createPublicKey(publicKey),
    Buffer.from(bundle.signature.value, 'base64url'),
  );
  invariant(ok, 'BUNDLE_SIGNATURE_INVALID', 'Bundle signature verification failed');
  return true;
}

function contextDistance(a, b) {
  let score = 0;
  if (!a || !b) return -Infinity;
  for (const key of [
    'tenantId',
    'projectId',
    'projectVersion',
    'slotId',
    'role',
    'taskCluster',
    'entityType',
    'locale',
    'viewportClass',
  ])
    if (a[key] !== b[key]) return -Infinity;
  if (
    sha256(a.policySet) !== sha256(b.policySet) ||
    sha256(a.featureFlags) !== sha256(b.featureFlags)
  )
    return -Infinity;
  const targetPermissions = new Set(a.permissions ?? []);
  if (!(b.permissions ?? []).every((permission) => targetPermissions.has(permission)))
    return -Infinity;
  if (a.projectVersion === b.projectVersion) score += 5;
  if (a.role === b.role) score += 3;
  if (a.taskCluster === b.taskCluster) score += 3;
  if (a.entityType === b.entityType) score += 2;
  if (a.locale === b.locale) score += 1;
  if (a.density === b.density) score += 1;
  return score;
}

export function assertBundleContextCompatible(bundle, context, slotContract = null) {
  const normalized = normalizeContext(context, slotContract);
  invariant(
    (bundle.tenantId ?? 'local') === normalized.tenantId,
    'BUNDLE_TENANT_MISMATCH',
    'Bundle tenant does not match runtime tenant',
  );
  invariant(
    bundle.slotId === normalized.slotId,
    'BUNDLE_SLOT_MISMATCH',
    'Bundle slot does not match runtime slot',
  );
  if (bundle.projectId)
    invariant(
      bundle.projectId === normalized.projectId,
      'BUNDLE_PROJECT_MISMATCH',
      'Bundle project does not match runtime project',
    );
  if (bundle.projectVersion && normalized.projectVersion)
    invariant(
      bundle.projectVersion === normalized.projectVersion,
      'BUNDLE_PROJECT_VERSION_MISMATCH',
      'Bundle project version does not match runtime context',
    );
  const activation = bundle.activation ?? {};
  for (const [field, actual] of [
    ['role', normalized.role],
    ['taskCluster', normalized.taskCluster],
    ['entityType', normalized.entityType],
    ['locale', normalized.locale],
  ]) {
    if (activation[field] !== undefined)
      invariant(
        String(activation[field]) === String(actual),
        'BUNDLE_ACTIVATION_MISMATCH',
        `Bundle activation ${field} does not match runtime context`,
        { field, expected: activation[field], actual },
      );
  }
  return true;
}

export class BundleRegistry {
  constructor({ publicKeys = {}, maxEntries = 500, clock = () => Date.now() } = {}) {
    this.publicKeys = publicKeys;
    this.clock = clock;
    this.cache = new LruCache({ maxEntries, clock });
    this.contextByKey = new Map();
    this.bundleById = new Map();
    this.lastKnownGood = new Map();
  }

  register(context, signedBundle, { slotContract = null } = {}) {
    verifySignedBundle(signedBundle, this.publicKeys);
    assertBundleContextCompatible(signedBundle, context, slotContract);
    const key = structuralCacheKey(context, slotContract);
    const normalized = normalizeContext(context, slotContract);
    this.cache.set(key, deepClone(signedBundle), { context: normalized });
    this.contextByKey.set(key, normalized);
    this.bundleById.set(signedBundle.bundleId, deepClone(signedBundle));
    this.lastKnownGood.set(structuralCacheKey(normalized), deepClone(signedBundle));
    for (const existing of this.contextByKey.keys())
      if (!this.cache.peekEntry(existing)) this.contextByKey.delete(existing);
    while (this.bundleById.size > this.cache.maxEntries)
      this.bundleById.delete(this.bundleById.keys().next().value);
    while (this.lastKnownGood.size > this.cache.maxEntries)
      this.lastKnownGood.delete(this.lastKnownGood.keys().next().value);
    return key;
  }

  getExact(context, slotContract = null) {
    const key = structuralCacheKey(context, slotContract);
    const bundle = this.cache.get(key);
    if (!bundle) return null;
    try {
      verifySignedBundle(bundle, this.publicKeys);
      assertBundleContextCompatible(bundle, context, slotContract);
      return deepClone(bundle);
    } catch {
      this.cache.delete(key);
      return null;
    }
  }

  getNearest(context, slotContract = null, { minimumScore = 8 } = {}) {
    const target = normalizeContext(context, slotContract);
    let best = null;
    for (const key of this.cache.keys()) {
      const candidateContext = this.contextByKey.get(key);
      const score = contextDistance(target, candidateContext);
      if (!best || score > best.score) best = { key, score };
    }
    if (!best || best.score < minimumScore) return null;
    const bundle = this.cache.get(best.key);
    if (!bundle) return null;
    try {
      verifySignedBundle(bundle, this.publicKeys);
      assertBundleContextCompatible(bundle, context, slotContract);
      const age =
        this.clock() - Date.parse(bundle.provenance?.compiledAt ?? bundle.signature?.signedAt);
      if (
        !Number.isFinite(age) ||
        age >
          (bundle.cachePolicy?.ttlMs ?? 86400000) +
            (bundle.cachePolicy?.staleWhileRevalidateMs ?? 0)
      )
        return null;
      return { bundle: deepClone(bundle), score: best.score, sourceKey: best.key };
    } catch {
      this.cache.delete(best.key);
      return null;
    }
  }

  getLastKnownGood(context, slotContract = null) {
    const c = normalizeContext(context, slotContract);
    const key = structuralCacheKey(c);
    const bundle = this.lastKnownGood.get(key);
    if (!bundle) return null;
    try {
      verifySignedBundle(bundle, this.publicKeys);
      assertBundleContextCompatible(bundle, context, slotContract);
      return deepClone(bundle);
    } catch {
      this.lastKnownGood.delete(key);
      return null;
    }
  }

  invalidate(predicate) {
    let removed = 0;
    for (const key of this.cache.keys()) {
      const context = this.contextByKey.get(key);
      const entry = this.cache.peekEntry(key);
      if (predicate({ key, context, bundle: entry?.value })) {
        this.cache.delete(key);
        this.contextByKey.delete(key);
        this.lastKnownGood.delete(key);
        if (entry?.value) this.bundleById.delete(entry.value.bundleId);
        removed += 1;
      }
    }
    return removed;
  }
}

export class TriggerBus {
  constructor() {
    this.listeners = new Map();
  }
  subscribe(type, listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
    return () => set.delete(listener);
  }
  async publish(event) {
    const listeners = [
      ...(this.listeners.get(event.type) ?? []),
      ...(this.listeners.get('*') ?? []),
    ];
    await Promise.all(listeners.map((listener) => listener(event)));
  }
}

export function wireStructuralInvalidation({ bus, registry }) {
  const structural = new Set([
    'project.version_changed',
    'capability.schema_changed',
    'design.genome_changed',
    'component.changed',
    'policy.changed',
    'slot.changed',
    'permission.contract_changed',
  ]);
  return bus.subscribe('*', (event) => {
    if (!structural.has(event.type)) return;
    registry.invalidate(({ context, bundle }) => {
      if (event.tenantId && context?.tenantId !== event.tenantId) return false;
      if (event.projectId && context?.projectId !== event.projectId) return false;
      if (event.slotId && context?.slotId !== event.slotId) return false;
      if (
        event.capabilityId &&
        !bundle?.experiencePlan?.queryPlan?.some((x) => x.capabilityId === event.capabilityId) &&
        !bundle?.experiencePlan?.actionPlan?.some((x) => x.capabilityId === event.capabilityId)
      )
        return false;
      return true;
    });
  });
}

export class BundleResolver {
  constructor({
    registry,
    compile = null,
    publish = null,
    clock = () => Date.now(),
    audit = null,
  } = {}) {
    this.registry = registry;
    this.compile = compile;
    this.publish = publish;
    this.clock = clock;
    this.audit = audit;
    this.inFlight = new Map();
  }

  age(bundle) {
    return (
      this.clock() - Date.parse(bundle.signature?.signedAt ?? bundle.provenance?.compiledAt ?? 0)
    );
  }

  async resolve(context, slotContract, { allowNearest = true, allowCompile = true } = {}) {
    const exact = this.registry.getExact(context, slotContract);
    if (exact) {
      const age = this.age(exact);
      const ttl = exact.cachePolicy?.ttlMs ?? Infinity;
      const swr = exact.cachePolicy?.staleWhileRevalidateMs ?? 0;
      if (age <= ttl) return this.result('exact-cache', exact, context);
      if (age <= ttl + swr) {
        if (allowCompile && this.compile)
          void this.revalidate(context, slotContract).catch(() => null);
        return this.result('stale-while-revalidate', exact, context);
      }
    }
    if (allowNearest) {
      const nearest = this.registry.getNearest(context, slotContract);
      if (nearest)
        return this.result('nearest-approved', nearest.bundle, context, {
          similarityScore: nearest.score,
        });
    }
    if (allowCompile && this.compile) {
      try {
        const signed = await this.revalidate(context, slotContract);
        if (signed) return this.result('compiled-miss', signed, context);
      } catch (error) {
        this.audit?.write?.({ type: 'runtime.compile_failed', error: String(error), context });
      }
    }
    const lkg = this.registry.getLastKnownGood(context, slotContract);
    if (lkg) return this.result('last-known-good', lkg, context);
    return {
      source: 'host-fallback',
      bundle: null,
      context: normalizeContext(context, slotContract),
    };
  }

  async revalidate(context, slotContract) {
    if (!this.compile) return null;
    const key = structuralCacheKey(context, slotContract);
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const promise = (async () => {
      const candidate = await this.compile(context, slotContract);
      if (!candidate) return null;
      const signed = this.publish
        ? await this.publish(candidate, context, slotContract)
        : candidate;
      verifySignedBundle(signed, this.registry.publicKeys);
      this.registry.register(context, signed, { slotContract });
      return signed;
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  result(source, bundle, context, extras = {}) {
    this.audit?.write?.({
      type: 'runtime.bundle_resolved',
      source,
      bundleId: bundle.bundleId,
      context,
    });
    return { source, bundle, context: normalizeContext(context), ...extras };
  }
}

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
function getPath(value, path) {
  let current = value;
  for (const part of String(path).split('.')) {
    if (
      UNSAFE_KEYS.has(part) ||
      !current ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, part)
    )
      return undefined;
    current = current[part];
  }
  return current;
}
function setPath(target, path, value) {
  const parts = String(path).split('.');
  invariant(
    parts.every((p) => p && !UNSAFE_KEYS.has(p)),
    'UNSAFE_FIELD',
    'Unsafe field path',
  );
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) current = current[parts[i]] ??= {};
  current[parts.at(-1)] = value;
}
export function projectFields(
  record,
  fields,
  {
    allowedPiiFields = [],
    capabilityPiiFields = [],
    redactWith = '[REDACTED]',
    includeUnknown = false,
  } = {},
) {
  const allow = new Set(allowedPiiFields),
    pii = new Set(capabilityPiiFields);
  if (record == null || typeof record !== 'object') return record;
  const clean = (v, path, depth = 0) => {
    invariant(depth < 40, 'DATA_TOO_DEEP', 'Data nesting limit exceeded');
    const tail = path.split('.').at(-1).replace(/\[\]$/, '');
    if (
      (pii.has(path) || pii.has(path.replace(/\[\]/g, '')) || isPiiField(tail)) &&
      !allow.has(path)
    )
      return redactWith;
    if (Array.isArray(v)) return v.slice(0, 10000).map((x) => clean(x, path + '[]', depth + 1));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        if (UNSAFE_KEYS.has(k)) continue;
        out[k] = clean(x, path ? path + '.' + k : k, depth + 1);
      }
      return out;
    }
    return v;
  };
  if (Array.isArray(record))
    return record.slice(0, 10000).map((x) =>
      projectFields(x, fields, {
        allowedPiiFields,
        capabilityPiiFields,
        redactWith,
        includeUnknown,
      }),
    );
  const output = {};
  for (const field of fields?.length ? fields : includeUnknown ? Object.keys(record) : []) {
    invariant(
      String(field)
        .split('.')
        .every((p) => p && !UNSAFE_KEYS.has(p)),
      'UNSAFE_FIELD',
      'Unsafe field path',
    );
    const v = getPath(record, field);
    if (v !== undefined) setPath(output, field, clean(v, field));
  }
  return output;
}
function validateInput(schema, input) {
  try {
    validateData(input, schema);
    return [];
  } catch (e) {
    return e.errors ?? [e.message];
  }
}

export class MemoryAuditSink {
  constructor({ clock = () => new Date(), maxEntries = 1000 } = {}) {
    this.events = [];
    this.clock = clock;
    this.maxEntries = maxEntries;
  }
  write(event) {
    const record = { eventId: eventId(), at: this.clock().toISOString(), ...deepClone(event) };
    this.events.push(record);
    if (this.events.length > this.maxEntries)
      this.events.splice(0, this.events.length - this.maxEntries);
    return record;
  }
  query(predicate = () => true) {
    return this.events.filter(predicate).map((event) => deepClone(event));
  }
}

export class CapabilityDispatcher {
  constructor({
    projectModel,
    executors = {},
    confirm = async () => false,
    audit = new MemoryAuditSink(),
  } = {}) {
    this.projectModel = projectModel;
    this.executors = executors;
    this.confirm = confirm;
    this.audit = audit;
  }

  async dispatch(capabilityId, input, context = {}) {
    if (this.projectModel.tenantId)
      invariant(
        context.tenantId === this.projectModel.tenantId,
        'TENANT_MISMATCH',
        'Action tenant differs from project',
      );
    if (context.projectId)
      invariant(
        context.projectId === this.projectModel.projectId,
        'PROJECT_MISMATCH',
        'Action project differs from model',
      );
    const capability = this.projectModel.capabilities.find((x) => x.id === capabilityId);
    invariant(capability, 'CAPABILITY_NOT_FOUND', `Capability ${capabilityId} is not registered`);
    const permissions = new Set(context.permissions ?? []);
    const missing = capability.requiredPermissions.filter(
      (permission) => !permissions.has(permission),
    );
    invariant(!missing.length, 'PERMISSION_DENIED', `Missing permission for ${capabilityId}`, {
      missing,
    });
    const errors = validateInput(capability.inputSchema, input);
    invariant(!errors.length, 'INVALID_ACTION_INPUT', `Invalid input for ${capabilityId}`, {
      errors,
    });
    if (
      ['sensitive', 'destructive'].includes(capability.risk) ||
      ['inline', 'modal', 'verbal_required'].includes(capability.confirmation)
    ) {
      const approved = await this.confirm({
        capability,
        input: deepClone(input),
        context: deepClone(context),
      });
      invariant(approved, 'ACTION_NOT_CONFIRMED', `Action ${capabilityId} was not confirmed`);
    }
    const executor = this.executors[capabilityId];
    invariant(
      typeof executor === 'function',
      'CAPABILITY_EXECUTOR_MISSING',
      `No host executor registered for ${capabilityId}`,
    );
    const started = this.audit.write({
      type: 'action.started',
      capabilityId,
      actor: context.userId,
      bundleId: context.bundleId,
      inputHash: sha256(input),
    });
    try {
      const result = await executor(deepClone(input), deepClone(context), capability);
      this.audit.write({
        type: 'action.completed',
        capabilityId,
        startedEventId: started.eventId,
        outputHash: sha256(result),
      });
      return { ok: true, capabilityId, result, auditEventId: started.eventId };
    } catch (error) {
      this.audit.write({
        type: 'action.failed',
        capabilityId,
        startedEventId: started.eventId,
        error: String(error),
      });
      throw error;
    }
  }
}

export class DataResolver {
  constructor({ projectModel, loaders = {}, slotContracts = [] } = {}) {
    this.projectModel = projectModel;
    this.loaders = loaders;
    this.slotContracts = new Map(slotContracts.map((x) => [x.id, x]));
  }

  async resolve(binding, context) {
    if (this.projectModel.tenantId)
      invariant(
        context.tenantId === this.projectModel.tenantId,
        'TENANT_MISMATCH',
        'Data tenant differs from project',
      );
    if (context.projectId)
      invariant(
        context.projectId === this.projectModel.projectId,
        'PROJECT_MISMATCH',
        'Data project differs from model',
      );
    const capability = this.projectModel.capabilities.find((x) => x.id === binding.source);
    invariant(
      capability?.kind === 'query' || capability?.kind === 'stream',
      'INVALID_DATA_CAPABILITY',
      `${binding.source} is not a readable capability`,
    );
    const missing = capability.requiredPermissions.filter(
      (permission) => !(context.permissions ?? []).includes(permission),
    );
    invariant(!missing.length, 'PERMISSION_DENIED', `Missing permission for ${binding.source}`, {
      missing,
    });
    const registeredSlot = this.slotContracts.get(context.slotId);
    if (registeredSlot)
      invariant(
        registeredSlot.allowedCapabilityGroups.some(
          (g) => g === '*' || binding.source.startsWith(g),
        ),
        'SLOT_CAPABILITY_DENIED',
        'Data capability is outside slot scope',
      );
    const loader = this.loaders[binding.source];
    invariant(
      typeof loader === 'function',
      'DATA_LOADER_MISSING',
      `No data loader for ${binding.source}`,
    );
    const raw = await loader(context, capability);
    const slot = this.slotContracts.get(context.slotId);
    if (Array.isArray(raw))
      return raw.map((record) =>
        projectFields(record, binding.select, {
          allowedPiiFields: slot?.allowedPiiFields ?? [],
          capabilityPiiFields: capability.piiFields,
        }),
      );
    return projectFields(raw, binding.select, {
      allowedPiiFields: slot?.allowedPiiFields ?? [],
      capabilityPiiFields: capability.piiFields,
    });
  }
}

export function applyBoundedRuntimePatch(
  bundle,
  patch,
  { maxAdaptationLevel = 2, projectModel } = {},
) {
  const allowed = new Set([
    'moduleOrder',
    'hiddenModules',
    'density',
    'defaultFilters',
    'defaultGrouping',
    'suggestedActions',
    'copy',
    'expandedModules',
  ]);
  const clean = Object.fromEntries(Object.entries(patch ?? {}).filter(([key]) => allowed.has(key)));
  if (maxAdaptationLevel < 2) delete clean.hiddenModules;
  if (maxAdaptationLevel < 1) {
    for (const key of ['moduleOrder', 'density', 'defaultFilters', 'defaultGrouping'])
      delete clean[key];
  }
  if (clean.suggestedActions)
    clean.suggestedActions = clean.suggestedActions.filter((id) =>
      projectModel.capabilities.some((x) => x.id === id),
    );
  const clone = deepClone(bundle);
  clone.runtimePatch = { ...clean, appliedAt: nowIso() };
  clone.bundleId = stableId('bundle', { base: bundle.bundleId, patch: clean });
  delete clone.signature;
  return clone;
}

export function createRuntime({
  projectModel,
  slotContracts = projectModel.slots,
  publicKeys,
  bundles = [],
  loaders = {},
  executors = {},
  confirm,
  audit = new MemoryAuditSink(),
  compile,
  publish,
} = {}) {
  const registry = new BundleRegistry({ publicKeys });
  const slots = new Map(slotContracts.map((x) => [x.id, x]));
  for (const item of bundles)
    registry.register(item.context, item.bundle, { slotContract: slots.get(item.context.slotId) });
  const bus = new TriggerBus();
  const unsubscribe = wireStructuralInvalidation({ bus, registry });
  const resolver = new BundleResolver({ registry, compile, publish, audit });
  const data = new DataResolver({ projectModel, loaders, slotContracts });
  const dispatcher = new CapabilityDispatcher({ projectModel, executors, confirm, audit });
  return {
    projectModel,
    slots,
    registry,
    resolver,
    data,
    dispatcher,
    bus,
    audit,
    dispose: unsubscribe,
  };
}
