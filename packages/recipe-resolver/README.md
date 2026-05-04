# @atelier/recipe-resolver

Recipe RAG for Atelier's C-2 `ToolUsingCompiler`. The package ships a
`RecipeResolver` interface, two implementations, and a default
file-system-backed `RecipeStore` so the C-5 `findRecipe` compiler tool
works out of the box.

See [`../../apps/docs/src/content/docs/compiler/recipe-rag.mdx`](../../apps/docs/src/content/docs/compiler/recipe-rag.mdx)
for the full story (resolver protocol, tool wiring, V-6 swap-in).

## At a glance

```ts
import {
  EmbeddingRecipeResolver,
  LocalRecipeStore,
  SubstringRecipeResolver,
} from '@atelier/recipe-resolver';

const store = new LocalRecipeStore({ directory: '/abs/path/to/recipes' });

// Embedding-backed (production):
const resolver = new EmbeddingRecipeResolver({ client: yourEmbeddingClient });
await resolver.index(await store.list());

// Substring baseline (no embedding pipeline needed):
const baseline = new SubstringRecipeResolver();
await baseline.index(await store.list());
```

The compiler picks up the resolver via
`ToolEnvironment.recipeResolver`; the agent calls `findRecipe(query)`
to retrieve a slim projection of the top-N matches.

## What this package is NOT

- **Not** a recipe loader for V-6 marketplace bundles. `LocalRecipeStore`
  is the dev / fixture story; V-6 ships its own `RecipeStore`.
- **Not** a manifest validator. Recipes carry an opaque `manifest`
  payload; the compiler validates it downstream.
- **Not** an embedding provider. The `EmbeddingClient` seam takes any
  provider; the same shape as `@atelier/capability-resolver`.
