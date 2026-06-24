# @fyko/opencode-plugin-telnyx

OpenCode plugin that adds [Telnyx](https://telnyx.com/products/inference) as a provider.

## What It Does

- Registers a `telnyx` provider via `@ai-sdk/openai-compatible`
- Adds `telnyx` to `opencode auth login`
- Reads the Telnyx API key from either `TELNYX_API_KEY` or OpenCode's stored auth file
- Fetches available models from `https://api.telnyx.com/v2/ai/models` at startup
- Validates Telnyx model payloads with ArkType before registering them
- Maps Telnyx pricing metadata into OpenCode model costs when the API reports `USD` per `1M_tokens`
- Filters out known pass-through providers like `openai/*`, `anthropic/*`, `google/gemini-*`, and `xai-org/*`
- Strips `maxOutputTokens` before Telnyx requests so tool-enabled runs are accepted

## Install

```bash
opencode plugin @fyko/opencode-plugin-telnyx --global
```

Or add it manually to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "@fyko/opencode-plugin-telnyx"
  ]
}
```

## Auth

Log in with your Telnyx API key:

```bash
opencode auth login --provider telnyx --method "API Key"
```

Or set an environment variable:

```bash
export TELNYX_API_KEY="YOUR_KEY"
```

Auth precedence is:

1. `TELNYX_API_KEY`
2. Stored `telnyx` API credential in `~/.local/share/opencode/auth.json`

Verify the provider is connected:

```bash
opencode auth list
```

## Usage

List registered Telnyx models:

```bash
opencode models telnyx --verbose
```

Run a model:

```bash
opencode run --model 'telnyx/moonshotai/Kimi-K2.5' 'say hello in one sentence.'
```

The model list is dynamic. Use `opencode models telnyx` to see what Telnyx currently exposes for your account.

## Model Registration

At startup the plugin calls:

```text
GET https://api.telnyx.com/v2/ai/models
```

It registers text generation models after validating the response shape with ArkType. Model context limits, output limits, vision support, and pricing come from the Telnyx API response.

Models with empty or unexpected pricing metadata are still registered, but without a `cost` field.

## Why the Request Hook Exists

Telnyx rejects requests that include both:

- function tools
- `max_completion_tokens` / `max_tokens`

OpenCode normally sends tools and an output token cap together. This plugin fixes that by unsetting `maxOutputTokens` for the `telnyx` provider before the SDK builds the request.

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
  "plugin": [
    "file:///absolute/path/to/opencode-plugin-telnyx"
  ]
}
```

The build uses:

```bash
bun build src/index.ts --outdir dist --target node --minify --packages external
```

`dist/index.js` stays small by keeping runtime dependencies external. Install dependencies before loading a local checkout.

## Publishing

This package is set up for npm trusted publishing through GitHub Actions OIDC.

The publish workflow runs on version tags:

```bash
git tag v0.1.0
git push origin v0.1.0
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
opencode plugin @fyko/opencode-plugin-telnyx --global
```

Or check the `plugin` entry in `opencode.json`.

### No Telnyx Models Show Up

The API key is missing, invalid, or the models endpoint failed. Run:

```bash
opencode auth list
```

Or set `TELNYX_API_KEY` and retry.

### A Small-Context Model Fails While Larger Models Work

Some smaller models cannot fit OpenCode's full tool list and system prompt into their effective prompt budget. This is model-specific, not a plugin auth issue.
