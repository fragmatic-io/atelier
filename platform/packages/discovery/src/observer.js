// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
(() => {
  'use strict';
  const script = document.currentScript;
  if (!script || script.dataset.atelierObserverMounted === 'true') return;
  script.dataset.atelierObserverMounted = 'true';
  const key = script.dataset.projectKey;
  if (!key) {
    console.error('[Atelier] data-project-key is required; observation was not started.');
    return;
  }
  const collector = new URL('/api/observe/v1/events', script.src).href;
  const environment = script.dataset.environment || 'production';
  let configuredRole = script.dataset.userRole || '';
  const safeValueFields = (script.dataset.safeSampleFields || '')
    .split(',')
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  const semanticSamples = script.dataset.semanticSamples === 'true';
  const storageKey = `atelier:observed:v1:${key.slice(0, 12)}`;
  const originalFetch = window.fetch.bind(window);
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  const xhrMetadata = Symbol('atelier-observation');
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch (error) {
    console.warn(
      '[Atelier] local observation cache is unavailable; server deduplication remains active:',
      error.message,
    );
  }
  const seen = new Set(Array.isArray(stored) ? stored : []);
  const secret =
    /password|secret|authorization|cookie|access.?token|refresh.?token|api.?key|cvv|ssn/i;
  const dynamic = /^(?:\d{4,}|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,}|[A-Za-z0-9_-]{24,})$/i;
  const piiPath = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d ()-]{8,}\d)/i;

  function shapeOf(value, depth = 0) {
    if (depth > 8) return {};
    if (value === null) return { type: 'null' };
    if (Array.isArray(value))
      return { type: 'array', items: value.length ? shapeOf(value[0], depth + 1) : {} };
    if (typeof value === 'object') {
      const properties = {};
      for (const [name, child] of Object.entries(value).slice(0, 100)) {
        if (!secret.test(name)) properties[name] = shapeOf(child, depth + 1);
      }
      return { type: 'object', properties, additionalProperties: false };
    }
    if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
    return { type: typeof value === 'boolean' ? 'boolean' : 'string' };
  }

  function semanticSample(value, path = '', depth = 0) {
    if (depth > 8) return '<redacted:depth>';
    if (value === null) return null;
    if (Array.isArray(value))
      return value.length ? [semanticSample(value[0], path, depth + 1)] : [];
    if (typeof value === 'object') {
      const output = {};
      for (const [name, child] of Object.entries(value).slice(0, 100)) {
        if (secret.test(name)) continue;
        const next = path ? `${path}.${name}` : name;
        output[name] =
          /email|phone|birth|address|postal|card.?number|first.?name|last.?name|full.?name/i.test(
            name,
          )
            ? '<redacted:pii>'
            : semanticSample(child, next, depth + 1);
      }
      return output;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      const size = Math.abs(value);
      return `<number:${size < 10 ? '0-10' : size < 100 ? '10-100' : size < 1000 ? '100-1000' : '1000+'}>`;
    }
    const string = String(value);
    if (/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d ()-]{8,}\d)/i.test(string))
      return '<redacted:pii>';
    if (dynamic.test(string)) return '<redacted:id>';
    const field = path.split('.').at(-1)?.toLowerCase();
    if (safeValueFields.includes(field) && string.length <= 40 && /^[A-Za-z0-9 _.-]+$/.test(string))
      return string;
    return `<string:${string.length < 16 ? 'short' : string.length < 80 ? 'medium' : 'long'}>`;
  }

  function route(value) {
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin) return null;
      return (
        '/' +
        url.pathname
          .split('/')
          .filter(Boolean)
          .map((part) => {
            let decoded = part;
            try {
              decoded = decodeURIComponent(part);
            } catch {
              return '{id}';
            }
            return dynamic.test(decoded) || piiPath.test(decoded) || decoded.length > 100
              ? '{id}'
              : decoded;
          })
          .join('/')
      );
    } catch {
      return null;
    }
  }

  async function requestValue(input, init) {
    const body =
      init?.body ??
      (input instanceof Request
        ? await input
            .clone()
            .text()
            .catch(() => '')
        : '');
    if (!body) return {};
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    }
    return body;
  }

  async function digest(value) {
    const canonical = JSON.stringify(value, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((name) => [name, item[name]]),
          )
        : item,
    );
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function transmit(event) {
    const fingerprint = await digest({
      method: event.method,
      path: event.path,
      inputSchema: event.inputSchema,
      outputSchema: event.outputSchema,
    });
    const pagePath = route(location.href);
    const deliveryKey = await digest({
      fingerprint,
      environment,
      userRole: configuredRole || null,
      pagePath,
    });
    if (seen.has(deliveryKey)) return;
    const payload = {
      events: [
        { ...event, fingerprint, environment, userRole: configuredRole || undefined, pagePath },
      ],
    };
    window.dispatchEvent(new CustomEvent('atelier:observation-preview', { detail: payload }));
    const response = await originalFetch(collector, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Atelier-Project-Key': key },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`collector returned ${response.status}`);
    seen.add(deliveryKey);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...seen].slice(-2000)));
    } catch (error) {
      console.warn('[Atelier] local observation cache could not be updated:', error.message);
    }
  }

  window.fetch = async function atelierObservedFetch(input, init) {
    const method = String(
      init?.method ?? (input instanceof Request ? input.method : 'GET'),
    ).toUpperCase();
    const path = route(input instanceof Request ? input.url : input);
    const response = await originalFetch(input, init);
    if (
      path &&
      !new URL(input instanceof Request ? input.url : input, location.href).href.startsWith(
        collector,
      )
    ) {
      Promise.all([
        requestValue(input, init),
        response
          .clone()
          .json()
          .catch(() => ({})),
      ])
        .then(([inputValue, outputValue]) =>
          transmit({
            method,
            path,
            status: response.status,
            inputSchema: shapeOf(inputValue),
            outputSchema: shapeOf(outputValue),
            ...(semanticSamples
              ? {
                  sample: {
                    input: semanticSample(inputValue),
                    output: semanticSample(outputValue),
                  },
                }
              : {}),
          }),
        )
        .catch((error) => console.warn('[Atelier] observation was not sent:', error.message));
    }
    return response;
  };

  XMLHttpRequest.prototype.open = function atelierObservedOpen(method, url, ...rest) {
    this[xhrMetadata] = { method: String(method).toUpperCase(), path: route(url) };
    return originalXhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function atelierObservedSend(body) {
    const metadata = this[xhrMetadata];
    if (metadata?.path) {
      this.addEventListener(
        'loadend',
        () => {
          let inputValue = {},
            outputValue = {};
          if (typeof body === 'string') {
            try {
              inputValue = JSON.parse(body);
            } catch {}
          }
          try {
            outputValue =
              this.responseType === 'json' ? this.response : JSON.parse(this.responseText || '{}');
          } catch {}
          transmit({
            ...metadata,
            status: this.status,
            inputSchema: shapeOf(inputValue),
            outputSchema: shapeOf(outputValue),
            ...(semanticSamples
              ? {
                  sample: {
                    input: semanticSample(inputValue),
                    output: semanticSample(outputValue),
                  },
                }
              : {}),
          }).catch((error) => console.warn('[Atelier] observation was not sent:', error.message));
        },
        { once: true },
      );
    }
    return originalXhrSend.call(this, body);
  };

  originalFetch(collector, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-Atelier-Project-Key': key },
    body: JSON.stringify({ heartbeat: true, environment, pagePath: route(location.href) }),
  }).catch((error) => console.warn('[Atelier] collector heartbeat failed:', error.message));

  window.AtelierObserver = Object.freeze({
    version: '1.0.0',
    collector,
    environment,
    semanticSamples,
    safeValueFields,
    setContext({ userRole } = {}) {
      if (userRole && !/^[a-z][a-z0-9_.:-]{0,79}$/i.test(userRole))
        throw new Error('userRole must be a non-personal cohort label');
      configuredRole = userRole || '';
    },
  });
})();
