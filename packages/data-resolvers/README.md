# `@cir/data-resolvers`

Reusable adapters that satisfy the `DataResolver` protocol from `@cir/react`.

Without this package, every host had to hand-roll a fetch layer to resolve manifest data
bindings, and the runtime shipped only an `EmptyDataResolver` sentinel that returned
`undefined` for every binding. A "personalised" UI that shows nothing because nobody
wired the resolver is worse than a default UI; this package fixes that.

## Adapters

| Adapter                    | When to use                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `RestDataResolver`         | Hand-rolled HTTP API. Configurable URL templates, auth header injection, response transforms.                                       |
| `OpenApiDataResolver`      | Capabilities imported via `cir import openapi` — the resolver re-uses `_review.imported_from` to find and call the right operation. |
| `GraphQLDataResolver`      | Single GraphQL endpoint with an auto-built query. Override per-capability via `fieldMap` or `queryFor`.                             |
| `MockDataResolver`         | In-memory fixtures. Applies `filter` / `sort` / `group_by` client-side.                                                             |
| `CompositeDataResolver`    | Falls through a list of resolvers; first non-`undefined` wins.                                                                      |
| `withCache(resolver, ...)` | TTL + stale-while-revalidate wrapper around any other resolver.                                                                     |

## Quick start

```ts
import {
  CompositeDataResolver,
  MockDataResolver,
  RestDataResolver,
  withCache,
} from '@cir/data-resolvers';

const mock = new MockDataResolver({
  fixtures: {
    'github.repo.list': [
      { id: 1, name: 'cir', stargazers_count: 42 },
      { id: 2, name: 'demo', stargazers_count: 7 },
    ],
  },
});

const rest = new RestDataResolver({
  baseUrl: 'https://dummyjson.com/',
  urlMap: {
    'dummyjson.product.list': 'https://dummyjson.com/products',
    'dummyjson.product.search': 'https://dummyjson.com/products/search',
  },
});

const composite = new CompositeDataResolver([mock.resolve, rest.resolve]);
const dataResolver = withCache(composite.resolve, {
  ttlMs: 60_000,
  staleWhileRevalidate: true,
});

// In your provider:
//   <CirRuntime services={services} dataResolver={dataResolver}> … </CirRuntime>
```

## Filter / sort / group_by

The package ships a small parser for the expression grammar from
[`docs/artifacts.md`](../../docs/artifacts.md):

```ts
import { parseFilter, toPredicate, toQueryString, toWhereClause } from '@cir/data-resolvers';

const ast = parseFilter('requires_decision = true AND received_after = "2026-04-30"');

toQueryString({ filter: 'a = 1', sort: 'b desc' }).toString();
// → 'filter=a+%3D+1&sort=b+desc'

toWhereClause(ast);
// → "(requires_decision = TRUE AND received_after = '2026-04-30T00:00:00.000Z')"

[{ requires_decision: true }, { requires_decision: false }].filter(toPredicate(ast));
// → [{ requires_decision: true }]   (when the date side passes)
```

Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, plus `AND` / `OR` and parens for
grouping. Quoted strings, numbers, booleans, ISO-8601 dates, and bare logical literals
(`today_start`, `7d`) are recognised. Unparseable filters are passed through verbatim by
`toQueryString` so a flaky filter doesn't break the request.

## Adapter cookbook

### `RestDataResolver`

```ts
const resolver = new RestDataResolver({
  baseUrl: 'https://dummyjson.com/',
  headers: { 'x-app': 'cir-demo' },
  headerProvider: async () => ({ authorization: `Bearer ${await getToken()}` }),
  transform: (json) => (json as { products: unknown[] }).products,
});
```

### `OpenApiDataResolver`

```ts
const resolver = new OpenApiDataResolver({
  capabilities,
  specLoader: async (ref) => {
    const res = await fetch(ref);
    return res.json();
  },
  defaultBaseUrl: 'https://api.example.com',
});
```

### `GraphQLDataResolver`

```ts
const resolver = new GraphQLDataResolver({
  endpoint: 'https://api.example.com/graphql',
  capabilities,
  fieldMap: { 'shop.product.list': 'allProducts' },
});
```

### `MockDataResolver`

```ts
const resolver = new MockDataResolver({
  fixtures: {
    'task.list': (binding) => buildFixturesFor(binding.filter),
    profile: { name: 'demo' },
  },
});
```

### `CompositeDataResolver`

```ts
const composite = new CompositeDataResolver([mock.resolve, rest.resolve], {
  predicates: [(b) => b.source.startsWith('mock.'), () => true],
});
```

### `withCache`

```ts
const cached = withCache(rest.resolve, {
  ttlMs: 60_000,
  staleWhileRevalidate: true,
});
cached.invalidate({ source: 'foo' });
cached.clear();
```

The cache wrapper implements TTL + SWR with no third-party SWR library; it mirrors
the patterns already used by the runtime's manifest cache.
