// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Map — placeholder map component.
 *
 * A real tile-rendering map needs Leaflet / Mapbox / MapLibre, all of which
 * pull in significant runtime + CSS. To keep `@atelier/components` free of any
 * cartography deps in v1, this component renders a textual fallback:
 *  - A header with the center coordinates and zoom level.
 *  - A `<ul>` of markers with their labels and coordinates.
 *  - A `<noscript>` link to OpenStreetMap so JS-disabled clients still get
 *    a usable map view.
 *
 * Phase 6 can swap a real tile renderer in behind this exact prop API
 * without breaking manifest authors. The `data-cir-component="Map"`
 * selector + part attributes are the contract a renderer must keep.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, mapVariantClass, type MapVariant } from './_variants.js';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
}

export interface MapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: readonly MapMarker[];
  ariaLabel: string;
  className?: string;
  variant?: MapVariant;
}

function osmUrl(lat: number, lng: number, zoom: number): string {
  return `https://www.openstreetmap.org/?mlat=${String(lat)}&mlon=${String(lng)}#map=${String(zoom)}/${String(lat)}/${String(lng)}`;
}

export function Map({
  center,
  zoom = 12,
  markers = [],
  ariaLabel,
  className,
  variant = 'default',
}: MapProps): ReactNode {
  const fallbackUrl = osmUrl(center.lat, center.lng, zoom);
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-cir-component="Map"
      data-zoom={zoom}
      data-variant={variant}
      className={cn(mapVariantClass[variant], className)}
    >
      <header data-cir-part="map-header">
        <span data-cir-part="map-center">
          {`Center: ${String(center.lat)}, ${String(center.lng)} (zoom ${String(zoom)})`}
        </span>
      </header>
      {markers.length > 0 ? (
        <ul data-cir-part="map-markers">
          {markers.map((m) => (
            <li key={m.id} data-cir-part="map-marker">
              {m.label !== undefined ? `${m.label}: ` : ''}
              {`${String(m.lat)}, ${String(m.lng)}`}
            </li>
          ))}
        </ul>
      ) : null}
      <noscript>
        <a href={fallbackUrl} data-cir-part="map-fallback-link" rel="noopener noreferrer">
          View on OpenStreetMap
        </a>
      </noscript>
    </div>
  );
}

Map.displayName = 'Map';

export function mapTextRender(props: MapProps): string {
  const count = props.markers?.length ?? 0;
  return `[Map: ${String(props.center.lat)},${String(props.center.lng)} (${String(count)} markers)]`;
}

export const MapBinding: ComponentBinding = {
  id: 'Map',
  factory: Map,
};
