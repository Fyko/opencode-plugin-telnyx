import type { Config, Plugin } from "@opencode-ai/plugin/v1"
import type { ProviderConfig } from "@opencode-ai/sdk"
import { apiKey, loadApiAuth, PROVIDER_ID } from "./auth"
import { fetchTelnyxModels, modelBasics, OPENAI_BASE, pricingNumber, type TelnyxModel } from "./models"

type ProviderModels = NonNullable<ProviderConfig["models"]>
type ProviderModel = ProviderModels[string]
type ProviderCost = NonNullable<ProviderModel["cost"]>

function v1ModelCost(pricing: TelnyxModel["pricing"]): ProviderCost | undefined {
  if (!pricing) return undefined
  if (pricing.currency !== "USD" || pricing.unit !== "1M_tokens") return undefined

  const input = pricingNumber(pricing.input)
  const output = pricingNumber(pricing.output)
  const cacheRead = pricingNumber(pricing.cached_prompt)
  if (input === undefined || output === undefined) return undefined

  return {
    input,
    output,
    ...(cacheRead !== undefined ? { cache_read: cacheRead } : {}),
  }
}

function v1ModelConfig(model: TelnyxModel): [string, ProviderModel] {
  const { id, shortId, context, output, vision } = modelBasics(model)
  const cost = v1ModelCost(model.pricing)

  return [
    id,
    {
      name: shortId,
      limit: { context, output },
      ...(cost ? { cost } : {}),
      ...(vision
        ? {
            attachment: true,
            modalities: {
              input: ["text", "image"],
              output: ["text"],
            },
          }
        : {}),
    },
  ]
}

async function v1Models(key: string | undefined): Promise<ProviderModels> {
  return Object.fromEntries((await fetchTelnyxModels(key)).map(v1ModelConfig))
}

export const telnyxV1: Plugin = async () => {
  const key = apiKey()
  const models = await v1Models(key)

  return {
    auth: {
      provider: PROVIDER_ID,
      methods: [{ type: "api", label: "API Key" }],
      loader: loadApiAuth,
    },

    config: async (config: Config) => {
      config.provider ??= {}
      config.provider[PROVIDER_ID] = {
        npm: "@ai-sdk/openai-compatible",
        name: "Telnyx",
        options: {
          baseURL: OPENAI_BASE,
          ...(key ? { apiKey: key } : {}),
        },
        models,
      }
    },

    "chat.params": async (input: { model?: { providerID?: string } }, output: { maxOutputTokens?: number }) => {
      if (input.model?.providerID === PROVIDER_ID) output.maxOutputTokens = undefined
    },
  }
}
