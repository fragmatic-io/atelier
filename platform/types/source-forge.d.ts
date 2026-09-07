export interface SourceKitTask {
  name: string;
  steps: Array<{
    op: 'click' | 'fill' | 'select' | 'press';
    selector: string;
    value: string;
  }>;
  expect: { selector: string; text: string };
}

export interface SourceKit {
  id: string;
  name: string;
  target: 'react';
  description: string;
  source: string;
  css: string;
  modules: Record<string, string>;
  dataSchema: Record<string, unknown>;
  sampleData: unknown;
  actions: string[];
  grounding: 'bound' | 'generated' | 'static';
  tasks: SourceKitTask[];
}

export interface CompiledSource {
  digest: string;
  version: string;
  target: 'react';
  kit: SourceKit;
  projectVersion: string;
  tokens: Record<string, string>;
  javascript: string;
  executionContractHash: string;
  typeEvidence: { passed: boolean; [key: string]: unknown };
}

export const FORGE_VERSION: string;
export const SOURCE_KIT_SCHEMA: Record<string, unknown>;
export const MODEL_KIT_SCHEMA: Record<string, unknown>;
export const SOURCE_MODEL_SCHEMA: Record<string, unknown>;
export function decodeModelKit(value: Record<string, unknown>): SourceKit;
export function validateData<T>(value: T, schema: Record<string, unknown>): T;
export function compileSourceKit(
  kit: SourceKit,
  options?: {
    projectVersion?: string;
    approvedActions?: string[];
    tokens?: Record<string, string>;
  },
): Promise<CompiledSource>;
export function verifyCompilation(compiled: CompiledSource): CompiledSource;
export function sandboxDocument(
  compiled: CompiledSource,
  options?: {
    data?: unknown;
    state?: string;
    theme?: 'light' | 'dark';
    direction?: 'ltr' | 'rtl';
    channel?: string;
  },
): { html: string; csp: string; channel: string };
export function exportSourceKit(
  compiled: CompiledSource,
  directory: string,
): Promise<{ directory: string; files: Array<{ path: string; sha256: string }> }>;
export function verifyExport(directory: string): Promise<{ verified: number }>;
