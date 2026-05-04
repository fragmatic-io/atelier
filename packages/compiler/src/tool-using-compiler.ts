// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `ToolUsingCompiler` — Wave C / Phase C-2.
 *
 * Converts the compiler from "single LLM call with everything in the prompt"
 * to a SINGLE tool-using agent. The system prompt shrinks to "here is your
 * route + intent + brand + the available tools; ask for what you need." The
 * LLM iteratively invokes tools (`lookupCapability`, `findComponent`,
 * `validateDraft`, ...) until it produces a final manifest.
 *
 * ## Architecture
 *
 *   ToolUsingCompiler (this class — wraps an `AgentClient`)
 *     ↓ owns the agent loop, the tool registry, the validation gate
 *   AgentClient (`GeminiAgentClient` or any function-calling LLM)
 *     ↓ each call performs ONE Gemini turn — emits either tool calls or final text
 *
 * The wrapper's contract is `CompilerService.compile(input)`, identical to
 * today's `GeminiCompiler`. The agent loop is opaque to callers; the
 * `CompositeCompiler` can wrap a `ToolUsingCompiler` exactly as it wraps
 * `GeminiCompiler` today, and `ValidationFeedbackCompiler` composes cleanly
 * around it.
 *
 * ## Why this matters (vs. C-1)
 *
 * C-1 (`ValidationFeedbackCompiler`) was the highest-leverage single-day
 * win — re-prompt on validation failure with prior draft + violations. C-2
 * is the architecture shift: instead of stuffing every capability schema
 * and component description into the prompt up front, the LLM discovers
 * what it needs on demand. Token cost on the cold prompt drops materially;
 * accuracy improves because the LLM only sees what it's actually using.
 *
 * Same pattern Claude Agent SDK uses internally. Aligns with where
 * Anthropic tooling has been heading.
 *
 * ## What this commit ships (and what it does not)
 *
 * Ships:
 *   - The `ToolEnvironment` interface (host-supplied data + hooks).
 *   - A 9-tool surface — discovery + inspection + validation + cross-route.
 *   - The bounded agent loop (`maxToolRounds`, default 8).
 *   - Substring-fallback search for `findCapability` / `findComponent` so
 *     hosts work out-of-the-box with no semantic search wired.
 *   - `GeminiAgentClient` — a function-calling-aware Gemini client that
 *     reuses the same `apiKey`/model contract as `GeminiCompiler`.
 *   - Default-on production wiring in `apps/demo` + `apps/demo-github`
 *     (TODO P1.1, 2026-05-04). Opt-out via `ATELIER_COMPILER_TOOLS=off`
 *     when a host needs the deterministic single-shot path.
 *   - Composability with `ValidationFeedbackCompiler` (which wraps any
 *     `CompilerService` — including this one).
 *
 * Does NOT ship (deliberately, per Wave C "we do NOT do" guardrails):
 *   - Multi-agent orchestration. This is ONE agent that uses tools.
 *   - Per-component specialist agents. Component selection stays a single
 *     decision the agent makes.
 *   - Free-form agent-to-agent conversation loops.
 *   - Capability scoping pre-pass (C-3 / S-1) — that's the next commit.
 *   - Marketplace recipe RAG (C-5) — gated on V-6.
 */

