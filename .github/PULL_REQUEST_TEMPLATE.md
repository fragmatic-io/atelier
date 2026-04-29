<!--
Thanks for contributing to CIR.

Before opening: see AGENTS.md for which artifact category your change belongs
under (capability / skill / component / policy / recipe / runtime / compiler /
docs / tooling). One change = one artifact category where possible.
-->

## Summary

<!-- 1-3 bullets. What changed and why. -->

-
-

## Which artifacts changed

<!-- Tick all that apply. See AGENTS.md for the canonical layout. -->

- [ ] Capability (`/capabilities/**`)
- [ ] Skill (`/skills/**`)
- [ ] Component (`/components/**`)
- [ ] Policy (`/policies/**`)
- [ ] Recipe (`/recipes/**`)
- [ ] Schemas (`packages/schemas/**`, `.well-known/schemas/**`)
- [ ] Policies (`packages/policies/**`)
- [ ] Evals (`packages/evals/**`, `evals/**`)
- [ ] Runtime (`packages/runtime/**`)
- [ ] Compiler (`packages/compiler/**`)
- [ ] Docs (`/docs/**`, `README.md`, `ETHOS.md`, `AGENTS.md`)
- [ ] Tooling / CI / config (`.github/**`, build/lint/test config)

## Test plan

<!-- How did you verify this? Commands, manual checks, eval cases added, etc. -->

-
-

## ETHOS principles touched

<!--
Which of the ten principles in /ETHOS.md does this change interact with?
Link to the principle and explain in one line how the change upholds it.
-->

-

## Reviewer notes

<!-- Anything reviewers should know: trade-offs, follow-ups, screenshots, etc. -->

---

### Checklist

- [ ] Tests added or updated
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] Docs updated if behaviour changed
- [ ] No destructive changes (schema breaks, removed components, removed
      capabilities) without a migration note in the PR description
- [ ] If a capability/component version was bumped, the deprecation window
      and migration path are documented
