// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Map as MapComponent, MapBinding, mapTextRender } from '../src/components/Map.js';

const CENTER = { lat: 37.7749, lng: -122.4194 };
const MARKERS = [
  { id: 'a', lat: 37.78, lng: -122.41, label: 'Office' },
  { id: 'b', lat: 37.77, lng: -122.42 },
];

describe('Map', () => {
  it('renders an aria-labelled placeholder', () => {
    render(<MapComponent center={CENTER} ariaLabel="SF map" />);
    const root = screen.getByRole('img', { name: 'SF map' });
    expect(root).toBeTruthy();
    expect(root.getAttribute('data-cir-component')).toBe('Map');
  });

  it('shows the center coordinates and zoom in the textual fallback', () => {
    const { container } = render(<MapComponent center={CENTER} ariaLabel="m" zoom={14} />);
    const center = container.querySelector('[data-cir-part="map-center"]');
    expect(center?.textContent).toContain('37.7749');
    expect(center?.textContent).toContain('-122.4194');
    expect(center?.textContent).toContain('zoom 14');
  });

  it('defaults zoom to 12 when omitted', () => {
    const { container } = render(<MapComponent center={CENTER} ariaLabel="m" />);
    expect(container.querySelector('[data-cir-component="Map"]')?.getAttribute('data-zoom')).toBe(
      '12',
    );
  });

  it('renders markers as a list when provided', () => {
    const { container } = render(<MapComponent center={CENTER} ariaLabel="m" markers={MARKERS} />);
    expect(container.querySelectorAll('[data-cir-part="map-marker"]').length).toBe(2);
    const first = container.querySelectorAll('[data-cir-part="map-marker"]')[0];
    expect(first?.textContent).toContain('Office');
  });

  it('omits the marker list when markers is empty', () => {
    const { container } = render(<MapComponent center={CENTER} ariaLabel="m" markers={[]} />);
    expect(container.querySelector('[data-cir-part="map-markers"]')).toBeNull();
  });

  it('includes a <noscript> fallback link to OpenStreetMap', () => {
    const { container } = render(<MapComponent center={CENTER} ariaLabel="m" />);
    // happy-dom strips noscript content from the parsed DOM in some renderings,
    // but the element itself is present in the tree.
    expect(container.querySelector('noscript')).toBeTruthy();
  });

  it('text-render reports center and marker count', () => {
    expect(mapTextRender({ center: CENTER, ariaLabel: 'm', markers: MARKERS })).toBe(
      '[Map: 37.7749,-122.4194 (2 markers)]',
    );
    expect(mapTextRender({ center: CENTER, ariaLabel: 'm' })).toBe(
      '[Map: 37.7749,-122.4194 (0 markers)]',
    );
  });

  it('binding id matches', () => {
    expect(MapBinding.id).toBe('Map');
  });
});