import { ManifestSchema, type Capability, type Manifest } from '@atelier/schemas';
import {
  CompilerOutputError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';
import {
  fallbackFindCapability,
  fallbackFindComponent,
  slimRecipe,
  type CapabilityRef,
  type FindRecipeResult,
  type RecipeQueryLike,
  type RouteOutline,
  type SemanticSearch,
  type ToolEnvironment,
  type ToolValidationResult,
} from './tool-environment.js';
import { applyCapabilityResolver } from './capability-scoping.js';

/**
 * One LLM turn. The agent client is the seam between the wrapper's
 * orchestration (loop, tool dispatch, validation) and the model provider.
 * Tests inject a stub; production code uses `GeminiAgentClient`.
 */
export interface AgentClient {
  /** Stable id surfaced as part of `ToolUsingCompiler.id`. */
  readonly id: string;
  /** Run a single turn. Returns either tool calls OR final text. */
  generateTurn(req: AgentTurnRequest): Promise<AgentTurnResponse>;
}

export interface AgentTurnRequest {
  /** Conversation history so far. The wrapper appends turns and replays. */
  contents: readonly AgentContent[];
  /** Function declarations the model may invoke this turn. */
  tools: readonly AgentToolDeclaration[];
  /** System instruction (the shrunken C-2 prompt). */
  systemInstruction: string;
  /** Sampling temperature. Wrapper picks per-mode. */
  temperature: number;
  /** Optional abort signal. */
  signal?: AbortSignal;
}

/**
 * Conversation content. We keep this minimal and provider-agnostic so the
 * `AgentClient` can be Anthropic, OpenAI, or anything else later. The
 * `GeminiAgentClient` translates to/from Gemini's `Content`/`Part` shape.
 */
export type AgentContent =
  | { role: 'user'; text: string }
  | { role: 'model'; text: string }
  | { role: 'model'; toolCalls: readonly AgentToolCall[] }
  | { role: 'tool'; name: string; response: unknown };

export interface AgentToolCall {
  /** Provider-supplied id; echoed back on the tool response. */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentToolDeclaration {
  name: string;
  description: string;
  /** JSON-Schema describing the parameters object. */
  parameters: Record<string, unknown>;
}

export interface AgentTurnResponse {
  /** Tool calls the model wants to make. Mutually exclusive with `text`. */
  toolCalls?: readonly AgentToolCall[];
  /** Final text response. Wrapper parses this as JSON manifest. */
  text?: string;
  /** Tokens consumed this turn (prompt + response). 0 if unknown. */
  tokenCost: number;
  /** Provider model id (echoed into `CompileResult.model`). */
  model: string;
}

/**
 * Hook fired on every tool invocation. The wrapper passes the tool name,
 * the args, and the result the wrapper returned to the agent. Useful for
 * audit / observability — hosts wire this into their existing
 * `compile.budget_used` pipeline or a custom `compile.tool_call` event.
 *
 * Exceptions thrown from the hook are swallowed (mirrors
 * `ValidationFeedbackCompiler.onRetry`).
 */
export type ToolCallObserver = (call: { name: string; args: unknown }, result: unknown) => void;

export interface ToolUsingCompilerOptions {
  /** The agent client (typically `GeminiAgentClient`). */
  inner: AgentClient;
  /** Host-supplied data + hooks the tools resolve through. */
  env: ToolEnvironment;
  /** Optional vector / semantic search seam (C-5 RAG). */
  search?: SemanticSearch;
  /**
   * Hard cap on tool-call rounds before the wrapper aborts the loop and
   * throws `CompilerOutputError`. Default 8 — empirically enough for the
   * agent to discover, inspect, validate, and emit. Hosts that observe
   * compiles regularly bottoming out at the cap should investigate
   * (probably a too-broad capability set or a missing semantic search).
   */
  maxToolRounds?: number;
  /** Observer fired on each tool invocation. See `ToolCallObserver`. */
  onToolCall?: ToolCallObserver;
}

const DEFAULT_MAX_TOOL_ROUNDS = 8;

/**
 * The C-2 tool-using compiler. See module docstring for the architecture
 * overview and Wave C guardrails.
 */
export class ToolUsingCompiler implements CompilerService {
  readonly id: string;
  readonly #inner: AgentClient;
  readonly #env: ToolEnvironment;
  readonly #search: SemanticSearch | undefined;
  readonly #maxRounds: number;
  readonly #onToolCall: ToolCallObserver | undefined;

  constructor(opts: ToolUsingCompilerOptions) {
    this.#inner = opts.inner;
    this.#env = opts.env;
    this.#search = opts.search;
    this.#maxRounds = opts.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    this.#onToolCall = opts.onToolCall;
    this.id = `tool-using[${opts.inner.id}]`;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    const startedAt = Date.now();
    let totalTokens = 0;

    // Wave C / Phase C-3 — capability scoping pre-pass. When a resolver
    // is wired on the input, run it ONCE before the agent loop and
    // store the narrowed registry. The agent's `findCapability` /
    // `listCapabilities` tools route through this narrowed set so the
    // LLM only chooses among the ~30 most relevant capabilities. The
    // FULL registry is still kept on `#env.capabilities` so
    // `lookupCapability(id)` can resolve any id the resolver missed —
    // the agent broadens by id when it suspects scoping was too tight.
    const scopedCapabilities =
      input.capabilityResolver !== undefined
        ? await applyCapabilityResolver(input)
        : input.capabilities;
    const scopedRequest =
      scopedCapabilities !== input.capabilities ? { capabilities: scopedCapabilities } : undefined;

    const tools = this.#toolDeclarations();
    const contents: AgentContent[] = [{ role: 'user', text: buildAgentUserPrompt(input) }];
    const systemInstruction = AGENT_SYSTEM_PROMPT;
    const temperature = input.previousManifest !== undefined ? 0 : 0.2;

    // Diff-mode is a hint to the agent client (which model to pick); the
    // wrapper itself does not branch on diff mode beyond the temperature.
    const isDiff = input.previousManifest !== undefined;

    let lastModel = this.#inner.id;

    for (let round = 0; round <= this.#maxRounds; round++) {
      const turn = await this.#inner.generateTurn({
        contents,
        tools,
        systemInstruction,
        temperature,
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
      });
      totalTokens += Number.isFinite(turn.tokenCost) ? turn.tokenCost : 0;
      lastModel = turn.model;

      if (turn.toolCalls && turn.toolCalls.length > 0) {
        if (round === this.#maxRounds) {
          throw new CompilerOutputError(
            `ToolUsingCompiler exceeded maxToolRounds=${String(this.#maxRounds)} without emitting a final manifest`,
            { lastToolCalls: turn.toolCalls },
          );
        }
        // Echo the model's tool-call turn into history, then dispatch each
        // tool against the environment and append the responses.
        contents.push({ role: 'model', toolCalls: turn.toolCalls });
        for (const call of turn.toolCalls) {
          const result = await this.#dispatchTool(call, input, scopedRequest);
          this.#fireOnToolCall(call, result);
          contents.push({ role: 'tool', name: call.name, response: result });
        }
        continue;
      }

      // No tool calls — the model emitted a final answer.
      const text = turn.text ?? '';
      const manifest = parseFinalManifest(text);
      const validation = this.#validateFinalManifest(manifest);
      if (!validation.ok) {
        throw new CompilerOutputError(
          'ToolUsingCompiler: final manifest failed tool-environment validation',
          validation.reasons ?? [],
        );
      }
      return {
        manifest,
        token_cost: totalTokens,
        duration_ms: Date.now() - startedAt,
        model: lastModel,
        diff_mode: isDiff,
        reasoning: `tool-using compile, ${String(round + 1)} round(s)`,
      };
    }

    // Unreachable — the loop returns or throws on every iteration. Guard
    // for TypeScript flow analysis.
    throw new CompilerOutputError('ToolUsingCompiler exhausted loop (unreachable)', {
      contents,
    });
  }

  // ---------------------------------------------------------------------------
  // Tool dispatch — each tool is a thin wrapper around `ToolEnvironment`.

  async #dispatchTool(
    call: AgentToolCall,
    input: CompileInput,
    scopedRequest?: { capabilities: Readonly<Record<string, Capability>> },
  ): Promise<unknown> {
    const args = call.args ?? {};
    switch (call.name) {
      case 'lookupCapability':
        // `lookupCapability(id)` ALWAYS resolves against the full registry
        // — even when scoping is on. This is the explicit broaden-by-id
        // escape hatch documented in the C-3 contract. The agent learns
        // an id from `findCapability` (scoped) or guesses one (full
        // registry validates) and asks for the full schema here.
        return this.#lookupCapability(asString(args['id']));
      case 'findCapability':
        // `findCapability(intent)` routes through the scoped set when
        // C-3 scoping is on (the resolver already pre-picked the
        // top-N); otherwise falls through to the full registry +
        // substring fallback.
        return this.#findCapability(
          asString(args['intent']),
          asInt(args['k'], 5),
          scopedRequest?.capabilities,
        );
      case 'listCapabilities':
        // Same broaden semantics — `listCapabilities(filter)` shows the
        // full registry (filtered by domain/tag) so the agent can
        // explore beyond the scoped set when needed.
        return this.#listCapabilities(args['filter'] as { domain?: string; tag?: string });
      case 'findComponent':
        return this.#findComponent(asString(args['role']), asString(args['intent']));
      case 'inspectComponent':
        return this.#inspectComponent(asString(args['id']));
      case 'listComponents':
        return this.#listComponents(args['role'] as string | undefined);
      case 'validateDraft':
        return this.#validateDraft(args['draft'] as Manifest);
      case 'inspectExistingManifest':
        return this.#inspectExistingManifest(asString(args['route']) || input.route);
      case 'listSiblingRoutes':
        return this.#listSiblingRoutes();
      case 'findRecipe':
        return this.#findRecipe(args['query'], args['topN']);
      default:
        return { error: `unknown tool: ${call.name}` };
    }
  }

  /**
   * `findRecipe` — the C-5 retrieval tool. Routes through the host's
   * `recipeResolver`; returns a slim projection (id + description +
   * brand_kit_id + intent_surfaces + domain) so the agent's context
   * budget stays small. When no resolver is wired, returns an empty
   * result so the tool degrades gracefully (parallel to
   * `inspectExistingManifest` / `listSiblingRoutes`).
   */
  async #findRecipe(rawQuery: unknown, rawTopN: unknown): Promise<FindRecipeResult> {
    if (!this.#env.recipeResolver) return { recipes: [] };
    const query = (rawQuery && typeof rawQuery === 'object' ? rawQuery : {}) as RecipeQueryLike;
    const topN = asInt(rawTopN, 5);
    const merged: RecipeQueryLike = { ...query, topN };
    try {
      const result = await this.#env.recipeResolver.resolve(merged);
      const recipes = result.recipes.map((r) => slimRecipe(r));
      return result.scores ? { recipes, scores: result.scores } : { recipes };
    } catch {
      // Resolver failure must not poison the compile path. Surface a
      // benign empty result; the host's resolver-side observers handle
      // the failure (audit / alerting).
      return { recipes: [] };
    }
  }

  #lookupCapability(id: string): unknown {
    if (!id) return { error: 'lookupCapability: id is required' };
    const cap = this.#env.capabilities[id];
    return cap ?? { error: `unknown capability: ${id}` };
  }

  #findCapability(
    intent: string,
    k: number,
    scopedCapabilities?: Readonly<Record<string, Capability>>,
  ): readonly CapabilityRef[] {
    if (!intent) return [];
    // Wave C / Phase C-3 — when the wrapper has a pre-scoped set from a
    // `CompileInput.capabilityResolver` call, prefer it: the resolver
    // already picked the most relevant top-N for this route + intent,
    // and routing the agent's query through that subset is the entire
    // point of the two-stage compile.
    if (scopedCapabilities) {
      return fallbackFindCapability(scopedCapabilities, intent, k);
    }
    if (this.#search?.capabilities) return this.#search.capabilities(intent, k);
    return fallbackFindCapability(this.#env.capabilities, intent, k);
  }

  #listCapabilities(
    filter: { domain?: string; tag?: string } | undefined,
  ): readonly CapabilityRef[] {
    const out: CapabilityRef[] = [];
    for (const [id, cap] of Object.entries(this.#env.capabilities)) {
      if (filter?.domain) {
        // Capability ids look like `<domain>.<verb>` (e.g. `thread.archive`,
        // `github.issue.list`). Filter by leading segment.
        const head = id.split('.')[0];
        if (head !== filter.domain) continue;
      }
      if (filter?.tag) {
        const tags = (cap as { tags?: readonly string[] }).tags ?? [];
        if (!tags.includes(filter.tag)) continue;
      }
      const desc = (cap as { description?: string }).description;
      out.push(typeof desc === 'string' && desc.length > 0 ? { id, description: desc } : { id });
    }
    return out;
  }

  #findComponent(role: string, intent: string) {
    if (this.#search?.components) {
      return this.#search.components(`${role} ${intent}`.trim(), 5);
    }
    return fallbackFindComponent(this.#env.components, `${role} ${intent}`.trim(), 5);
  }

  #inspectComponent(id: string): unknown {
    if (!id) return { error: 'inspectComponent: id is required' };
    const found = this.#env.components.find((c) => (c as { id?: string }).id === id);
    return found ?? { error: `unknown component: ${id}` };
  }

  #listComponents(role: string | undefined) {
    // No structured `role` field on `ComponentDefinition`. The role hint is
    // a substring filter on id (e.g. `role: 'list'` matches `List`,
    // `IssueQueue`, etc.). Without a role, return id+description for every
    // component (cheap; the LLM filters mentally).
    const items = this.#env.components.map((c) => ({
      id: (c as { id?: string }).id,
      description: (c as { description?: string }).description,
    }));
    if (!role) return items;
    const r = role.toLowerCase();
    return items.filter((c) => (c.id ?? '').toLowerCase().includes(r));
  }

  #validateDraft(draft: Manifest | undefined): ToolValidationResult {
    if (!draft) return { ok: false, reasons: ['validateDraft: draft is required'] };
    if (!this.#env.validate) return { ok: true };
    return this.#env.validate(draft);
  }

  #validateFinalManifest(manifest: Manifest): ToolValidationResult {
    if (!this.#env.validate) return { ok: true };
    return this.#env.validate(manifest);
  }

  #inspectExistingManifest(route: string): Manifest | null {
    if (!this.#env.inspectExistingManifest) return null;
    return this.#env.inspectExistingManifest(route);
  }

  #listSiblingRoutes(): readonly RouteOutline[] {
    if (!this.#env.listSiblingRoutes) return [];
    return this.#env.listSiblingRoutes();
  }

  #fireOnToolCall(call: AgentToolCall, result: unknown): void {
    if (!this.#onToolCall) return;
    try {
      this.#onToolCall({ name: call.name, args: call.args ?? {} }, result);
    } catch {
      // A misbehaving subscriber must not poison the compile path. Same
      // policy as `ValidationFeedbackCompiler.onRetry`.
    }
  }

  // ---------------------------------------------------------------------------
  // Tool declarations — JSON-schema parameters surfaced to the LLM. Names
  // and descriptions are the marketplace's discoverability mechanism (per
  // ETHOS principle #11): the LLM picks tools by reading these.

  #toolDeclarations(): readonly AgentToolDeclaration[] {
    return TOOL_DECLARATIONS;
  }
}

