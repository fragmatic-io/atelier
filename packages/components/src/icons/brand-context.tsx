// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * IconBrandContext — optional runtime hook for `<Icon>` to honour a brand
 * kit's `iconography.minimum_size`.
 *
 * The components package doesn't have a generic "runtime context" today
 * (Wave 7+), so we expose a focused, narrow context here that hosts can
 * populate with just the icon-relevant slice of `BrandKitSchema`. When set,
 * `<Icon>` clamps its `size` to at least `minimumSize`. When absent (the
 * default), the size prop is honoured verbatim.
 *
 * The shape intentionally mirrors `BrandIconographySchema` from
 * `@atelier/schemas` so a host that already loads a brand kit can pass the
 * iconography slice in directly.
 *
 * Wave 7b (Vis-3).
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface IconBrandConfig {
  /**
   * Minimum rendered size in pixels. `<Icon size>` is clamped up to this
   * value. Mirrors `BrandIconographySchema.minimum_size`.
   */
  minimumSize?: number;
}

export const IconBrandContext = createContext<IconBrandConfig | null>(null);

export interface IconBrandProviderProps {
  /** Iconography slice from the host's brand kit. */
  config: IconBrandConfig;
  children: ReactNode;
}

/**
 * Provide brand-driven icon constraints (currently just `minimumSize`) to
 * `<Icon>` descendants. Hosts that already wire a generic brand-kit
 * context can ignore this — `<Icon>` falls back to the raw `size` prop.
 */
export function IconBrandProvider({ config, children }: IconBrandProviderProps): ReactNode {
  return <IconBrandContext.Provider value={config}>{children}</IconBrandContext.Provider>;
}
IconBrandProvider.displayName = 'IconBrandProvider';

/** Internal hook — returns the active brand config or `null`. */
export function useIconBrand(): IconBrandConfig | null {
  return useContext(IconBrandContext);
}
