import type { SourceQualityContract } from './source-quality.js';


export type DesignRole = 'root' | 'button' | 'input' | 'card' | 'nav';
export type DesignProperty =
  | 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight'
  | 'color' | 'backgroundColor' | 'borderColor' | 'borderRadius'
  | 'paddingBlock' | 'paddingInline' | 'height' | 'gap' | 'boxShadow';

export interface ComponentDesignContract {
  id: string;
  version: string;
  dataBound: boolean;
  roles: DesignRole[];
  states: Array<'ready' | 'loading' | 'empty' | 'error' | 'disabled' | 'success'>;
  interaction: {
    keyboard: true;
    focusVisible: true;
    accessibleName: true;
    actions: string[];
  };
  taste: { tokenNames: string[]; patternNames: string[] };
}

export interface DesignContext {
  version: 1;
  projectVersion: string;
  contractFingerprint: string | null;
  tokens: Record<string, string>;
  roles: Partial<Record<DesignRole, Partial<Record<DesignProperty, string>>>>;
  viewport: { bucket: 'mobile' | 'tablet' | 'desktop'; colorScheme: 'light' | 'dark' } | null;
  guidance: Record<string, unknown> | null;
  componentContracts: ComponentDesignContract[];
  hash: string;
}

export interface SourceRenderContext {
  readonly designContext: Readonly<DesignContext>;
  readonly tokens: Readonly<Record<string, string>>;
  readonly qualityContract: Readonly<SourceQualityContract> | null;
  readonly theme: 'light' | 'dark';
  readonly direction: 'ltr' | 'rtl';
}

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
  designContext: DesignContext;
  qualityContract: SourceQualityContract | null;
  javascript: string;
  executionContractHash: string;
  typeEvidence: { passed: boolean; [key: string]: unknown };
}

export const FORGE_VERSION: string;
export const DESIGN_CONTEXT_VERSION: 1;
export const COMPONENT_DESIGN_CONTRACT_SCHEMA: Record<string, unknown>;
export const SOURCE_KIT_SCHEMA: Record<string, unknown>;
export const MODEL_KIT_SCHEMA: Record<string, unknown>;
export const SOURCE_MODEL_SCHEMA: Record<string, unknown>;
export function decodeModelKit(value: Record<string, unknown>): SourceKit;
export function validateData<T>(value: T, schema: Record<string, unknown>): T;
export function resolveDesignContext(options?: {
  model?: {
    projectVersion?: string;
    designGenome?: { hardTokens?: { all?: Record<string, string> } };
    capabilities?: Array<{ id: string; securityReviewed?: boolean }>;
  };
  approvedContract?: {
    roles: DesignContext['roles'];
    viewport?: NonNullable<DesignContext['viewport']>;
    [key: string]: unknown;
  } | null;
  approvedSynthesis?: Record<string, unknown> | null;
  componentContracts?: ComponentDesignContract[];
}): DesignContext;
export function assertDesignContext(value: DesignContext): DesignContext;
export function compileSourceKit(
  kit: SourceKit,
  options?: {
    projectVersion?: string;
    approvedActions?: string[];
    tokens?: Record<string, string>;
    designContext?: DesignContext | null;
    qualityContract?: SourceQualityContract | null;
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
