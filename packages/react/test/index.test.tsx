// @vitest-environment happy-dom
// Smoke test: every public export from `@atelier/react` and `@atelier/react/testing`
// is reachable, and the testing helper actually mounts a tree.

import './setup.js';
import { describe, expect, it } from 'vitest';
import * as react from '../src/index.js';
import * as testing from '../src/testing/index.js';

describe('@atelier/react public surface', () => {
  it('exports provider, route, error boundary, hooks, data resolver', () => {
    expect(typeof react.CirRuntime).toBe('function');
    expect(typeof react.CirRoute).toBe('function');
    expect(typeof react.CirErrorBoundary).toBe('function');
    expect(typeof react.useCir).toBe('function');
    expect(typeof react.useManifest).toBe('function');
    expect(typeof react.useDispatcher).toBe('function');
    expect(typeof react.useTrigger).toBe('function');
    expect(typeof react.useReactConfirmation).toBe('function');
    expect(typeof react.EmptyDataResolver).toBe('function');
    expect(react.DataResolverContext).toBeTruthy();
  });

  it('does NOT export RenderNode publicly', () => {
    expect((react as Record<string, unknown>)['RenderNode']).toBeUndefined();
  });

  it('testing subpath exposes render-with-cir + buildTestServices', () => {
    expect(typeof testing.renderWithCir).toBe('function');
    expect(typeof testing.buildTestServices).toBe('function');
  });

  it('renderWithCir mounts the tree inside a provider', () => {
    function Probe(): React.ReactElement {
      const { identity } = react.useCir();
      return <div data-testid="who">{identity.user_id}</div>;
    }
    const { getByTestId, services } = testing.renderWithCir(<Probe />);
    expect(getByTestId('who').textContent).toBe(services.identity.user_id);
  });

  it('renderWithCir supports custom dataResolver and confirm props', () => {
    function Stub(): React.ReactElement {
      return <span>stub</span>;
    }
    const { container } = testing.renderWithCir(<Stub />, {
      dataResolver: () => 'x',
      confirm: () => ({ confirmed: false }),
    });
    expect(container.textContent).toContain('stub');
  });

  it('renderWithCir accepts an explicit servicesOverride', () => {
    const services = testing.buildTestServices({ identity: { user_id: 'over', app_id: 'a' } });
    function Probe(): React.ReactElement {
      const { identity } = react.useCir();
      return <div data-testid="who">{identity.user_id}</div>;
    }
    const { getByTestId } = testing.renderWithCir(<Probe />, { servicesOverride: services });
    expect(getByTestId('who').textContent).toBe('over');
  });
});
