// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Distributed `TriggerBus` backed by NATS pub/sub. Wave 10 / S-4 (optional).
 *
 * Sibling of `RedisTriggerBus`. Same envelope, same self-echo discipline,
 * same minimal-shape dependency strategy — only the wire shape changes:
 * NATS uses *subjects* instead of channels, organised dotted-style.
 *
 * Subject naming:
 *   `<prefix>.triggers.<app_id>`, default prefix `atelier`. Each instance
 *   subscribes to the subject for its app on construction; `emit()` publishes
 *   the trigger envelope to that subject; the subscription's async iterator
 *   parses each frame and re-emits onto the in-process bus.
 *
 * Wire envelope (one Trigger per message, JSON):
 *
 *   { "v": 1,
 *     "origin": "<random-uuid>",
 *     "trigger": { "type": "capability.changed",
 *                  "app_id": "mail.example.com",
 *                  "capability_id": "thread.archive",
 *                  "old_v": "1.0.0",
 *                  "new_v": "2.0.0" } }
 *
 * Dependency strategy:
 *   We do NOT take a hard `nats` dependency. The bus accepts any client
 *   implementing the minimal `NATSLikeConnection` shape — the official
 *   `nats.js` `NatsConnection` satisfies it. Hosts wire concrete connections
 *   in their services bag.
 *
 * Lifecycle:
 *   const bus = new NATSTriggerBus({ connection, appId: 'mail.example.com' });
 *   await bus.start();             // opens the subscription
 *   await bus.emit(trigger);       // publishes
 *   bus.subscribe('*', handler);   // local listeners (cache invalidator, etc.)
 *   await bus.close();             // unsubscribes + drains; idempotent
 */

import type { Trigger } from '@atelier/schemas';
import type { Unsubscribe } from '../types.js';
import { InMemoryTriggerBus } from './memory-bus.js';
import {
  type WILDCARD_TRIGGER_TYPE,
  type TriggerHandler,
  type TriggerSubscription,
} from './subscription.js';

/** Minimal NATS message shape consumed from a subscription iterator. */
export interface NATSLikeMessage {
  /** Subject the message arrived on. */
  readonly subject: string;
  /**
   * Raw payload bytes. NATS clients ship a `Uint8Array`. We accept either a
   * `Uint8Array` or a `string` (some test fakes / wrappers use strings).
   */
  readonly data: Uint8Array | string;
  /**
   * Optional decoder — `nats.js` exposes `msg.string()` as a convenience.
   * If present we prefer it over decoding `data` ourselves.
   */
  string?(): string;
}

/** Minimal NATS subscription handle (async iterable of messages). */
export interface NATSLikeSubscription extends AsyncIterable<NATSLikeMessage> {
  /** Cancel the subscription. The async iterator completes after this. */
  unsubscribe(): void;
}

/** Minimal NATS connection shape. The official `nats.js` `NatsConnection` matches. */
export interface NATSLikeConnection {
  /** Publish raw bytes (or a string) to a subject. */
  publish(subject: string, data: Uint8Array | string): void;
  /** Open a subscription to a subject. */
  subscribe(subject: string): NATSLikeSubscription;
}

/** Default subject prefix. Final subject = `<prefix>.triggers.<app_id>`. */
export const DEFAULT_NATS_SUBJECT_PREFIX = 'atelier';

/** Current envelope schema version. Mirrors the Redis envelope. */
export const NATS_TRIGGER_ENVELOPE_VERSION = 1 as const;

/** Wire envelope shape. Documented in the module header. */
export interface NATSTriggerEnvelope {
  v: typeof NATS_TRIGGER_ENVELOPE_VERSION;
  origin: string;
  trigger: Trigger;
}

export interface NATSTriggerBusOptions {
  /** NATS connection. */
  connection: NATSLikeConnection;
  /** App scope for subject naming. */
  appId: string;
  /** Optional subject prefix. Defaults to `atelier`. */
  subjectPrefix?: string;
  /** Optional opaque id for this instance. Used to drop self-echoes. */
  originId?: string;
  /** Called when a local handler throws. Defaults to a no-op. */
  onError?: (err: unknown, event: Trigger) => void;
  /** Called when a malformed inbound frame is dropped. Defaults to silent. */
  onParseError?: (raw: string, err: unknown) => void;
}

