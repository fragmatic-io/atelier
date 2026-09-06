// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
export function mountArtifactFrame(
  element,
  preview,
  { title = 'Interactive artifact', onAction, onReady, onError, timeoutMs = 15000 } = {},
) {
  if (!element || typeof preview?.url !== 'string' || typeof preview.channel !== 'string')
    throw new Error('Scoped preview URL and channel required');
  const url = new URL(preview.url, location.href);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported preview origin');
  const iframe = document.createElement('iframe');
  iframe.title = title;
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.referrerPolicy = 'no-referrer';
  iframe.className = 'atelier-artifact-frame';
  let active = true,
    ready = false,
    count = 0;
  const seen = new Set(),
    timer = setTimeout(() => {
      if (active && !ready)
        onError?.(new Error('Preview initialization timed out. Refresh the artifact.'));
    }, timeoutMs);
  const listener = async (e) => {
    if (
      !active ||
      e.source !== iframe.contentWindow ||
      e.data?.atelier !== 1 ||
      e.data.channel !== preview.channel
    )
      return;
    const m = e.data;
    if (m.type === 'ready') {
      ready = true;
      clearTimeout(timer);
      onReady?.();
      return;
    }
    if (m.type === 'error') {
      onError?.(new Error(String(m.payload?.message ?? 'Artifact error').slice(0, 300)));
      return;
    }
    if (m.type !== 'action') return;
    const { requestId, capabilityId, input } = m.payload ?? {};
    if (
      typeof requestId !== 'string' ||
      requestId.length > 100 ||
      seen.has(requestId) ||
      seen.size >= 100 ||
      count >= 2
    )
      return;
    seen.add(requestId);
    count++;
    const reply = (p) => {
      if (active)
        iframe.contentWindow?.postMessage(
          {
            atelier: 1,
            channel: preview.channel,
            type: 'action-result',
            payload: { requestId, ...p },
          },
          '*',
        );
    };
    try {
      if (typeof onAction !== 'function')
        throw new Error('This preview has no authorized host executor');
      if (JSON.stringify(input).length > 32000) throw new Error('Action input too large');
      reply({ result: await onAction({ requestId, capabilityId, input }) });
    } catch (error) {
      reply({ error: String(error.message ?? 'Action failed').slice(0, 200) });
    } finally {
      count--;
    }
  };
  addEventListener('message', listener);
  element.replaceChildren(iframe);
  iframe.src = url.href;
  return {
    iframe,
    destroy() {
      active = false;
      clearTimeout(timer);
      removeEventListener('message', listener);
      iframe.remove();
      seen.clear();
    },
  };
}
