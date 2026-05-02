// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `GeminiAgentClient` — function-calling-aware Gemini client for the C-2
 * tool-using compiler. Sibling of `GeminiCompiler`: reuses the same
 * apiKey / model / abort-signal contract, but exposes `generateTurn`
 * instead of `compile`. The wrapper (`ToolUsingCompiler`) drives the agent
 * loop; this client owns just one turn.
 *
 * Per the Wave C C-2 design (option B in the TODO): keeping the
 * tool-using path on its own class makes both the legacy single-shot path
 * and the new agent path easier to evolve and test independently.
 */

import { GoogleGenAI, type GenerateContentConfig, type Part } from '@google/genai';
import { CompilerUnavailableError } from './types.js';
import type {
  AgentClient,
  AgentContent,
  AgentToolCall,
  AgentToolDeclaration,
  AgentTurnRequest,
  AgentTurnResponse,
} from './tool-using-compiler.js';

export interface GeminiAgentClientOptions {
  apiKey: string;
  /** Cold-compile model. Default 'gemini-2.5-pro'. */
  coldModel?: string;
  /**
   * Diff-mode model. Default 'gemini-2.5-flash'. The agent loop uses this
   * when the wrapper signals diff mode (temperature: 0).
   */
  diffModel?: string;
  /** Optional override of the underlying client (for tests). */
  client?: GoogleGenAI;
}

const DEFAULT_COLD_MODEL = 'gemini-2.5-pro';
const DEFAULT_DIFF_MODEL = 'gemini-2.5-flash';

export class GeminiAgentClient implements AgentClient {
  readonly id: string;
  readonly #client: GoogleGenAI;
  readonly #coldModel: string;
  readonly #diffModel: string;

  constructor(opts: GeminiAgentClientOptions) {
    if (!opts.apiKey) {
      throw new CompilerUnavailableError('GeminiAgentClient requires an apiKey');
    }
    this.#client = opts.client ?? new GoogleGenAI({ apiKey: opts.apiKey });
    this.#coldModel = opts.coldModel ?? DEFAULT_COLD_MODEL;
    this.#diffModel = opts.diffModel ?? DEFAULT_DIFF_MODEL;
    this.id = `gemini-agent[${this.#coldModel},${this.#diffModel}]`;
  }

  async generateTurn(req: AgentTurnRequest): Promise<AgentTurnResponse> {
    // Diff vs cold: temperature 0 is the wrapper's signal we're refining /
    // diffing — route to the cheaper flash model. Temperature 0.2 is a
    // cold compile — use the heavier pro model.
    const model = req.temperature === 0 ? this.#diffModel : this.#coldModel;

    const config: GenerateContentConfig = {
      systemInstruction: req.systemInstruction,
      temperature: req.temperature,
      tools: [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.parameters,
          })),
        },
      ],
    };
    if (req.signal !== undefined) config.abortSignal = req.signal;

    const response = await this.#client.models.generateContent({
      model,
      contents: req.contents.map(toGeminiContent),
      config,
    });

    const tokenCost =
      (response.usageMetadata?.promptTokenCount ?? 0) +
      (response.usageMetadata?.candidatesTokenCount ?? 0);

    // Gemini surfaces tool calls via `response.functionCalls` (a getter
    // that scans the candidate's parts). When the model wants tool calls,
    // it emits ONE turn with N function-call parts and no text. When it
    // wants to answer, it emits text and no function calls.
    const fcs = response.functionCalls;
    if (fcs && fcs.length > 0) {
      const toolCalls: AgentToolCall[] = fcs.map((fc) => {
        const out: AgentToolCall = {
          name: fc.name ?? '<unnamed>',
          args: fc.args ?? {},
        };
        if (fc.id !== undefined) out.id = fc.id;
        return out;
      });
      return { toolCalls, tokenCost, model };
    }

    return {
      text: response.text ?? '',
      tokenCost,
      model,
    };
  }
}

/**
 * Translate the wrapper's provider-agnostic `AgentContent` into Gemini's
 * `Content` shape. Tool responses become `functionResponse` parts; tool
 * calls become `functionCall` parts.
 */
function toGeminiContent(c: AgentContent): { role: string; parts: Part[] } {
  if (c.role === 'user') {
    return { role: 'user', parts: [{ text: c.text }] };
  }
  if (c.role === 'tool') {
    // Gemini expects tool responses on `role: 'user'` with a
    // `functionResponse` part whose `name` matches the original call.
    return {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: c.name,
            response: { output: c.response },
          },
        },
      ],
    };
  }
  // role === 'model' — either text or tool calls
  if ('toolCalls' in c) {
    return {
      role: 'model',
      parts: c.toolCalls.map((tc) => ({
        functionCall: {
          name: tc.name,
          args: tc.args,
        },
      })),
    };
  }
  return { role: 'model', parts: [{ text: c.text }] };
}

/** Re-export types referenced by the declaration above (tool-declaration shape). */
export type { AgentToolDeclaration };
