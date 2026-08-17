import { type as arkType } from "arktype"

export const API_BASE = "https://api.telnyx.com/v2/ai"
export const OPENAI_BASE = `${API_BASE}/openai`
const MODELS_URL = `${API_BASE}/models`
const TEXT_TASKS = new Set(["text-generation", "text generation"])
const PASSTHROUGH_PREFIXES = ["openai/", "anthropic/", "google/gemini-", "xai-org/"]

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

export type TelnyxModel = typeof TelnyxModel.infer

export interface TelnyxModelBasics {
  id: string
  shortId: string
  context: number
  output: number
  vision: boolean
}

export function pricingNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined
}

/** Shared derivation of the fields every model mapper needs. */
export function modelBasics(model: TelnyxModel): TelnyxModelBasics {
  const id = model.id
  const context = model.context_length
  const output = typeof model.max_completion_tokens === "number" ? model.max_completion_tokens : context
  return {
    id,
    shortId: id.includes("/") ? id.split("/").pop() ?? id : id,
    context,
    output,
    vision: model.is_vision_supported === true,
  }
}

/** Fetch and validate Telnyx's model list, keeping only text-generation models. */
export async function fetchTelnyxModels(key: string | undefined): Promise<TelnyxModel[]> {
  if (!key) return []

  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return []

    const rawPayload: unknown = await response.json()
    const payload = TelnyxModelsResponse(rawPayload)
    if (payload instanceof arkType.errors) return []

    return payload.data.flatMap((item) => {
      const model = TelnyxModel(item)
      if (model instanceof arkType.errors) return []
      if (!TEXT_TASKS.has(model.task)) return []
      if (PASSTHROUGH_PREFIXES.some((prefix) => model.id.startsWith(prefix))) return []
      return [model]
    })
  } catch {
    return []
  }
}
