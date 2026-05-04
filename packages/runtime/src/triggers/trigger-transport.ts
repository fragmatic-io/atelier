// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `TriggerTransport` — the pluggable transport contract the in-memory
 * `TriggerBus` writes to when it needs cross-process / cross-host fan-out.
 *
 * Wave 10 / S-4.
 *
 * Why this seam exists:
 *   `InMemoryTriggerBus` fans triggers out to local subscribers in the same
 *   process. With V-6 (recipe marketplace) shipping multi-host workflows, a
 *   trigger emitted by one host must reach subscribers on another host so
 *   their compilers and resolver caches can react. The transport layer here
 *   is the seam — the bus stays framework-agnostic, hosts plug in whatever
 *   wire format fits their infra (SSE coordinator, Redis pub/sub, NATS, …).
 *
 * Contract:
 *   - `publish(trigger)` — broadcast a trigger to every subscriber across
 *     the cluster, including (potentially) the publishing process itself.
 *     Transports SHOULD attach an opaque `origin_node_id` to the wire frame
 *     so the receiving side can drop self-echoes; `TriggerBus.setTransport()`
 *     handles that bookkeeping for impls that surface an origin.
 *   - `subscribe(handler)` — called once by the bus on `setTransport()`.
 *     The transport calls `handler(trigger)` for every inbound trigger that
 *     did NOT originate from this process. Returns an unsubscribe function.
 *   - `close()` — optional, idempotent. Hosts call it during shutdown.
 *
 * Loop prevention:
 *   `TriggerBus.publish()` writes to BOTH the local subscribers AND the
 *   transport. When a trigger comes back via the transport it MUST NOT
 *   re-fire local subscribers (that's the loop). The bus tags every locally
 *   emitted trigger with its own `originNodeId`, the transport carries it on
 *   the wire (or filters at the source — `InMemoryTriggerTransport` does
 *   the latter), and the inbound path drops echoes whose origin matches.
 *
 * This module ships ONLY the interface. Reference implementations live in
 * `../transports/` — `InMemoryTriggerTransport` for tests + multi-bus
 * fan-out in a single Node process, and `SseTriggerTransport` paired with
 * `createTriggerCoordinator()` for host-pluggable HTTP/SSE deployments.
 * Hosts that need Redis, NATS, Kafka, … wire their own transport against
 * this interface — those are host responsibilities by design.
 */

import type { Trigger } from '@atelier/schemas';

/**
 * Origin-tagged envelope carried over the wire. Transports MAY pass naked
 * `Trigger`s through `publish()` and emit naked `Trigger`s on `subscribe()`,
 * but loop prevention is only effective when the origin is preserved
 * end-to-end. `TriggerBus.setTransport()` accepts both shapes — a transport
 * that doesn't surface origin is responsible for its own self-echo
 * filtering (see `InMemoryTriggerTransport`).
 */
export interface TriggerEnvelope {
  /** Per-process opaque id assigned by the bus that emitted this trigger. */
  origin_node_id: string;
  trigger: Trigger;
}

/** Inbound handler shape. Transports invoke this for every received frame. */
export type TriggerTransportHandler = (trigger: Trigger, meta?: { originNodeId?: string }) => void;

/** Unsubscribe function returned by `subscribe()`. Idempotent. */
export type TriggerTransportUnsubscribe = () => void;

export interface TriggerTransport {
  /**
   * Broadcast a trigger to every subscriber across the cluster.
   *
   * `originNodeId` is the publishing bus's opaque per-process id. Transports
   * SHOULD round-trip it on the wire so other nodes can drop self-echoes;
   * single-process transports MAY filter at the source instead.
   */
  publish(trigger: Trigger, originNodeId: string): Promise<void>;

  /**
   * Subscribe to inbound triggers. `TriggerBus.setTransport()` calls this
   * exactly once on attach. The transport invokes `handler` for every
   * received frame; the bus is responsible for dropping self-echoes via
   * the meta arg's `originNodeId`.
   */
  subscribe(handler: TriggerTransportHandler): TriggerTransportUnsubscribe;

  /** Optional close hook. Idempotent. Called during host shutdown. */
  close?(): Promise<void>;
}
