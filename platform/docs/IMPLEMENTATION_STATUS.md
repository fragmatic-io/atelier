# Atelier 2.3 implementation status

The machine-readable [requirements ledger](v2.3/REQUIREMENTS.json) is authoritative. Each item records behavior, implementation, executable test/evidence paths, classification, status, and limitations. `missing` and `partial` items fail even the core profile; the release profile requires every item to be `verified`.

Implemented local scope includes multi-tenant/project control and storage, provider-neutral API/CLI execution, project-native source compilation, fixed browser certification, approval/signing/revocation, normal-browser Studio and host-agent journeys, project learning/telemetry, host runtime authorization, MCP coding-agent tools, generated project skills, packaging, backup/restore/key drills, and a canonical acceptance runner.

The platform intentionally reports `releaseReady: false` until a scoped live API provider, deployment-registry/container drills, and independent security review are verified for the exact commit. Local application/certifier images and authenticated Claude/Codex CLI adapter calls passed; no fixture substitutes for the remaining gates.
