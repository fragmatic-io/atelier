// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Distributed `TriggerBus` backed by Redis pub/sub. Wave 10 / S-4.
 *
 * Why this exists:
 *   `InMemoryTriggerBus` is process-local. Once a host fans out across
 *   multiple instances (multi-region, autoscaled containers, …), a trigger
 *   emitted by one process must reach every other process so each can
 *   invalidate its local manifest cache. Redis pub/sub is the simplest
 *   transport that satisfies that.
 *
 * Channel naming:
 *   `<prefix>:triggers:<app_id>`, default prefix `atelier`. Each instance
 *   subscribes to the channel for its app on construction; `emit()` publishes
 *   the trigger envelope to that channel; the subscriber callback parses the
 *   envelope and re-emits onto the in-process bus, which fans out to local
 *   listeners and the cache invalidator.
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
 *   `v`        — envelope schema version. Currently `1`. Bump on breaking
 *                shape changes; readers ignore unknown versions.
 *   `origin`   — opaque per-instance id assigned at construction. Used to
 *                drop self-published echoes so a process doesn't re-fan-out
 *                its own emit (Redis pub/sub redelivers to all subscribers,
 *                including the publisher).
 *   `trigger`  — the `Trigger` payload itself.
 *
 * Dependency strategy:
 *   We do NOT take a hard `ioredis` / `node-redis` dependency. The bus
 *   accepts any client implementing the minimal `RedisLikePublisher` and
 *   `RedisLikeSubscriber` shapes below — both `ioredis` and the official
 *   `redis` package satisfy them. Hosts wire concrete clients in their
 *   services bag and replace the in-memory bus where appropriate.
 *
 * Lifecycle:
 *   const bus = new RedisTriggerBus({ publisher, subscriber, appId: 'mail.example.com' });
 *   await bus.start();             // subscribes to the channel
 *   await bus.emit(trigger);       // publishes
 *   bus.subscribe('*', handler);   // local listeners (cache invalidator, etc.)
 *   await bus.close();             // unsubscribes; safe to call multiple times
 *
 * Errors thrown by local handlers are routed through `onError` (default
 * silent) so one bad listener can't poison the bus. JSON parse errors on
 * inbound frames are routed through `onParseError` (default silent).
 */

import type { Trigger } from '@atelier/schemas';
import type { Unsubscribe } from '../types.js';
import { InMemoryTriggerBus } from './memory-bus.js';
import {
  type WILDCARD_TRIGGER_TYPE,
  type TriggerHandler,
  type TriggerSubscription,
} from './subscription.js';

/** Minimal Redis publisher shape. Both `ioredis` and `redis` satisfy this. */
export interface RedisLikePublisher {
  publish(channel: string, message: string): Promise<number> | number;
}

/** Minimal Redis subscriber shape. Both `ioredis` and `redis` satisfy this. */
export interface RedisLikeSubscriber {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  off?(event: 'message', listener: (channel: string, message: string) => void): unknown;
}

/** Default channel prefix. Final channel = `<prefix>:triggers:<app_id>`. */
export const DEFAULT_REDIS_CHANNEL_PREFIX = 'atelier';

/** Current envelope schema version. Bumped on breaking shape changes. */
export const REDIS_TRIGGER_ENVELOPE_VERSION = 1 as const;

/** Wire envelope shape. Documented in the module header. */
export interface RedisTriggerEnvelope {
  v: typeof REDIS_TRIGGER_ENVELOPE_VERSION;
  origin: string;
  trigger: Trigger;
}

export interface RedisTriggerBusOptions {
  /** Redis client used for `publish()`. */
  publisher: RedisLikePublisher;
  /**
   * Redis client used for `subscribe()` / `on('message', …)`. Note: most
   * Redis client libraries require a *separate* connection for subscribers
   * (a connection in subscribe mode can't issue normal commands). Hosts are
   * responsible for passing two distinct clients.
   */
  subscriber: RedisLikeSubscriber;
  /** App scope for channel naming. */
  appId: string;
  /** Optional channel prefix. Defaults to `atelier`. */
  channelPrefix?: string;
  /**
   * Optional opaque id for this instance. Used to drop self-echoes. Defaults
   * to a random uuid (or a fallback `Math.random` id when `crypto` is not
   * available).
   */
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

export class RedisTriggerBus implements TriggerSubscription {
  readonly #publisher: RedisLikePublisher;
  readonly #subscriber: RedisLikeSubscriber;
  readonly #appId: string;
  readonly #channel: string;
  readonly #origin: string;
  readonly #onParseError: ((raw: string, err: unknown) => void) | undefined;
  readonly #local: InMemoryTriggerBus;
  readonly #messageListener: (channel: string, message: string) => void;
  #started = false;
  #closed = false;

