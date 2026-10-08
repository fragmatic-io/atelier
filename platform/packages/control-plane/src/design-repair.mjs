// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/** Explicit, immutable coverage that a model-authored presentation must preserve. */
export function designCoverage(plan) {
  return {
    information: plan.queryPlan.map((query) => ({
      capabilityId: query.capabilityId,
      fields: [...query.fields],
    })),
    actions: plan.actionPlan.map((action) => action.capabilityId),
  };
}

/** Safe structured feedback for a second model attempt; never includes runtime data. */
export function designRepairIssue(error) {
  return {
    code: error?.code ?? 'DESIGN_INVALID',
    message: error?.message ?? 'Design failed the approved contract',
    details: error?.details ?? null,
  };
}

/** Critique is feedback to repair, never authority to change the approved coverage. */
export function critiqueRepairIssues(critique) {
  const issues = (critique?.issues ?? []).filter((issue) => typeof issue === 'string' && issue.trim());
  return (issues.length ? issues : ['The independent critic rejected this candidate without a specific issue. Reassess task completion, hierarchy and host coherence.'])
    .slice(0, 10)
    .map((message) => ({
      code: 'CRITIC_REJECTED',
      message: message.slice(0, 400),
      details: null,
    }));
}
