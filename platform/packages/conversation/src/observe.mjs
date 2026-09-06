// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Opt-in development instrumentation. Existing client behavior is unchanged.
 * Records shapes only, never payload values, cookies, headers or real entity URLs. */
export function shapeOf(value, depth = 0) {
  if (depth > 7) return {};
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return { type: 'array', items: value.length ? shapeOf(value[0], depth + 1) : {} };
  }
  if (typeof value === 'object') {
    const properties = {};
    for (const [k, v] of Object.entries(value).slice(0, 100)) {
      if (/password|token|secret|cookie|authorization|api.?key/i.test(k)) continue;
      properties[k] = shapeOf(v, depth + 1);
    }
    return { type: 'object', properties, additionalProperties: false };
  }
  return {
    type:
      typeof value === 'number'
        ? Number.isInteger(value)
          ? 'integer'
          : 'number'
        : typeof value === 'boolean'
          ? 'boolean'
          : 'string',
  };
}
export function observeClient(call, { template, method = 'GET', record, enabled = false } = {}) {
  if (
    typeof call !== 'function' ||
    typeof record !== 'function' ||
    typeof template !== 'string' ||
    !template.startsWith('/') ||
    /[?#@\\]/.test(template)
  )
    throw new Error('Supply the client call, explicit redacted route template and recorder');
  return async function (...args) {
    const result = await call.apply(this, args);
    if (enabled) {
      const metadata = {
        method,
        path: template,
        inputSchema: shapeOf(args[0] ?? {}),
        outputSchema: shapeOf(result),
      };
      Promise.resolve()
        .then(() => record(metadata))
        .catch(() => {});
    }
    return result;
  };
}
