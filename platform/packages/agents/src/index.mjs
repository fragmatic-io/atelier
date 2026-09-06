// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { canonicalJson, sha256, stableId } from '../../contracts/src/index.mjs';

export class AgentOrchestrator {
  constructor({
    agents = [],
    modelAdapter = null,
    concurrency = 4,
    clock = () => new Date(),
  } = {}) {
    this.agents = new Map(agents.map((agent) => [agent.id, agent]));
    this.modelAdapter = modelAdapter;
    this.concurrency = Math.max(1, concurrency);
    this.clock = clock;
  }

  async run(seed = {}) {
    const artifacts = new Map(Object.entries(seed));
    const pending = new Map(this.agents);
    const trace = [];
    while (pending.size) {
      const ready = [...pending.values()].filter((agent) =>
        (agent.needs ?? []).every((key) => artifacts.has(key)),
      );
      if (!ready.length) {
        throw new Error(`Agent DAG is blocked; pending=${[...pending.keys()].join(', ')}`);
      }
      const batch = ready.slice(0, this.concurrency);
      const results = await Promise.all(
        batch.map(async (agent) => {
          const input = Object.fromEntries(
            (agent.needs ?? []).map((key) => [key, artifacts.get(key)]),
          );
          const startedAt = this.clock().toISOString();
          const output = await agent.run({ input, artifacts, model: this.modelAdapter });
          const normalized =
            agent.produces?.length === 1 && !(agent.produces[0] in (output ?? {}))
              ? { [agent.produces[0]]: output }
              : output;
          for (const key of agent.produces ?? []) {
            if (!(key in (normalized ?? {})))
              throw new Error(`Agent ${agent.id} did not produce ${key}`);
          }
          return {
            agent,
            inputHash: sha256(input),
            output: normalized,
            outputHash: sha256(normalized),
            startedAt,
            completedAt: this.clock().toISOString(),
          };
        }),
      );
      for (const result of results) {
        for (const [key, value] of Object.entries(result.output ?? {})) artifacts.set(key, value);
        pending.delete(result.agent.id);
        trace.push({
          id: stableId('run', {
            agent: result.agent.id,
            input: result.inputHash,
            output: result.outputHash,
          }),
          agentId: result.agent.id,
          model: this.modelAdapter?.id ?? 'deterministic',
          inputHash: result.inputHash,
          outputHash: result.outputHash,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
        });
      }
    }
    return { artifacts: Object.fromEntries(artifacts), trace };
  }
}

export class JsonModelAdapter {
  constructor({ id = 'json-model-adapter', complete }) {
    this.id = id;
    this.complete = complete;
  }

  async completeJson({ system, input, schema = null, temperature = 0 }) {
    const value = await this.complete({ system, input, schema, temperature });
    if (typeof value === 'string') return JSON.parse(value);
    return value;
  }
}

export class HttpJsonModelAdapter extends JsonModelAdapter {
  constructor({ id = 'http-json-model', endpoint, headers = {}, model, fetchImpl = fetch }) {
    super({
      id,
      complete: async ({ system, input, schema, temperature }) => {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ model, system, input, schema, temperature }),
        });
        if (!response.ok) throw new Error(`Model endpoint failed: ${response.status}`);
        const payload = await response.json();
        return payload.output ?? payload.result ?? payload;
      },
    });
    this.endpoint = endpoint;
    this.model = model;
  }
}

export function artifactEnvelope(
  type,
  value,
  { agentId = 'deterministic', model = 'deterministic' } = {},
) {
  return {
    type,
    value,
    contentHash: sha256(value),
    provenance: { agentId, model },
  };
}

