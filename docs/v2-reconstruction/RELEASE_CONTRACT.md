# Reconstruction release contract

This branch reconstructs an unavailable V2.2 deliverable from the surviving V2.1 source. It must not claim recovery of an archive that was never verified.

The reconstruction targets real React source generation with project-owned modules, a versioned component registry and isolated browser acceptance, together with an authenticated multi-tenant/project conversation service, reviewed tools, bounded calculations and durable interactive artifacts.

## Acceptance evidence

A release must include its complete source, lockfile, original baseline tests, new reconstruction tests, browser/task results, an implementation-to-requirement map and a per-file integrity manifest. Failed, timed-out, unexecuted and externally dependent checks must remain distinguishable.

A source compile is not a browser pass. A browser pass is not human approval. A human approval is not business authorization. An approved UI artifact does not authorize an API call. Host permissions and object authorization are evaluated for the current subject on every execution.

The permitted deployment target is a controlled single-host platform, not an unverified high-availability service. Live proprietary-provider accounts, operating-system/runner isolation, real application authentication, backup restoration and deployment-specific load/security checks require explicit acceptance.

## Publication

`main` remains unchanged. New source belongs under `platform/` on `feat/v2-reconstruction-artifact-agents`; a fast-forward branch push and read-back are required before claiming source publication. No credentials, operational databases, private signing keys or customer snapshots may be committed.

The complete downloadable source archive is an independent checkpoint. Its existence, clean extraction and verification results must be checked rather than inferred from filenames or prior prose.
