export interface PreviewGrant {
  url: string;
  channel: string;
  digest?: string;
  expiresIn?: number;
}

export function mountArtifactFrame(
  element: Element,
  preview: PreviewGrant,
  options?: {
    title?: string;
    onAction?: (input: {
      requestId: string;
      capabilityId: string;
      input: unknown;
    }) => Promise<unknown>;
    onReady?: () => void;
    onError?: (error: Error) => void;
    timeoutMs?: number;
  },
): { iframe: HTMLIFrameElement; destroy(): void };