export function deterministicBuildAgents({ forge, evaluator }) {
  return [
    {
      id: 'project-cartographer',
      needs: ['projectModel', 'goal', 'slot'],
      produces: ['projectContext'],
      run: async ({ input }) => ({
        projectContext: {
          routes: input.projectModel.routes,
          slot: input.slot,
          relevantCapabilities: input.projectModel.capabilities.filter(
            (capability) =>
              input.slot.allowedCapabilityGroups.includes('*') ||
              input.slot.allowedCapabilityGroups.some((group) => capability.id.startsWith(group)),
          ),
          relevantComponents: input.projectModel.components,
          goal: input.goal,
        },
      }),
    },
    {
      id: 'domain-modeler',
      needs: ['projectModel', 'projectContext'],
      produces: ['domainContext'],
      run: async ({ input }) => ({
        domainContext: {
          entities: input.projectModel.entities,
          capabilityGraph: input.projectModel.capabilityGraph,
        },
      }),
    },
    {
      id: 'design-archaeologist',
      needs: ['projectModel'],
      produces: ['designContext'],
      run: async ({ input }) => ({ designContext: input.projectModel.designGenome }),
    },
    {
      id: 'ux-architect',
      needs: ['goal', 'projectContext', 'domainContext'],
      produces: ['taskBrief'],
      run: async ({ input }) => ({
        taskBrief: {
          goal: input.goal,
          requiredInformation: input.domainContext.entities
            .slice(0, 2)
            .flatMap((entity) =>
              entity.fields.slice(0, 4).map((field) => `${entity.id}.${field.name}`),
            ),
          candidateActions: input.projectContext.relevantCapabilities
            .filter((x) => x.kind === 'command')
            .map((x) => x.id),
        },
      }),
    },
    {
      id: 'reuse-agent',
      needs: ['taskBrief', 'projectModel'],
      produces: ['componentDecision'],
      run: async ({ input }) => ({
        componentDecision: forge.findReusable(input.taskBrief, input.projectModel),
      }),
    },
    {
      id: 'visual-designer',
      needs: ['taskBrief', 'designContext', 'componentDecision'],
      produces: ['designCandidates'],
      run: async ({ input }) => ({
        designCandidates: [
          {
            id: 'focused',
            density: input.designContext?.grammar?.density ?? 'balanced',
            hierarchy: 'context-actions',
          },
          { id: 'evidence-first', density: 'compact', hierarchy: 'evidence-context-actions' },
          { id: 'guided', density: 'balanced', hierarchy: 'summary-next-step-details' },
        ],
      }),
    },
    {
      id: 'component-engineer',
      needs: ['componentDecision', 'taskBrief', 'projectModel', 'designContext'],
      produces: ['projectKitPatch'],
      run: async ({ input }) => ({
        projectKitPatch:
          input.componentDecision.kind === 'forge'
            ? forge.generate(input.taskBrief, input.projectModel, input.designContext)
            : {
                kind: input.componentDecision.kind,
                reused: input.componentDecision.componentIds ?? [],
              },
      }),
    },
    {
      id: 'independent-critics',
      needs: ['taskBrief', 'projectKitPatch', 'projectModel'],
      produces: ['criticReport'],
      run: async ({ input }) => ({
        criticReport: evaluator.evaluateBuildArtifact({
          brief: input.taskBrief,
          artifact: input.projectKitPatch,
          projectModel: input.projectModel,
        }),
      }),
    },
    {
      id: 'publisher',
      needs: ['criticReport', 'projectKitPatch'],
      produces: ['publishDecision'],
      run: async ({ input }) => ({
        publishDecision: {
          approved: input.criticReport.blockers.length === 0,
          artifact: input.projectKitPatch,
          reasons: input.criticReport.blockers,
        },
      }),
    },
  ];
}

/**
 * Ask any JSON-capable model for a bounded improvement, then run a caller-
 * supplied sanitizer before the proposal can enter evaluation or signing.
 * The model never receives a code-execution hook.
 */
export async function refineArtifactWithModel({
  model,
  system,
  artifact,
  context,
  schema = null,
  sanitize,
}) {
  if (!model) return { artifact, usedModel: false, provenance: { model: 'none' } };
  const proposal = await model.completeJson({
    system,
    input: { artifact, context },
    schema,
    temperature: 0,
  });
  const safe = sanitize(proposal, { artifact, context });
  return {
    artifact: safe,
    usedModel: true,
    provenance: {
      model: model.id,
      inputHash: sha256({ artifact, context }),
      proposalHash: sha256(proposal),
      sanitizedHash: sha256(safe),
    },
  };
}
