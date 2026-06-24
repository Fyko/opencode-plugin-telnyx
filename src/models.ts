import { type as arkType } from "arktype"
import type { ProviderConfig } from "@opencode-ai/sdk"

const API_BASE = "https://api.telnyx.com/v2/ai"
export const OPENAI_BASE = `${API_BASE}/openai`
const MODELS_URL = `${API_BASE}/models`
const TEXT_TASKS = new Set(["text-generation", "text generation"])
const PASSTHROUGH_PREFIXES = ["openai/", "anthropic/", "google/gemini-", "xai-org/"]

type ProviderModels = NonNullable<ProviderConfig["models"]>
type ProviderModel = ProviderModels[string]
type ProviderCost = NonNullable<ProviderModel["cost"]>

const TelnyxModelsResponse = arkType({
  object: "'list'",
  data: "unknown[]",
})

const TelnyxModel = arkType({
  id: "string",
  task: "string",
  context_length: "number",
  "max_completion_tokens?": "number | null",
  "is_vision_supported?": "boolean",
  "pricing?": {
    "input?": "string | number | null",
    "output?": "string | number | null",
    "cached_prompt?": "string | number | null",
    "currency?": "string | null",
    "unit?": "string | null",
  },
})

type TelnyxModel = typeof TelnyxModel.infer

function pricingNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined
}

function modelCostFromPricing(pricing: TelnyxModel["pricing"]): ProviderCost | undefined {
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

function modelConfig(model: TelnyxModel): [string, ProviderModel] | undefined {
  const id = model.id
  const task = model.task
  const context = model.context_length
  if (!TEXT_TASKS.has(task)) return undefined
  if (PASSTHROUGH_PREFIXES.some((prefix) => id.startsWith(prefix))) return undefined

  const shortId = id.includes("/") ? id.split("/").pop() ?? id : id
  const output = typeof model.max_completion_tokens === "number" ? model.max_completion_tokens : context
  const vision = model.is_vision_supported === true
  const cost = modelCostFromPricing(model.pricing)

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

export async function fetchModels(key: string | undefined): Promise<ProviderModels> {
  if (!key) return {}

  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return {}

    const rawPayload: unknown = await response.json()
    const payload = TelnyxModelsResponse(rawPayload)
    if (payload instanceof arkType.errors) return {}

    return Object.fromEntries(payload.data.flatMap((item) => {
      const model = TelnyxModel(item)
      if (model instanceof arkType.errors) return []
      const parsed = modelConfig(model)
      return parsed ? [parsed] : []
    }))
  } catch {
    return {}
  }
}
