# @fyko/opencode-plugin-telnyx

OpenCode plugin that adds [Telnyx](https://telnyx.com/products/inference) as a provider.

Works on **both** OpenCode V1 (`opencode`) and OpenCode V2 (`opencode2`) from a single
published package. See [Supporting both V1 and V2](#supporting-both-v1-and-v2).

## What It Does

- Registers a `telnyx` provider (OpenAI-compatible).
- Adds `telnyx` to `opencode auth login` (V1) and `/connect` (V2).
- Reads the Telnyx API key from `TELNYX_API_KEY` or OpenCode's stored credential.
- Fetches available models from `https://api.telnyx.com/v2/ai/models` at startup.
- Validates Telnyx model payloads with ArkType before registering them.
- Maps Telnyx pricing metadata into OpenCode model costs when the API reports `USD` per `1M_tokens`.
- Filters out known pass-through providers like `openai/*`, `anthropic/*`, `google/gemini-*`, and `xai-org/*`.
- Strips the output token cap before Telnyx requests so tool-enabled runs are accepted.

## Supporting both V1 and V2

The module's default export carries both entrypoints:

```ts
export default {
  id: "fyko.telnyx",
  server: telnyxV1,  // OpenCode V1 loader calls this
  setup: telnyxV2,   // OpenCode V2 loader calls this
}
```

OpenCode V1's loader reads the `server` function; OpenCode V2's loader decodes `{ id, setup }`
and ignores the extra `server` key. Each host runs the implementation it understands.

## Install

### OpenCode V1

```bash
opencode plugin @fyko/opencode-plugin-telnyx --global
```

Or add it manually to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@fyko/opencode-plugin-telnyx"]
}
```

### OpenCode V2

Add it to `~/.config/opencode/opencode.json` (or a project `opencode.json`):

```json
{
  "plugins": ["@fyko/opencode-plugin-telnyx"]
}
```

The `plugin` (V1) and `plugins` (V2) keys can coexist in the same file if you run both.

## Auth

### OpenCode V1

```bash
opencode auth login --provider telnyx --method "API Key"
```

### OpenCode V2

Set the environment variable, or connect in the TUI:

```bash
export TELNYX_API_KEY="YOUR_KEY"
```

In the TUI run `/connect`, pick **Telnyx**, then the **API Key** method, and paste your key.

Auth precedence is:

1. `TELNYX_API_KEY`
2. Stored `telnyx` credential

Verify the provider is connected:

```bash
# V1
opencode auth list

# V2
opencode2 api get /api/integration
```

## Usage

List registered Telnyx models:

```bash
# V1
opencode models telnyx --verbose

# V2
opencode2 models
```

Run a model:

```bash
# V1
opencode run --model 'telnyx/moonshotai/Kimi-K2.5' 'say hello in one sentence.'

# V2
opencode2 run --model 'telnyx/moonshotai/Kimi-K2.5' 'say hello in one sentence.'
```

The model list is dynamic. Use `opencode models telnyx` (V1) or `opencode2 models` (V2) to see what
Telnyx currently exposes for your account.

## Model Registration

At startup the plugin calls:

```text
GET https://api.telnyx.com/v2/ai/models
```

It registers text generation models after validating the response shape with ArkType. Model context
limits, output limits, vision support, and pricing come from the Telnyx API response.

Models with empty or unexpected pricing metadata are still registered, but without a `cost` field.

## Why the Request Hook Exists

Telnyx rejects requests that include both:

- function tools
- `max_completion_tokens` / `max_tokens`

OpenCode normally sends tools and an output token cap together. This plugin fixes that:

- **V1** uses a `chat.params` hook to unset `maxOutputTokens` before the SDK builds the request.
- **V2** uses an `http.request` hook to delete `max_tokens` / `max_completion_tokens` from the
  provider request body.

## Development

For local development:

```bash
bun install
bun run test
bun run typecheck
bun run build
```

Add the local plugin path:

```json
{
  "plugins": ["file:///absolute/path/to/opencode-telnyx-auth"]
}
```

The build uses:

```bash
bun build src/index.ts --outdir dist --target node --minify --packages external
```

`dist/index.js` stays small by keeping runtime dependencies external. The only runtime dependency is
`arktype`; `@opencode-ai/plugin` and `@opencode-ai/sdk` are type-only and erased at build time.

## Publishing

This package is set up for npm trusted publishing through GitHub Actions OIDC.

The publish workflow runs on version tags:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Before the workflow can publish, configure npm trusted publishing for:

- package: `@fyko/opencode-plugin-telnyx`
- repository: `Fyko/opencode-plugin-telnyx`
- workflow: `publish.yml`

The workflow does not use an `NPM_TOKEN`; npm receives an OIDC identity token from GitHub Actions.

## Troubleshooting

### `unknown provider "telnyx"`

The plugin is not loaded. Run:

```bash
# V1
opencode plugin @fyko/opencode-plugin-telnyx --global

# V2
opencode2 plugin list
```

Or check the `plugin` / `plugins` entry in `opencode.json`.

### No Telnyx Models Show Up

The API key is missing, invalid, or the models endpoint failed. Run:

```bash
opencode auth list        # V1
opencode2 api get /api/integration   # V2
```

Or set `TELNYX_API_KEY` and retry.

### A Small-Context Model Fails While Larger Models Work

Some smaller models cannot fit OpenCode's full tool list and system prompt into their effective
prompt budget. This is model-specific, not a plugin auth issue.
