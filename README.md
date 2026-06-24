# opencode-telnyx-auth

OpenCode plugin that adds Telnyx as a provider, supports `opencode auth login`, auto-registers supported Telnyx-hosted chat models, and works around Telnyx's `max_completion_tokens` + tools incompatibility.

## What it does

- registers a `telnyx` provider via `@ai-sdk/openai-compatible`
- adds `telnyx` to `opencode auth login`
- reads the Telnyx API key from either:
  - `TELNYX_API_KEY`
  - `~/.local/share/opencode/auth.json` via `opencode auth login`
- fetches available models from `https://api.telnyx.com/v2/ai/models` at startup
- filters out pass-through providers like `openai/*`, `anthropic/*`, `google/gemini-*`, and `xai-org/*`
- strips `maxOutputTokens` before requests so Telnyx accepts tool-enabled runs

## Setup

1. Clone this repo somewhere local.
2. Install dependencies and build it:

   ```bash
   bun install
   bun run build
   ```

3. Add the plugin to your `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": [
       "file:///absolute/path/to/opencode-telnyx-auth"
     ]
   }
   ```

4. Log in with your Telnyx API key:

   ```bash
   opencode auth login --provider telnyx --method "API Key"
   ```

   Or set an env var instead:

   ```bash
   export TELNYX_API_KEY="YOUR_KEY"
   ```

5. Verify the credential is present:

   ```bash
   opencode auth list
   ```

6. Run a model:

   ```bash
   opencode run --model 'telnyx/moonshotai/Kimi-K2.5' 'Say hello in one sentence.'
   ```

## How auth works

Auth precedence is:

1. `TELNYX_API_KEY`
2. stored `telnyx` API credential in `~/.local/share/opencode/auth.json`

`opencode auth login` stores the key in OpenCode's normal auth store, so this behaves like a native provider instead of relying on hardcoded config.

## Model registration

At startup the plugin calls:

- `GET https://api.telnyx.com/v2/ai/models`

It registers Telnyx-hosted text generation models automatically. Pass-through providers are intentionally excluded because they need their own upstream credentials and should use their own native provider paths.

## Why the plugin exists

Telnyx rejects requests that include both:

- function tools
- `max_completion_tokens` / `max_tokens`

OpenCode normally sends tools and an output token cap together. The plugin fixes that by unsetting `maxOutputTokens` for the `telnyx` provider before the SDK builds the request.

## Build

```bash
bun run build
bun run typecheck
```

## Troubleshooting

### `Unknown provider "telnyx"`

The plugin is not loaded. Check the `file:///...` path in `opencode.json` and rebuild the plugin.

### No Telnyx models show up

The API key is missing or invalid. Run:

```bash
opencode auth list
```

or set `TELNYX_API_KEY` and retry.

### A small-context model fails while larger models work

Some smaller models cannot fit OpenCode's full tool list and system prompt into their effective prompt budget. This is model-specific, not a plugin auth issue.

<details>
<summary>Agent notes (humans can ignore)</summary>

- local build/install commands assume `bun` is installed
- package manager is `bun`; use `bun install`, `bun run build`, and `bun run typecheck`
- runtime dependency is `@opencode-ai/plugin`
- local build-time dependencies are `typescript` and `@types/node`
- OpenCode loads the built plugin from `dist/`, so cloning the repo alone is not enough; it must be built first
- a valid Telnyx API key is required either via `TELNYX_API_KEY` or `opencode auth login`
- provider id is `telnyx`
- auth hook method is `API Key`
- auth precedence is env first, then stored auth.json key
- model list is dynamic; do not hardcode model ids in downstream automation
- pass-through prefixes are intentionally excluded: `openai/`, `anthropic/`, `google/gemini-`, `xai-org/`
- the Telnyx compatibility fix is in the `chat.params` hook and only unsets `maxOutputTokens`

</details>
