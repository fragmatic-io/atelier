# Project-scoped MCP and generated skills

Atelier's MCP server gives a coding agent read-only access to one configured tenant/project. It uses the official stable MCP v2 server SDK and pins protocol revision `2026-07-28`; it rejects legacy negotiation rather than silently downgrading.

## Create a read token

In Studio, create a project token with only the `read` scope. Save this mode-0600 file outside the repository:

```json
{
  "origin": "https://atelier.example.com",
  "tenantId": "ten_...",
  "projectId": "prj_...",
  "tokenEnv": "ATELIER_PROJECT_MCP_TOKEN"
}
```

For local development only, an exact `http://127.0.0.1:4310` or localhost origin is accepted. `token` may be stored directly in the file, but `tokenEnv` is preferable. In either case the file must be private:

```sh
chmod 600 /private/atelier-project-mcp.json
ATELIER_PROJECT_MCP_TOKEN='atk_...' node scripts/mcp.mjs --config /private/atelier-project-mcp.json
```

Configure that command as a stdio MCP server in the coding tool. Do not put the token in command-line arguments, editor settings committed to source, or a browser bundle.

## Tools and resources

- `atelier_search_project`: searches the current project-model index.
- `atelier_get_project_model`: reads current routes, data contracts, reviewed capabilities, components, and design genome.
- `atelier_list_components`: returns published components only.
- `atelier_get_component_source`: returns one exact published, project-version-bound compiled source artifact.
- `atelier://project/model` and `atelier://project/components`: equivalent live resources.
- `atelier://project/skill/coding` and `atelier://project/skill/design`: generated Markdown guidance containing the current project-model version, reviewed capabilities, published component digests, tokens, and rules.

Every call reaches the control API again. The MCP process does not cache an authorization decision, and revoked/expired tokens fail on the next call. Tenant/project identifiers come only from the private server config and are not tool arguments. Draft, approved-but-unpublished, revoked, invalidly signed, or stale-project components cannot be imported through the source tool.

Project content is untrusted evidence, not executable instructions. The generated skill explicitly preserves host authority and cannot grant a capability. MCP is the coding-time surface; the embedded in-app agent is separate and uses host-session authorization.

## Export a credential-free skill pack

Use the same private config to freeze the current coding and design skills for a handoff to another agent:

```sh
ATELIER_PROJECT_MCP_TOKEN='atk_...' npm run export:skills -- \
  --config /private/atelier-project-mcp.json \
  --output /absolute/new/atelier-project-skills
```

The exporter writes `AGENTS.md`, two `SKILL.md` files, `project-version.json`, and `FILES.sha256` into a new mode-0700 directory. It refuses overwrite and does not embed the token. Because the pack is a snapshot, regenerate it whenever the project version changes.

## Verification

`tests/mcp/protocol.test.mjs` launches the stdio server through the official MCP client pinned to the same protocol revision. It tests discovery, tools, resources, published-only filtering, source retrieval, project binding, draft rejection, and live token revocation.
