import type { JsonSchema } from './common.js';
export interface ModelRequest {
  system: string;
  input: unknown;
  schema: JsonSchema;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  images?: { dataUrl: string }[];
}
export interface ModelResult {
  value: unknown;
  model: string;
  provider: string;
  durationMs: number;
  usage: { inputTokens?: number; outputTokens?: number };
  cacheHit?: boolean;
}
export interface JsonModelProvider {
  generate(request: ModelRequest): Promise<ModelResult>;
  completeJson(request: ModelRequest): Promise<unknown>;
}
export class ApiProvider implements JsonModelProvider {
  constructor(options: {
    kind: 'openai' | 'anthropic' | 'gemini' | 'openai-compatible';
    key: string;
    model: string;
    baseUrl?: string;
    allowedHosts?: string[];
    timeoutMs?: number;
    maxOutputTokens?: number;
  });
  generate(request: ModelRequest): Promise<ModelResult>;
  completeJson(request: ModelRequest): Promise<unknown>;
}
export class CliProvider implements JsonModelProvider {
  constructor(options: {
    kind: 'codex-cli' | 'claude-cli';
    model?: string;
    executable?: string;
    home?: string;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    maxBytes?: number;
    checkCapabilities?: boolean;
  });
  doctor(): Promise<{ provider: string; version: string; safetyFlags: string[] }>;
  generate(request: ModelRequest): Promise<ModelResult>;
  completeJson(request: ModelRequest): Promise<unknown>;
}
export const API_KINDS: string[];
export const DEFAULT_HOSTS: string[];
export class OutputValidationError extends Error {
  code: string;
  errors: string[];
  constructor(errors: string[]);
}
export function checkSchema(schema: JsonSchema): void;
export function validateOutput<T = unknown>(
  value: T,
  schema: JsonSchema,
  options?: { maxBytes?: number },
): T;
export function parseOutput(text: string, schema: JsonSchema): unknown;
