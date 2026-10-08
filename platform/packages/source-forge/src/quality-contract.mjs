// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, canonical, hash, noPrototypeKeys, text } from '../../conversation/src/common.mjs';

const TOP_KEYS = new Set([
  'version', 'profile', 'goal', 'dataPolicy', 'visualReviewRequired', 'maxRepairAttempts',
  'actionIds', 'scenarios', 'hash',
]);
const OPS = new Set(['click', 'fill', 'select', 'press']);
const ASSERTIONS = new Set(['text', 'visible', 'hidden', 'count', 'value', 'disabled', 'enabled']);
const object = (value, name, allowed) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'QUALITY_CONTRACT', `${name} must be an object`);
  for (const key of Object.keys(value))
    assert(allowed.has(key), 400, 'QUALITY_CONTRACT', `Unsupported ${name} property: ${key}`);
};
const boundedArray = (value, name, max, min = 0) => {
  assert(Array.isArray(value) && value.length >= min && value.length <= max, 400, 'QUALITY_CONTRACT', `${name} must contain ${min}–${max} items`);
  return value;
};
const jsonObject = (value, name, maxBytes = 40000) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'QUALITY_CONTRACT', `${name} must be an object`);
  noPrototypeKeys(value);
  assert(Buffer.byteLength(canonical(value)) <= maxBytes, 413, 'QUALITY_CONTRACT_SIZE', `${name} exceeds its fixture budget`);
  return structuredClone(value);
};

/** The caller supplies this oracle before source generation. Kit-authored tests
 * are supplementary smoke tests and cannot replace these immutable scenarios. */
