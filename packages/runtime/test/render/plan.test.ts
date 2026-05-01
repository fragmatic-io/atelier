import { describe, expect, it } from 'vitest';
import {
  buildRenderPlan,
  RouteNotFoundError,
  RouteNotRenderableError,
} from '../../src/render/plan.js';
import {
  EMPTY_REGISTRY,
  MapComponentRegistry,
  type ComponentBinding,
} from '../../src/registry/component-registry.js';
import { fixtureManifest } from '../fixtures/manifest.js';

const stackBinding: ComponentBinding = { id: 'Stack', factory: 'stack-factory' };
const decisionBinding: ComponentBinding = { id: 'DecisionQueue', factory: 'decision-factory' };

describe('buildRenderPlan', () => {
  it('builds the expected node tree from the fixture manifest', () => {
    const registry = new MapComponentRegistry({
      Stack: stackBinding,
      DecisionQueue: decisionBinding,
    });
    const plan = buildRenderPlan(fixtureManifest(), '/today', registry);

    expect(plan.routePath).toBe('/today');
    expect(plan.title).toBe('Today');
    expect(plan.refresh).toEqual({
      dataPolicy: 'on_focus + 60s_interval',
      structurePolicy: 'never_unless_invalidated',
    });
    expect(plan.root.componentId).toBe('Stack');
    expect(plan.root.binding).toBe(stackBinding);
    expect(plan.root.children).toHaveLength(2);

    const [decision, taskQueue] = plan.root.children;
    expect(decision?.componentId).toBe('DecisionQueue');
    expect(decision?.binding).toBe(decisionBinding);
    expect(decision?.data).toEqual({
      source: 'thread.list',
      filter: 'requires_decision = true AND received_after = today_start',
      sort: 'urgency desc',
    });
    expect(decision?.actions).toEqual([
      'task.create_from_thread',
      'thread.archive',
      'draft.create',
    ]);
    expect(decision?.children).toEqual([]);

    expect(taskQueue?.componentId).toBe('TaskQueue');
    // not bound
    expect(taskQueue?.binding).toBeUndefined();
    expect(taskQueue?.data?.group_by).toBe('due_date');
    expect(taskQueue?.actions).toEqual(['task.complete', 'task.snooze']);
  });

  it('throws RouteNotFoundError when the route is missing', () => {
    expect(() => buildRenderPlan(fixtureManifest(), '/nope', EMPTY_REGISTRY)).toThrow(
      RouteNotFoundError,
    );
  });

  it('throws RouteNotRenderableError on a redirect-only route', () => {
    expect(() => buildRenderPlan(fixtureManifest(), '/', EMPTY_REGISTRY)).toThrow(
      RouteNotRenderableError,
    );
  });

  it('throws RouteNotRenderableError on a route with no layout and no redirect', () => {
    const m = fixtureManifest();
    m.routes.push({ path: '/empty' });
    expect(() => buildRenderPlan(m, '/empty', EMPTY_REGISTRY)).toThrow(RouteNotRenderableError);
  });

  it('binding is undefined when the component is not registered', () => {
    const plan = buildRenderPlan(fixtureManifest(), '/today', EMPTY_REGISTRY);
    expect(plan.root.binding).toBeUndefined();
  });

  it('omits title and refresh when the route lacks them', () => {
    const m = fixtureManifest();
    m.routes.push({ path: '/bare', layout: { component: 'Stack' } });
    const plan = buildRenderPlan(m, '/bare', EMPTY_REGISTRY);
    expect(plan.title).toBeUndefined();
    expect(plan.refresh).toBeUndefined();
  });

  it('passes through props bag', () => {
    const m = fixtureManifest();
    m.routes.push({
      path: '/props',
      layout: {
        component: 'Stack',
        props: { density: 'compact', items: 5 },
      },
    });
    const plan = buildRenderPlan(m, '/props', EMPTY_REGISTRY);
    expect(plan.root.props).toEqual({ density: 'compact', items: 5 });
  });

  it('omits actions when the layout node has none', () => {
    const m = fixtureManifest();
    m.routes.push({ path: '/noaction', layout: { component: 'Stack' } });
    const plan = buildRenderPlan(m, '/noaction', EMPTY_REGISTRY);
    expect(plan.root.actions).toBeUndefined();
  });

  it('passes through row_binding as plan.rowBinding (Phase 2 #3)', () => {
    const m = fixtureManifest();
    m.routes.push({
      path: '/rowbind',
      layout: {
        component: 'Grid',
        data: { source: 'product.list' },
        row_binding: 'ProductCard',
      },
    });
    const plan = buildRenderPlan(m, '/rowbind', EMPTY_REGISTRY);
    expect(plan.root.rowBinding).toBe('ProductCard');
  });

  it('omits rowBinding on the plan when the manifest does not set row_binding', () => {
    const plan = buildRenderPlan(fixtureManifest(), '/today', EMPTY_REGISTRY);
    expect(plan.root.rowBinding).toBeUndefined();
  });

  it('errors carry the routePath', () => {
    try {
      buildRenderPlan(fixtureManifest(), '/nope', EMPTY_REGISTRY);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RouteNotFoundError);
      expect((err as RouteNotFoundError).routePath).toBe('/nope');
    }
    try {
      buildRenderPlan(fixtureManifest(), '/', EMPTY_REGISTRY);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RouteNotRenderableError);
      expect((err as RouteNotRenderableError).routePath).toBe('/');
    }
  });
});