const TOOL_DECLARATIONS: readonly AgentToolDeclaration[] = [
  {
    name: 'lookupCapability',
    description:
      'Fetch the full capability schema for a single capability id. Use after `findCapability` / `listCapabilities` narrows the candidate set.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Capability id, e.g. `thread.archive`.' } },
      required: ['id'],
    },
  },
  {
    name: 'findCapability',
    description:
      'Semantic search over capabilities by intent string. Returns up to `k` capability refs (id + description). Cheap; use it to discover what the host exposes before fetching a full schema.',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'Free-form intent, e.g. "archive a thread".' },
        k: {
          type: 'integer',
          description: 'Max results. Default 5, max 20.',
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'listCapabilities',
    description:
      'List capabilities, optionally filtered by domain (the leading id segment, e.g. "thread") or tag.',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            tag: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'findComponent',
    description:
      'Search components for a role + intent (e.g. role="list", intent="issue queue"). Returns up to 5 component definitions including descriptions and props_schema.',
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description:
            'Generic role hint, e.g. "list", "grid", "table", "leaf", "chrome", "modal".',
        },
        intent: { type: 'string', description: 'Free-form intent for the role.' },
      },
      required: ['role', 'intent'],
    },
  },
  {
    name: 'inspectComponent',
    description: 'Fetch the full component definition for a single id.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Component id, e.g. `Queue`.' } },
      required: ['id'],
    },
  },
  {
    name: 'listComponents',
    description:
      'List components in the catalog, optionally narrowed by a substring on the id (e.g. "list").',
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: 'Optional substring filter on component id.',
        },
      },
    },
  },
  {
    name: 'validateDraft',
    description:
      'Submit a manifest draft for policy / composition validation. Returns `{ ok, reasons? }`. ALWAYS call this before emitting your final answer; if `ok: false`, patch and validate again.',
    parameters: {
      type: 'object',
      properties: {
        draft: {
          type: 'object',
          description: 'The full Manifest JSON to validate.',
          additionalProperties: true,
        },
      },
      required: ['draft'],
    },
  },
  {
    name: 'inspectExistingManifest',
    description:
      'Inspect the manifest currently rendered for a route in this app. Returns `null` if the host does not track existing manifests or the route is fresh.',
    parameters: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'Route path. Defaults to the route being compiled if not supplied.',
        },
      },
    },
  },
  {
    name: 'listSiblingRoutes',
    description:
      'List sibling routes in this app (path + optional title/summary). Use to keep chrome and brand consistent across routes without compiling each one.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'findRecipe',
    description:
      'Retrieve top-N recipes matching the query (route + intent + domain + brand fit). Returns a slim projection (id, description, brand_kit_id, intent_surfaces, domain) — call this to ground composition on a known persona scaffold before drafting the manifest. Returns `{ recipes: [] }` when no recipe resolver is wired.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          description: 'Recipe query. All fields optional.',
          properties: {
            text: { type: 'string', description: 'Free-form description.' },
            domain: { type: 'string', description: 'Optional domain hint, e.g. "commerce".' },
            brandKitId: { type: 'string', description: 'Brand-fit signal.' },
            routeId: { type: 'string', description: 'Route being compiled.' },
          },
          additionalProperties: true,
        },
        topN: {
          type: 'integer',
          description: 'Max results. Default 5, max 20.',
          minimum: 1,
          maximum: 20,
        },
      },
    },
  },
];

