// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Action registry — `capability_id` -> handler. The dispatcher looks handlers
 * up here when a layout node fires an action.
 *
 * Collision policy: last write wins. The registry is small (one entry per
 * capability the host has implemented) and hosts typically register at boot,
 * so the simplest contract is also the most predictable. Tests can verify
 * `has()` before `register()` if they want strict-mode behavior.
 */

import type { ActionExecutionContext } from '../actions/dispatcher.js';

/** Handler signature: capability input + execution context, async result. */
export type ActionHandler = (input: unknown, ctx: ActionExecutionContext) => Promise<unknown>;

export interface ActionRegistry {
  register(capabilityId: string, handler: ActionHandler): void;
  get(capabilityId: string): ActionHandler | undefined;
  has(capabilityId: string): boolean;
}

/** In-memory implementation backed by a `Map`. */
export class MapActionRegistry implements ActionRegistry {
  readonly #handlers = new Map<string, ActionHandler>();

  register(capabilityId: string, handler: ActionHandler): void {
    this.#handlers.set(capabilityId, handler);
  }

  get(capabilityId: string): ActionHandler | undefined {
    return this.#handlers.get(capabilityId);
  }

  has(capabilityId: string): boolean {
    return this.#handlers.has(capabilityId);
  }
}
