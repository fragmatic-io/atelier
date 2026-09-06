import type {
  Context,
  MaybePromise,
  ScreenBundle,
  PresentationSection,
  CapabilityContract,
} from './common.js';
export * from './common.js';
export function mountSurface(
  root: Element,
  bundle: ScreenBundle,
  options?: {
    context?: Context;
    exampleState?: 'loading' | 'empty' | 'error' | 'ready' | null;
    load?: (capability: string, context: Context, signal: AbortSignal) => MaybePromise<unknown>;
    dispatch?: (
      capability: string,
      input: Record<string, unknown>,
      metadata: { confirmed: true; signal: AbortSignal; bundleId: string },
    ) => MaybePromise<unknown>;
    components?: Record<
      string,
      (props: { data: unknown; section: PresentationSection; context: Context }) => Node
    >;
  },
): { refresh(): Promise<unknown[]>; dispose(): void };
export function collectAction(
  contract: CapabilityContract,
  context?: Context,
  label?: string,
): Promise<{ input: Record<string, unknown>; confirmed: true; phrase?: string } | null>;
export function exampleData(bundle: ScreenBundle): Record<string, unknown>;
export function escapeHtml(value: unknown): string;
export function humanize(value: unknown): string;

export function readField(value: unknown, path: string): unknown;
export function formatValue(value: unknown, field?: string): string;