export function normalizeQualityContract(value = {}, { approvedActions = [], goal = '', production = false } = {}) {
  object(value, 'quality contract', TOP_KEYS);
  noPrototypeKeys(value);
  assert(value.version === undefined || value.version === 1, 400, 'QUALITY_CONTRACT_VERSION', 'Unsupported quality contract version');
  const callerGoal = goal === '' ? null : text(goal, 'Requested quality goal', { max: 4000 });
  const suppliedGoal = value.goal === undefined ? null : text(value.goal, 'Quality goal', { max: 4000 });
  assert(!callerGoal || !suppliedGoal || callerGoal === suppliedGoal, 409, 'QUALITY_GOAL_MISMATCH', 'The quality contract must describe the exact requested task; update its oracle before changing the goal');
  const taskGoal = text(callerGoal ?? suppliedGoal, 'Quality goal', { max: 4000 });
  const profile = value.profile ?? (production ? 'production' : 'standard');
  assert(['standard', 'production'].includes(profile), 400, 'QUALITY_PROFILE', 'Use standard or production quality');
  assert(!production || profile === 'production', 409, 'PRODUCTION_QUALITY_REQUIRED', 'Production requires the production source quality policy');
  const actionIds = [...new Set(approvedActions)].sort();
  assert(actionIds.length <= 16 && actionIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200), 400, 'QUALITY_ACTIONS', 'Invalid approved quality actions');
  if (value.actionIds !== undefined)
    assert(canonical(value.actionIds) === canonical(actionIds), 400, 'QUALITY_ACTIONS', 'Quality contract action scope differs from the approved task');
  const scenarios = boundedArray(value.scenarios ?? [], 'Independent scenarios', 6, profile === 'production' ? 1 : 0).map((scenario) => {
    object(scenario, 'scenario', new Set(['id', 'name', 'data', 'steps', 'assertions', 'calls']));
    const scenarioId = text(scenario.id, 'Scenario ID', { max: 60 });
    assert(/^[a-z][a-z0-9-]*$/.test(scenarioId), 400, 'QUALITY_SCENARIO_ID', 'Use a stable lowercase scenario ID');
    const steps = boundedArray(scenario.steps, 'Scenario steps', 15, 1).map((step) => {
      object(step, 'step', new Set(['op', 'selector', 'value']));
      assert(OPS.has(step.op), 400, 'QUALITY_STEP', 'Unsupported scenario operation');
      const selector = text(step.selector, 'Scenario selector', { max: 200 });
      const supplied = step.value ?? '';
      assert(typeof supplied === 'string' && supplied.length <= 1000, 400, 'QUALITY_STEP', 'Step value exceeds its budget');
      assert(step.op === 'click' || supplied.length > 0, 400, 'QUALITY_STEP', 'This operation needs a value');
      return { op: step.op, selector, value: supplied };
    });
    const assertions = boundedArray(scenario.assertions, 'Scenario assertions', 12, 1).map((item) => {
      object(item, 'assertion', new Set(['kind', 'selector', 'text', 'value', 'count']));
      assert(ASSERTIONS.has(item.kind), 400, 'QUALITY_ASSERTION', 'Unsupported scenario assertion');
      const out = { kind: item.kind, selector: text(item.selector, 'Assertion selector', { max: 200 }) };
      if (item.kind === 'text' || item.kind === 'value') {
        const key = item.kind;
        out[key] = text(item[key], `Expected ${key}`, { min: 0, max: 1000 });
      } else if (item.kind === 'count') {
        assert(Number.isSafeInteger(item.count) && item.count >= 0 && item.count <= 1000, 400, 'QUALITY_ASSERTION', 'Count assertion must be bounded');
        out.count = item.count;
      }
      return out;
    });
    const calls = boundedArray(scenario.calls ?? [], 'Expected calls', 8).map((call) => {
      object(call, 'expected call', new Set(['capabilityId', 'input', 'outcome', 'result', 'error']));
      assert(actionIds.includes(call.capabilityId), 403, 'UNAPPROVED_ACTION', 'Scenario references an unapproved action');
      assert(['success', 'error'].includes(call.outcome), 400, 'QUALITY_CALL', 'Expected calls need an explicit fixture outcome');
      const out = { capabilityId: call.capabilityId, input: jsonObject(call.input, 'Expected action input', 16000), outcome: call.outcome };
      if (call.outcome === 'success') {
        assert(call.error === undefined, 400, 'QUALITY_CALL', 'Successful fixture cannot also declare an error');
        out.result = jsonObject(call.result, 'Fixture result', 40000);
      } else {
        assert(call.result === undefined, 400, 'QUALITY_CALL', 'Failed fixture cannot also declare a result');
        out.error = text(call.error, 'Fixture error', { max: 300 });
      }
      return out;
    });
    return { id: scenarioId, name: text(scenario.name, 'Scenario name', { max: 200 }), data: jsonObject(scenario.data, 'Scenario data'), steps, assertions, calls };
  });
  assert(new Set(scenarios.map((item) => item.id)).size === scenarios.length, 400, 'QUALITY_SCENARIO_ID', 'Scenario IDs must be unique');
  const dataPolicy = value.dataPolicy ?? (scenarios.length || value.visualReviewRequired || profile === 'production' ? null : 'synthetic');
  assert(['synthetic', 'redacted'].includes(dataPolicy), 400, 'QUALITY_DATA_POLICY', 'Confirm scenario data is synthetic or redacted');
  const visualReviewRequired = value.visualReviewRequired ?? (profile === 'production');
  assert(typeof visualReviewRequired === 'boolean', 400, 'QUALITY_VISUAL_POLICY', 'Visual review policy must be explicit');
  assert(profile !== 'production' || visualReviewRequired, 409, 'PRODUCTION_VISUAL_REQUIRED', 'Production source requires actual screenshot review');
  if (profile === 'production')
    for (const action of actionIds)
      assert(scenarios.some((scenario) => scenario.calls.some((call) => call.capabilityId === action)), 409, 'QUALITY_ACTION_COVERAGE', `Independent scenarios must exercise ${action}`);
  const maxRepairAttempts = value.maxRepairAttempts ?? 2;
  assert(Number.isSafeInteger(maxRepairAttempts) && maxRepairAttempts >= 1 && maxRepairAttempts <= 3, 400, 'QUALITY_REPAIR_BUDGET', 'Use one to three source attempts');
  const body = {
    version: 1, profile, goal: taskGoal,
    dataPolicy, visualReviewRequired, maxRepairAttempts, actionIds, scenarios,
  };
  assert(Buffer.byteLength(canonical(body)) <= 160000, 413, 'QUALITY_CONTRACT_SIZE', 'Quality contract exceeds 160 KB');
  return { ...body, hash: hash(body) };
}

export function assertQualityContract(value) {
  assert(value && typeof value.hash === 'string', 400, 'QUALITY_CONTRACT_HASH', 'A bound quality contract is required');
  const normalized = normalizeQualityContract(value, { approvedActions: value.actionIds ?? [], goal: value.goal });
  assert(value.hash === normalized.hash && canonical(value) === canonical(normalized), 409, 'QUALITY_CONTRACT_CHANGED', 'Quality contract is not the exact normalized task oracle');
  return normalized;
}

export function qualityContractFor(compiled) {
  return compiled.qualityContract ? assertQualityContract(compiled.qualityContract) : null;
}
