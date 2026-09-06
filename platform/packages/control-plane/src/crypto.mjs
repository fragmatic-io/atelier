// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import {
  scrypt as scryptCallback,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from 'node:crypto';
import { promisify } from 'node:util';
import { assert, same, token, hash } from './util.mjs';
const scrypt = promisify(scryptCallback);
export async function passwordHash(password) {
  assert(
    typeof password === 'string' && password.length >= 12 && password.length <= 256,
    400,
    'WEAK_PASSWORD',
    'Use a password of 12–256 characters',
  );
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return `scrypt$65536$8$1$${salt}$${key.toString('hex')}`;
}
export async function passwordMatches(password, encoded) {
  try {
    const [alg, n, r, p, salt, key] = String(encoded).split('$');
    if (
      alg !== 'scrypt' ||
      Number(n) !== 65536 ||
      Number(r) !== 8 ||
      Number(p) !== 1 ||
      key.length !== 128
    )
      return false;
    if (typeof password !== 'string' || password.length > 256) return false;
    const out = await scrypt(password, salt, 64, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * 1024 * 1024,
    });
    return same(out.toString('hex'), key);
  } catch {
    return false;
  }
}
export class SecretBox {
  constructor({ keys, activeKeyId }) {
    assert(
      keys && keys[activeKeyId],
      500,
      'MASTER_KEY_MISSING',
      'An active encryption key is required',
    );
    this.keys = Object.fromEntries(
      Object.entries(keys).map(([k, v]) => {
        const b = Buffer.isBuffer(v) ? v : Buffer.from(v, 'base64');
        assert(
          b.length === 32,
          500,
          'INVALID_MASTER_KEY',
          'Encryption keys must be exactly 32 bytes',
        );
        return [k, b];
      }),
    );
    this.activeKeyId = activeKeyId;
  }
  seal(value, aad) {
    assert(
      typeof aad === 'string' && aad.length > 0,
      500,
      'AAD_REQUIRED',
      'Secret scope is required',
    );
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys[this.activeKeyId], iv);
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return JSON.stringify({
      v: 1,
      kid: this.activeKeyId,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      value: encrypted.toString('base64url'),
    });
  }
  open(encoded, aad) {
    try {
      const e = JSON.parse(encoded);
      assert(
        e.v === 1 && this.keys[e.kid],
        500,
        'SECRET_KEY_UNKNOWN',
        'The encryption key is unavailable',
      );
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.keys[e.kid],
        Buffer.from(e.iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(e.tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(e.value, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw Object.assign(new Error('Secret cannot be decrypted in this scope'), {
        code: 'SECRET_DECRYPTION_FAILED',
        status: 500,
      });
    }
  }
  rewrap(encoded, aad) {
    return this.seal(this.open(encoded, aad), aad);
  }
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0,
    v = 0,
    out = '';
  for (const b of bytes) {
    v = (v << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(v >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += ALPHABET[(v << (5 - bits)) & 31];
  return out;
}
function unbase32(s) {
  let bits = 0,
    v = 0,
    out = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const x = ALPHABET.indexOf(c);
    if (x < 0) throw new Error('Invalid base32');
    v = (v << 5) | x;
    bits += 5;
    if (bits >= 8) {
      out.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32(randomBytes(20));
export function totp(secret, counter) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', unbase32(secret)).update(b).digest();
  const off = h[h.length - 1] & 15;
  return String((h.readUInt32BE(off) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function verifyTotp(secret, code, { now = Date.now(), lastCounter = -1 } = {}) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const c = Math.floor(now / 30000);
  for (const i of [c, c - 1, c + 1]) if (i > lastCounter && same(totp(secret, i), code)) return i;
  return null;
}
export function recoveryCodes() {
  const codes = Array.from({ length: 8 }, () => randomBytes(8).toString('hex'));
  return { codes, hashes: codes.map(hash) };
}
export const newApiToken = () => `atk_${token()}`;
