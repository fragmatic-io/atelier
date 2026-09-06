// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import https from 'node:https';
import http from 'node:http';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export class ProviderError extends Error {
  constructor(
    code,
    message,
    { retryable = false, retryAfterMs = 0, status = 0, sent = false } = {},
  ) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
    this.sent = sent;
  }
}
export function publicAddress(address) {
  let a = address.toLowerCase();
  if (a.startsWith('::ffff:')) {
    a = a.slice(7);
    if (a.includes(':')) {
      const parts = a.split(':');
      if (parts.length !== 2) return false;
      const n = parseInt(parts[0], 16) * 65536 + parseInt(parts[1], 16);
      a = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    }
  }
  if (isIP(a) === 4) {
    const [x, y] = a.split('.').map(Number);
    return !(
      x === 0 ||
      x === 10 ||
      x === 127 ||
      x >= 224 ||
      (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 168) ||
      (x === 100 && y >= 64 && y <= 127) ||
      (x === 198 && (y === 18 || y === 19))
    );
  }
  if (isIP(a) === 6)
    return !(
      a === '::' ||
      a === '::1' ||
      a.startsWith('fc') ||
      a.startsWith('fd') ||
      a.startsWith('fe8') ||
      a.startsWith('fe9') ||
      a.startsWith('fea') ||
      a.startsWith('feb') ||
      a.startsWith('ff') ||
      a.startsWith('2001:db8')
    );
  return false;
}
/** DNS is validated then pinned into the TLS request to avoid a second-lookup race. */
export async function requestJson(
  url,
  {
    body,
    headers = {},
    allowedHosts = [],
    timeoutMs = 90000,
    maxBytes = 2 * 1024 * 1024,
    signal,
    allowLoopbackForTests = false,
    lookup = dnsLookup,
  } = {},
) {
  const u = new URL(url);
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  if (u.username || u.password || u.hash || !allowedHosts.includes(hostname))
    throw new ProviderError('EGRESS_DENIED', 'Provider host is not on the operator allowlist');
  if ((u.protocol !== 'https:' || (u.port && u.port !== '443')) && !allowLoopbackForTests)
    throw new ProviderError('EGRESS_DENIED', 'Providers must use HTTPS on port 443');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(
      (x) =>
        !publicAddress(x.address) &&
        !(allowLoopbackForTests && ['127.0.0.1', '::1'].includes(x.address)),
    )
  )
    throw new ProviderError('EGRESS_DENIED', 'Provider resolves to a private or reserved address');
  const payload = Buffer.from(JSON.stringify(body));
  if (payload.length > 4 * 1024 * 1024)
    throw new ProviderError('INPUT_TOO_LARGE', 'Provider request exceeds 4 MB');
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError('ABORTED', 'Model request cancelled'));
    const transport = u.protocol === 'https:' ? https : http;
    let settled = false;
    let sent = false;
    const done = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      err ? reject(err) : resolve(value);
    };
    const abort = () =>
      req.destroy(new ProviderError('ABORTED', 'Model request cancelled', { sent }));
    const req = transport.request(
      u,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'content-length': String(payload.length),
        },
        lookup: (_host, opts, cb) =>
          opts?.all ? cb(null, addresses) : cb(null, addresses[0].address, addresses[0].family),
      },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
          if (bytes > maxBytes) {
            req.destroy(
              new ProviderError('OUTPUT_TOO_LARGE', 'Provider output exceeded its limit', {
                sent: true,
              }),
            );
            return;
          }
          chunks.push(c);
        });
        res.on('error', (err) =>
          done(
            err instanceof ProviderError
              ? err
              : new ProviderError('NETWORK_ERROR', 'Model response stream failed', {
                  sent: true,
                  retryable: true,
                }),
          ),
        );
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const retryable = res.statusCode === 429 || res.statusCode >= 500;
            const retryAfterMs = Math.min(
              10000,
              Math.max(0, Number(res.headers['retry-after'] ?? 0) * 1000),
            );
            return done(
              new ProviderError(
                `HTTP_${res.statusCode}`,
                `Provider returned HTTP ${res.statusCode}`,
                { status: res.statusCode, retryable, retryAfterMs, sent: true },
              ),
            );
          }
          try {
            done(null, JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            done(
              new ProviderError('INVALID_RESPONSE', 'Provider did not return JSON', { sent: true }),
            );
          }
        });
      },
    );
    const timer = setTimeout(
      () =>
        req.destroy(
          new ProviderError('TIMEOUT', 'Model request exceeded its deadline', {
            retryable: true,
            sent,
          }),
        ),
      timeoutMs,
    );
    signal?.addEventListener('abort', abort, { once: true });
    req.on('error', (err) =>
      done(
        err instanceof ProviderError
          ? err
          : new ProviderError('NETWORK_ERROR', 'Model connection failed', {
              retryable: true,
              sent,
            }),
      ),
    );
    req.end(payload, () => {
      sent = true;
    });
  });
}