// -----------------------------------------------------------------------------
// Prompt builders — the C-2 system prompt is much shorter than the cold C-0
// prompt because the LLM discovers what it needs via tools.

export const AGENT_SYSTEM_PROMPT = `You are Atelier's UI compiler, running as a tool-using agent.

Your job: produce a single Manifest JSON that satisfies the user's intent for one route, using the framework's components and the host's capabilities.

You have access to tools to discover what is available:
- lookupCapability(id) — fetch a single capability schema
- findCapability(intent, k?) — semantic search; returns up to k capability refs
- listCapabilities(filter?) — list with optional domain/tag filter
- findComponent(role, intent) — search components for a role + intent
- inspectComponent(id) — fetch the full component definition
- listComponents(role?) — list components (optionally substring-filtered)
- validateDraft(draft) — submit your manifest for policy validation
- inspectExistingManifest(route) — see what's currently rendered for a route
- listSiblingRoutes() — see other routes in this app for cross-route consistency
- findRecipe(query, topN?) — retrieve persona/recipe scaffolds matching query (route + intent + domain + brand)

Workflow:
1. Read the route + intent + brand kit from the user message.
2. Use the tools to discover relevant capabilities and components. Compose from baseline components when possible; pick custom bindings only when their description matches better than the baseline.
3. Draft a Manifest. ALWAYS call validateDraft(draft) before declaring it final. If validation returns reasons, patch the draft and validate again.
4. When validation passes, emit the FINAL MANIFEST as a JSON object — your reply text must be ONLY the manifest JSON, no prose, no fences. The wrapper parses this as your final answer.

Hard rules:
- Use only components from the catalog (via inspectComponent / findComponent).
- Use only capabilities the host registry exposes (via lookupCapability / findCapability).
- Honor the brand kit. Honor intent personalisation directives (density, modal_tolerance, etc.).
- Containers (Stack, Container, Card, Form) MUST have at least one child. Empty containers fail validation.
- Destructive actions need a ConfirmDialog; reversible actions need an UndoToast or a rollback Button somewhere in the route.
- Set compiled_from.compiler_model to your model id and compiled_from.compiled_at to the current ISO 8601 UTC timestamp.

Salience (Wave 7 / P-9): capabilities may declare salience_level ('high' | 'normal' | 'low'), and the user's intent profile may override via priority_overrides. The data resolver auto-emits emphasis:'high' on rows for high-salience bindings; you do NOT need to hand-emphasise. But compose hierarchy-respecting layouts — high-salience routes get top placement; high-salience rows trigger the Queue/List/Grid/Table's emphasis variant naturally. Bind high-salience capabilities to a salience-aware container (Queue/List/Grid/Table); other components have no surface for the per-row emphasis flag.

When you emit the final manifest, output ONLY the JSON object — no markdown fencing, no prose. The wrapper parses your reply as JSON.`;

