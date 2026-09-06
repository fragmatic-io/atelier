# Swappable model providers

## One contract

Every engine implements `generate({ system, input, schema, signal, maxOutputTokens, images })` and returns `{ value, usage, model, provider, durationMs }`. `completeJson()` returns the validated value. The control-plane `ModelGateway` adds project/tenant scoping, stage routing, persistent artifact caching, token reservations, retry policy and provenance. No engine change alters the signed screen/host contracts.

`mode: deterministic` is an explicit no-LLM preview, never a fallback disguised as a successful API call. A model error keeps the job failed and the old approved release unchanged.

## API connections

In **Connections**, choose a provider, key and exact model ID available to that account. Connect it to a project in Settings. Keys are encrypted on the server and never returned by the list API or written into preview HTML. A connection can be project-private or deliberately workspace-shared by an administrator.

- `openai`: Responses API, `store: false`, strict JSON-schema artifact response.
- `anthropic`: Messages API with a forced `emit_artifact` data-return tool. It executes no external action.
- `gemini`: JSON response schema via GenerateContent.
- `openai-compatible`: an HTTPS base URL explicitly allowed by the **operator's** `ATELIER_PROVIDER_HOSTS`. The adapter appends `/chat/completions`. Compatibility varies; run a live smoke test with your endpoint/model before use.

Independent stage routing is saved in project settings, for example:

```json
{
  "modelRouting": {
    "architect": { "connectionId": "your-planning-connection", "model": "your-model-id" },
    "designer": { "connectionId": "your-design-connection", "model": "your-model-id" },
    "critic": { "connectionId": "your-review-connection", "model": "your-model-id" },
    "visual": { "connectionId": "your-vision-api-connection", "model": "your-vision-model-id" }
  }
}
```

The visual stage accepts up to four bounded PNG/JPEG/WebP references and is optional unless the project enables `visualReviewRequired`. Confirm the screenshots contain synthetic/redacted data. A text-only CLI adapter rejects images explicitly; use an API connection for visual critique. A passing model critique is a recorded opinion, not an accessibility or aesthetic certification.

## Codex CLI and Claude Code CLI

1. Create a **dedicated OS user/container per project runner**, with no shared developer home, SSH agent, workspace mount or control-plane secrets. Install/authenticate the chosen CLI there using the vendor's supported procedure.
2. Register the runner in project Settings. Save the one-time project-scoped runner token to a private config file (mode 0600). The token expires after 30 days and can be revoked immediately.
3. Copy `ops/runner.example.json`, replacing the server, token, HOME and absolute executable paths. Run:

```sh
node scripts/runner.mjs --config /private/atelier-project-runner.json
```

4. Create a `codex-cli` or `claude-cli` connection linked to this runner, then select it for the project. Runners cannot claim another project's work, including another project in the same tenant.

Before registering a dedicated runner, an operator can verify an already authenticated local CLI account through the same production adapter. This is a credentialed smoke check, not OS-isolation evidence:

```sh
ATELIER_LIVE_CLI_KIND=claude-cli npm run acceptance:cli
ATELIER_LIVE_CLI_KIND=codex-cli npm run acceptance:cli
```

The command fails if the account, required safety flags, schema output, exact requested model, or validated result is unavailable. It never switches to another CLI or API provider.

The driver performs a `--version`/help capability check before claiming compatibility. It runs in a private temporary directory, passes the prompt through stdin, never uses a shell, bounds output/time, validates final JSON and kills the process group on cancellation. Codex uses noninteractive execution, a read-only sandbox, ephemeral output, ignored user config/rules and schema/output files. Claude uses print/bare mode, no builtin tools, an explicitly empty strict MCP configuration, schema output and no session persistence. These flags complement, but do not replace, OS isolation.

Account HOME overrides and inherited API-key/config environment variables are filtered at the runner boundary. A dedicated per-project key may be supplied by naming an operator environment variable using `apiKeyEnv` in the account config. Never copy an unrelated developer's whole environment into a tenant-exposed runner.

The provider remains selectable per project and per pipeline stage: API, Codex CLI, and Claude CLI all enter the same schema-validated gateway contract. Per the requested V2.3 policy, a Claude CLI connection with no explicit model pins `claude-opus-4-8` and `high` effort. The runner passes both `--model` and `--effort` and refuses a CLI version whose help does not advertise those flags. It never uses the moving `opus` alias and never downgrades effort. Anthropic currently classifies Opus 4.8 as active legacy in favor of Opus 5; changing this explicit project default is a reviewed configuration migration, not an automatic fallback.

## Failure and accounting semantics

API redirects/private-IP egress are forbidden. Refusal, truncation, non-JSON output, schema mismatch, timeout, dead runner, revoked connection and stale lease produce explicit errors. Retryable API transport failures get at most one retry. Failed calls with uncertain provider usage are conservatively charged against the reservation. The workspace token budget is a resource guard, not a provider billing meter; set provider-side account budgets too. CLI subscriptions can have their own usage restrictions, and this source package does not promise eligibility or unmetered use.

## Verification boundary

Automated tests exercise all four API wire formats with controlled transport responses, malformed/refused outputs, cancellation, egress policy, real shell-free subprocesses standing in for CLI binaries, and the durable remote-runner claim/complete/fence path. Authenticated local adapter calls passed for Claude CLI 2.1.263 using the exact `claude-opus-4-8` model at `high` effort and for Codex CLI 0.146.0 using its account default. No live OpenAI/Anthropic/Google API key was supplied, so the combined API-plus-CLI release gate remains blocked and no substitute provider was used. Run one real architect/designer/critic generation and one visual job in **staging** for each chosen API provider/version before enabling it for customer work.

## Primary references checked during this audit

- Codex noninteractive execution: https://developers.openai.com/codex/noninteractive/
- Codex CLI flags: https://developers.openai.com/codex/cli/reference/
- OpenAI structured outputs: https://platform.openai.com/docs/guides/structured-outputs
- Claude Code CLI: https://code.claude.com/docs/en/cli-reference
- Node SQLite API: https://nodejs.org/api/sqlite.html

CLI flags/models change; the installed driver's capability check is authoritative for whether this integration can run safely. Do not disable checks simply to make an older binary appear compatible.
