export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonSchema = boolean | Record<string, unknown>;
export type Context = Readonly<Record<string, unknown>>;
export type MaybePromise<T> = T | Promise<T>;
export interface Subject {
  id: string;
  role: string;
  permissions: string[];
}
export interface CapabilityContract {
  id: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  fields?: string[];
  piiFields?: string[];
  requiredPermissions?: string[];
  risk?: 'read_only' | 'low' | 'sensitive' | 'destructive';
  confirmation?: 'none' | 'inline' | 'modal' | 'verbal_required';
  reversible?: boolean | 'unknown';
  securityReviewed?: boolean;
  preconditions?: unknown[];
  rollbackCapabilityId?: string;
}
export interface PresentationSection {
  id?: string;
  title: string;
  source: string;
  fields: string[];
  variant: 'facts' | 'metrics' | 'table' | 'timeline';
  componentId?: string;
}
export interface ScreenBundle {
  tenantId: string;
  projectId: string;
  slotId: string;
  environment: 'staging' | 'production';
  releaseId: string;
  bundleId: string;
  presentation: {
    title: string;
    description: string;
    layout: 'focus' | 'workbench' | 'comparison';
    sections: PresentationSection[];
    actions: { capabilityId: string; label: string }[];
    rationale?: string;
  };
  dataContracts: CapabilityContract[];
  actionContracts: CapabilityContract[];
  activation?: { role?: string };
  [key: string]: unknown;
}
export interface Resolution {
  bundle: ScreenBundle | null;
  publicKeys?: Record<string, string>;
  [key: string]: unknown;
}
export interface ActionArgs {
  slotId: string;
  releaseId: string;
  capability: string;
  context: Context;
  input?: Record<string, unknown>;
}
export interface BrowserHostClient {
  resolve(slotId: string, context: Context, signal?: AbortSignal): Promise<Resolution>;
  load(args: ActionArgs, signal?: AbortSignal): Promise<unknown>;
  confirm(args: ActionArgs, signal?: AbortSignal): Promise<{ ticket: string; expiresIn: number }>;
  dispatch(
    args: ActionArgs & { ticket: string },
    signal?: AbortSignal,
  ): Promise<{ result: unknown; replayed: boolean }>;
}
