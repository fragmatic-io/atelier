## Outcome

Describe the user-visible or operational result.

## Security and compatibility

- [ ] Tenant/project scope is preserved.
- [ ] Provider, authorization, confirmation, design-review, and privacy failures remain explicit.
- [ ] No credentials, runtime databases, private evidence, or customer payloads are committed.
- [ ] Removed or changed public contracts have a documented migration decision.

## Verification

- [ ] Focused tests cover the changed behavior.
- [ ] `cd platform && npm run test:unit` passes.
- [ ] `cd platform && npm run verify` passes.
- [ ] Commit-bound acceptance passed, or its exact external blocker is documented.
- [ ] Documentation was updated when setup or behavior changed.