/**
 * Build the user prompt for the agent loop. Carries route + intent + brand
 * + any few-shot example. Capabilities and components are NOT inlined —
 * the agent discovers them via tools. The few-shot example is included
 * because grounding the LLM in the host's vocabulary still pays for itself
 * even when the catalog is tool-discoverable.
 */
export function buildAgentUserPrompt(input: CompileInput): string {
  const lines: string[] = [];
  lines.push(`# Compile request`);
  lines.push(`route: ${input.route}`);
  lines.push(`user_id: ${input.user_id}`);
  lines.push(`app_id: ${input.app_id}`);
  if (input.trigger) {
    lines.push(`trigger: ${input.trigger.type}`);
  }
  lines.push('');

  if (input.intent) {
    lines.push('## Intent (this user’s preferences)');
    lines.push('```json');
    lines.push(JSON.stringify(input.intent, null, 2));
    lines.push('```');
    lines.push('');
  }

  if (input.brandKit) {
    lines.push('## Brand kit (mandatory; the policy engine will reject off-brand manifests)');
    lines.push('```json');
    lines.push(JSON.stringify(input.brandKit, null, 2));
    lines.push('```');
    lines.push('');
  }

  if (input.fewShotExample) {
    lines.push('## Few-shot example from this host (mirror the depth and richness)');
    lines.push('```json');
    lines.push(JSON.stringify(input.fewShotExample, null, 2));
    lines.push('```');
    lines.push('');
  }

  if (input.previousManifest) {
    lines.push('## Previous manifest (diff mode — produce only the changes for the trigger)');
    lines.push('```json');
    lines.push(JSON.stringify(input.previousManifest, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Wave C / Phase C-1 refinement input — the wrapping
  // `ValidationFeedbackCompiler` may thread `priorDraft` + `violations` in.
  // Surface them so the agent can self-correct on the first turn rather
  // than re-discovering the same issues via `validateDraft`.
  if (input.priorDraft && input.violations && input.violations.length > 0) {
    lines.push('## REFINEMENT MODE — your previous attempt failed validation; patch it');
    lines.push('### Violations to fix');
    for (const v of input.violations) lines.push(`- ${v}`);
    lines.push('');
    lines.push('### Your previous draft');
    lines.push('```json');
    lines.push(JSON.stringify(input.priorDraft, null, 2));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Your task');
  lines.push(
    `Produce a manifest for route "${input.route}". Discover the relevant capabilities and components via the tools, draft the manifest, validate it, and emit the FINAL MANIFEST JSON only.`,
  );
  return lines.join('\n');
}

/**
 * Parse the agent's final-answer text into a `Manifest`. Same auto-correct
 * + Zod validation as `GeminiCompiler` (manifest_id is server-generated).
 */
function parseFinalManifest(text: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // Some models still wrap the answer in ```json fences despite the
    // instruction. Strip and retry once.
    const stripped = text
      .replace(/^[\s`]*json/i, '')
      .replace(/```/g, '')
      .trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      throw new CompilerOutputError('ToolUsingCompiler: agent emitted non-JSON final answer', err);
    }
  }
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    (parsed as { manifest_id?: string }).manifest_id = generateManifestId();
  }
  try {
    return ManifestSchema.parse(parsed);
  } catch (err) {
    throw new CompilerOutputError(
      'ToolUsingCompiler: agent final answer failed Manifest schema validation',
      err,
    );
  }
}

function generateManifestId(): string {
  const ts = Date.now().toString(36).slice(-8);
  const rnd = Math.floor(Math.random() * 0xfffff)
    .toString(36)
    .padStart(4, '0');
  return `m_${ts}${rnd}`;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asInt(v: unknown, dflt: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  return dflt;
}
