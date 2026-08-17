import type { Plugin } from "@opencode-ai/plugin"
import { PROVIDER_ID, resolveApiKey } from "./auth"
import { fetchTelnyxModels, modelBasics, OPENAI_BASE, pricingNumber, type TelnyxModel } from "./models"

interface ModelPatch {
  name: string
  capabilities: { tools: boolean; input: string[]; output: string[] }
  limit: { context: number; output: number }
  cost?: Array<{ input: number; output: number; cache: { read: number; write: number } }>
}

function v2ModelCost(pricing: TelnyxModel["pricing"]): ModelPatch["cost"] {
  if (!pricing) return undefined
  if (pricing.currency !== "USD" || pricing.unit !== "1M_tokens") return undefined

  const input = pricingNumber(pricing.input)
  const output = pricingNumber(pricing.output)
  if (input === undefined || output === undefined) return undefined

  // Telnyx reports cached-prompt reads but no separate cache-write price.
  // Cache reads use the discounted rate when reported; writes cost the input rate.
  const cacheRead = pricingNumber(pricing.cached_prompt) ?? input

  return [
    {
      input,
      output,
      cache: { read: cacheRead, write: input },
    },
  ]
}

function v2ModelConfig(model: TelnyxModel): [string, ModelPatch] {
  const { id, shortId, context, output, vision } = modelBasics(model)
  const cost = v2ModelCost(model.pricing)

  return [
    id,
    {
      name: shortId,
      limit: { context, output },
      capabilities: vision
        ? { tools: true, input: ["text", "image"], output: ["text"] }
        : { tools: true, input: ["text"], output: ["text"] },
      ...(cost ? { cost } : {}),
    },
  ]
}

async function v2Models(key: string | undefined): Promise<Record<string, ModelPatch>> {
  return Object.fromEntries((await fetchTelnyxModels(key)).map(v2ModelConfig))
}

export const telnyxV2Setup: Plugin.Plugin["setup"] = async (ctx) => {
  const key = await resolveApiKey(ctx)
  const models = await v2Models(key)

  // Auth: expose `telnyx` to `opencode2 auth login` via an API key method,
  // and let `TELNYX_API_KEY` serve as an environment-based connection.
  await ctx.integration.transform((draft) => {
    draft.update(PROVIDER_ID, (integration) => {
      integration.name = "Telnyx"
    })
    draft.method.update({
      integrationID: PROVIDER_ID,
      method: { type: "env", names: ["TELNYX_API_KEY"] },
    })
    draft.method.update({
      integrationID: PROVIDER_ID,
      method: { type: "key", label: "API Key" },
    })
  })

  // Provider + models. The provider shares its ID with the integration, so
  // OpenCode resolves its API key from the integration connection.
  await ctx.catalog.transform((catalog) => {
    catalog.provider.update(PROVIDER_ID, (provider) => {
      provider.name = "Telnyx"
      provider.package = "aisdk:@ai-sdk/openai-compatible"
      provider.settings = { baseURL: OPENAI_BASE }
    })

    for (const [id, patch] of Object.entries(models)) {
      catalog.model.update(PROVIDER_ID, id, (draft) => Object.assign(draft, patch))
    }
  })

  // Telnyx rejects requests that pair function tools with an output token
  // cap. The AI SDK models used here don't pass through `http.request`, so
  // wrap the language model and drop `maxOutputTokens` before `doGenerate`
  // / `doStream` turn it into `max_tokens` / `max_completion_tokens`.
  await ctx.aisdk.hook("language", (event) => {
    if (event.model.providerID !== PROVIDER_ID) return

    const language = event.language ?? (event.sdk?.languageModel?.(event.model.modelID) as typeof event.language)
    if (!language) return

    event.language = {
      ...language,
      doGenerate: (options) => language.doGenerate({ ...options, maxOutputTokens: undefined }),
      doStream: (options) => language.doStream({ ...options, maxOutputTokens: undefined }),
    }
  })
}