  constructor(opts: RedisTriggerBusOptions) {
    this.#publisher = opts.publisher;
    this.#subscriber = opts.subscriber;
    this.#appId = opts.appId;
    const prefix = opts.channelPrefix ?? DEFAULT_REDIS_CHANNEL_PREFIX;
    this.#channel = `${prefix}:triggers:${opts.appId}`;
    this.#origin = opts.originId ?? defaultOriginId();
    this.#onParseError = opts.onParseError;
    this.#local = new InMemoryTriggerBus(opts.onError ? { onError: opts.onError } : {});
    this.#messageListener = (channel: string, message: string): void => {
      if (channel !== this.#channel) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(message);
      } catch (err) {
        this.#onParseError?.(message, err);
        return;
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (parsed as { v?: unknown }).v !== REDIS_TRIGGER_ENVELOPE_VERSION
      ) {
        this.#onParseError?.(message, new Error('not a v1 trigger envelope'));
        return;
      }
      const env = parsed as Partial<RedisTriggerEnvelope>;
      // Drop our own echoes — Redis fans pub/sub messages back to the
      // publishing connection too.
      if (env.origin === this.#origin) return;
      const trig = env.trigger;
      if (
        !trig ||
        typeof trig !== 'object' ||
        typeof (trig as { type?: unknown }).type !== 'string'
      ) {
        this.#onParseError?.(message, new Error('envelope missing trigger payload'));
        return;
      }
      void this.#local.emit(trig);
    };
  }

  /** App id this bus is scoped to. */
  get appId(): string {
    return this.#appId;
  }

  /** Channel name resolved at construction. Useful for logging and tests. */
  get channel(): string {
    return this.#channel;
  }

  /** Origin id used to drop self-echoes. */
  get originId(): string {
    return this.#origin;
  }

  /**
   * Subscribe the underlying Redis client to the app channel and wire the
   * message listener. Idempotent — multiple calls resolve to the same
   * subscription. Must be awaited before `emit()` / `subscribe()` calls are
   * meaningful across processes (local listeners still work either way).
   */
  async start(): Promise<void> {
    if (this.#started || this.#closed) return;
    this.#started = true;
    this.#subscriber.on('message', this.#messageListener);
    await this.#subscriber.subscribe(this.#channel);
  }

  /** Local subscribe — same semantics as `InMemoryTriggerBus`. */
  subscribe(
    eventType: Trigger['type'] | typeof WILDCARD_TRIGGER_TYPE,
    handler: TriggerHandler,
  ): Unsubscribe {
    return this.#local.subscribe(eventType, handler);
  }

  /**
   * Publish a trigger to every subscriber of the app channel (including
   * other processes) AND fan out to local listeners. We deliver locally up
   * front so the emitting process sees the trigger immediately, and we drop
   * the self-echo on the inbound path via `origin` so listeners never run
   * twice.
   */
  async emit(event: Trigger): Promise<void> {
    if (this.#closed) return;
    const envelope: RedisTriggerEnvelope = {
      v: REDIS_TRIGGER_ENVELOPE_VERSION,
      origin: this.#origin,
      trigger: event,
    };
    const frame = JSON.stringify(envelope);
    // Local fan-out first — this matches `InMemoryTriggerBus.emit()`'s
    // contract that handlers run synchronously-ish before resolve.
    await this.#local.emit(event);
    await Promise.resolve(this.#publisher.publish(this.#channel, frame));
  }

  /**
   * Unsubscribe from Redis and detach the message listener. Safe to call
   * multiple times. After close, `emit()` is a no-op.
   */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#started) {
      try {
        this.#subscriber.off?.('message', this.#messageListener);
      } catch {
        // Some clients don't expose `off` — fine, we still unsubscribe below.
      }
      try {
        await Promise.resolve(this.#subscriber.unsubscribe(this.#channel));
      } catch {
        // Best-effort — the connection may already be torn down.
      }
    }
  }

  /** Total local subscriber count across typed + wildcard buckets. */
  subscriberCount(): number {
    return this.#local.subscriberCount();
  }
}