function defaultOriginId(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  return `origin-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function decode(msg: NATSLikeMessage): string {
  if (typeof msg.string === 'function') {
    try {
      return msg.string();
    } catch {
      // Fall through to manual decode.
    }
  }
  if (typeof msg.data === 'string') return msg.data;
  // Decode UTF-8 bytes. `TextDecoder` is universally available (Node 18+, all browsers).
  return new TextDecoder('utf-8').decode(msg.data);
}

export class NATSTriggerBus implements TriggerSubscription {
  readonly #connection: NATSLikeConnection;
  readonly #appId: string;
  readonly #subject: string;
  readonly #origin: string;
  readonly #onParseError: ((raw: string, err: unknown) => void) | undefined;
  readonly #local: InMemoryTriggerBus;
  #subscription: NATSLikeSubscription | null = null;
  #pump: Promise<void> | null = null;
  #started = false;
  #closed = false;

  constructor(opts: NATSTriggerBusOptions) {
    this.#connection = opts.connection;
    this.#appId = opts.appId;
    const prefix = opts.subjectPrefix ?? DEFAULT_NATS_SUBJECT_PREFIX;
    this.#subject = `${prefix}.triggers.${opts.appId}`;
    this.#origin = opts.originId ?? defaultOriginId();
    this.#onParseError = opts.onParseError;
    this.#local = new InMemoryTriggerBus(opts.onError ? { onError: opts.onError } : {});
  }

  /** App id this bus is scoped to. */
  get appId(): string {
    return this.#appId;
  }

  /** Subject resolved at construction. Useful for logging and tests. */
  get subject(): string {
    return this.#subject;
  }

  /** Origin id used to drop self-echoes. */
  get originId(): string {
    return this.#origin;
  }

  /**
   * Open the NATS subscription and start pumping messages onto the local
   * bus. Idempotent. Must be awaited before cross-process triggers route
   * here (local listeners still work either way).
   */
  async start(): Promise<void> {
    if (this.#started || this.#closed) return;
    this.#started = true;
    this.#subscription = this.#connection.subscribe(this.#subject);
    this.#pump = this.#consume(this.#subscription);
    // The pump drains in the background; we don't await it here.
    await Promise.resolve();
  }

  /** Local subscribe — same semantics as `InMemoryTriggerBus`. */
  subscribe(
    eventType: Trigger['type'] | typeof WILDCARD_TRIGGER_TYPE,
    handler: TriggerHandler,
  ): Unsubscribe {
    return this.#local.subscribe(eventType, handler);
  }

  /**
   * Publish a trigger to every subscriber of the subject (including other
   * processes) AND fan out to local listeners. Self-echoes are dropped on
   * the inbound path via `origin` so listeners never run twice.
   */
  async emit(event: Trigger): Promise<void> {
    if (this.#closed) return;
    const envelope: NATSTriggerEnvelope = {
      v: NATS_TRIGGER_ENVELOPE_VERSION,
      origin: this.#origin,
      trigger: event,
    };
    const frame = JSON.stringify(envelope);
    await this.#local.emit(event);
    this.#connection.publish(this.#subject, frame);
  }

  /**
   * Unsubscribe and stop the pump. Idempotent. After close, `emit()` is a
   * no-op.
   */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#subscription) {
      try {
        this.#subscription.unsubscribe();
      } catch {
        // Best-effort — connection may already be torn down.
      }
    }
    if (this.#pump) {
      try {
        await this.#pump;
      } catch {
        // The pump should not throw, but if it does we still want close to resolve.
      }
    }
  }

  /** Total local subscriber count across typed + wildcard buckets. */
  subscriberCount(): number {
    return this.#local.subscriberCount();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  async #consume(subscription: NATSLikeSubscription): Promise<void> {
    try {
      for await (const msg of subscription) {
        if (this.#closed) break;
        if (msg.subject !== this.#subject) continue;
        const raw = decode(msg);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          this.#onParseError?.(raw, err);
          continue;
        }
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          (parsed as { v?: unknown }).v !== NATS_TRIGGER_ENVELOPE_VERSION
        ) {
          this.#onParseError?.(raw, new Error('not a v1 trigger envelope'));
          continue;
        }
        const env = parsed as Partial<NATSTriggerEnvelope>;
        if (env.origin === this.#origin) continue;
        const trig = env.trigger;
        if (
          !trig ||
          typeof trig !== 'object' ||
          typeof (trig as { type?: unknown }).type !== 'string'
        ) {
          this.#onParseError?.(raw, new Error('envelope missing trigger payload'));
          continue;
        }
        await this.#local.emit(trig);
      }
    } catch {
      // Iterator errors mean the subscription is gone; nothing else to do.
    }
  }
}
