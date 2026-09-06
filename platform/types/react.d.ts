import type { ReactNode, ReactElement } from 'react';
import type { BrowserHostClient, Context } from './common.js';
export * from './common.js';
export interface AtelierSlotProps {
  id: string;
  context?: Context;
  fallback?: ReactNode;
  className?: string;
  onError?: (error: unknown) => void;
  /** Labels the surface. Host owns drawer/modal chrome, opening, and focus trapping. */
  mode?: 'inline' | 'route' | 'drawer' | 'modal' | 'command';
}
export function AtelierProvider(props: {
  host: BrowserHostClient;
  children?: ReactNode;
}): ReactElement;
export function AtelierSlot(props: AtelierSlotProps): ReactElement;
export function AtelierRoute(props: AtelierSlotProps): ReactElement;
export function AtelierDrawerSlot(props: AtelierSlotProps): ReactElement;
export function AtelierModalSlot(props: AtelierSlotProps): ReactElement;
export function useAtelier(): BrowserHostClient;
