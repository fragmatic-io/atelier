// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  ConfirmationLevel,
  EventId,
  IsoDateTimeString,
  ManifestId,
  RateLimitString,
  SemverString,
} from '../src/common.ts';

describe('SemverString', () => {
  it('accepts canonical semver', () => {
    expect(SemverString.parse('2.1.0')).toBe('2.1.0');
    expect(SemverString.parse('0.0.1-rc.1')).toBe('0.0.1-rc.1');
    expect(SemverString.parse('1.0.0+build.42')).toBe('1.0.0+build.42');
  });

  it('rejects non-semver', () => {
    expect(() => SemverString.parse('v2.1')).toThrow();
    expect(() => SemverString.parse('latest')).toThrow();
    expect(() => SemverString.parse('2.1')).toThrow();
  });
});

describe('IsoDateTimeString', () => {
  it('accepts ISO 8601 with offset', () => {
    expect(IsoDateTimeString.parse('2026-04-29T12:00:00Z')).toBe('2026-04-29T12:00:00Z');
  });

  it('rejects naked dates', () => {
    expect(() => IsoDateTimeString.parse('2026-04-29')).toThrow();
  });
});

describe('ManifestId / EventId', () => {
  it('accepts canonical forms', () => {
    expect(ManifestId.parse('m_8f3a2b1c')).toBe('m_8f3a2b1c');
    expect(EventId.parse('evt_abc123')).toBe('evt_abc123');
  });

  it('rejects malformed prefixes', () => {
    expect(() => ManifestId.parse('manifest_abcdef12')).toThrow();
    expect(() => EventId.parse('event_abc123')).toThrow();
  });
});

describe('ConfirmationLevel', () => {
  it('accepts the four documented values', () => {
    for (const v of ['none', 'inline', 'modal', 'verbal_required'] as const) {
      expect(ConfirmationLevel.parse(v)).toBe(v);
    }
  });

  it('rejects unknown levels', () => {
    expect(() => ConfirmationLevel.parse('always')).toThrow();
  });
});

describe('RateLimitString', () => {
  it('accepts canonical forms', () => {
    expect(RateLimitString.parse('100/min/user')).toBe('100/min/user');
    expect(RateLimitString.parse('10/sec/global')).toBe('10/sec/global');
  });

  it('rejects malformed strings', () => {
    expect(() => RateLimitString.parse('100/minute/user')).toThrow();
    expect(() => RateLimitString.parse('100/min')).toThrow();
    expect(() => RateLimitString.parse('per-user')).toThrow();
  });
});
