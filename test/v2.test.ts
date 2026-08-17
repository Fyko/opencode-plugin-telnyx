import { afterEach, beforeEach, expect, test } from "bun:test"
import type { Plugin } from "@opencode-ai/plugin"
import { telnyxV2Setup } from "../src/v2"

const originalFetch = globalThis.fetch
const originalTelnyxApiKey = process.env.TELNYX_API_KEY
let modelData: unknown[]

beforeEach(() => {
  process.env.TELNYX_API_KEY = "test-key"
  modelData = [
    {
      id: "google/gemma-2b-it",
      object: "model",
      task: "text-generation",
      context_length: 8192,
      max_completion_tokens: null,
      tier: "small",
      is_vision_supported: false,
      pricing: {
        input: "0.200000",
        output: "0.200000",
        cached_prompt: "0.200000",
        currency: "USD",
        unit: "1M_tokens",
      },
    },
  ]
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      object: "list",
      data: modelData,
    }))) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalTelnyxApiKey === undefined) {
    delete process.env.TELNYX_API_KEY
  } else {
    process.env.TELNYX_API_KEY = originalTelnyxApiKey
  }
})

interface CapturedState {
  providers: Map<string, any>
  models: Map<string, any>
  integrations: Map<string, any>
  methods: Map<string, any[]>
  hooks: Record<string, (event: any) => Promise<void> | void>
}

async function setupPlugin(): Promise<CapturedState> {
  const state: CapturedState = {
    providers: new Map(),
    models: new Map(),
    integrations: new Map(),
    methods: new Map(),
    hooks: {},
  }

  const ctx = {
    options: {},
    integration: {
      transform: async (callback: (draft: any) => void) => {
        callback({
          update: (id: string, fn: (integration: any) => void) => {
            const integration = state.integrations.get(id) ?? { id, name: id }
            fn(integration)
            state.integrations.set(id, integration)
          },
          method: {
            update: (input: { integrationID: string; method: unknown }) => {
              const list = state.methods.get(input.integrationID) ?? []
              list.push(input.method)
              state.methods.set(input.integrationID, list)
            },
          },
        })
      },
      connection: {
        active: async () => undefined,
        resolve: async () => undefined,
      },
    },
    catalog: {
      transform: async (callback: (catalog: any) => void) => {
        callback({
          provider: {
            update: (id: string, fn: (provider: any) => void) => {
              const provider = state.providers.get(id) ?? { id, name: id, activation: "auto", package: "" }
              fn(provider)
              state.providers.set(id, provider)
            },
          },
          model: {
            update: (providerID: string, modelID: string, fn: (model: any) => void) => {
              const key = `${providerID}/${modelID}`
              const model = state.models.get(key) ?? {}
              fn(model)
              state.models.set(key, model)
            },
          },
        })
      },
    },
    aisdk: {
      hook: async (name: string, callback: (event: any) => Promise<void> | void) => {
        state.hooks[name] = callback
      },
    },
  } as unknown as Plugin.Context

  await telnyxV2Setup(ctx)
  return state
}

test("registers the telnyx provider with the openai-compatible package", async () => {
  const state = await setupPlugin()

  const provider = state.providers.get("telnyx")
  expect(provider).toBeDefined()
  expect(provider.name).toBe("Telnyx")
  expect(provider.package).toBe("aisdk:@ai-sdk/openai-compatible")
  expect(provider.settings.baseURL).toBe("https://api.telnyx.com/v2/ai/openai")
})

test("registers env and API-key auth methods for the telnyx integration", async () => {
  const state = await setupPlugin()

  expect(state.integrations.get("telnyx")?.name).toBe("Telnyx")
  expect(state.methods.get("telnyx")).toEqual([
    { type: "env", names: ["TELNYX_API_KEY"] },
    { type: "key", label: "API Key" },
  ])
})

test("registered telnyx models include context and output limits", async () => {
  const state = await setupPlugin()

  expect(state.models.get("telnyx/google/gemma-2b-it")?.limit).toEqual({
    context: 8192,
    output: 8192,
  })
})

test("registered telnyx models map pricing into a V2 cost array", async () => {
  modelData = [
    {
      id: "vendor/custom-priced",
      object: "model",
      task: "text-generation",
      context_length: 4096,
      max_completion_tokens: 512,
      tier: "large",
      is_vision_supported: false,
      pricing: {
        input: "9.100000",
        output: "3.400000",
        cached_prompt: "1.200000",
        currency: "USD",
        unit: "1M_tokens",
      },
    },
  ]
  const state = await setupPlugin()

  expect(state.models.get("telnyx/vendor/custom-priced")?.cost).toEqual([
    {
      input: 9.1,
      output: 3.4,
      cache: { read: 1.2, write: 9.1 },
    },
  ])
})

test("registered telnyx models do not synthesize tier pricing", async () => {
  modelData = [
    {
      id: "vendor/unpriced",
      object: "model",
      task: "text-generation",
      context_length: 4096,
      max_completion_tokens: 512,
      tier: "small",
      is_vision_supported: false,
      pricing: {},
    },
  ]
  const state = await setupPlugin()

  expect(state.models.get("telnyx/vendor/unpriced")?.cost).toBeUndefined()
})

test("registered telnyx models ignore pricing with unexpected unit metadata", async () => {
  modelData = [
    {
      id: "vendor/non-usd",
      object: "model",
      task: "text-generation",
      context_length: 4096,
      max_completion_tokens: 512,
      is_vision_supported: false,
      pricing: {
        input: "9.100000",
        output: "3.400000",
        cached_prompt: "1.200000",
        currency: "EUR",
        unit: "tokens",
      },
    },
  ]
  const state = await setupPlugin()

  expect(state.models.get("telnyx/vendor/non-usd")?.cost).toBeUndefined()
})

test("vision models advertise image input capabilities", async () => {
  modelData = [
    {
      id: "vendor/vision-model",
      object: "model",
      task: "text-generation",
      context_length: 4096,
      max_completion_tokens: 512,
      is_vision_supported: true,
      pricing: {},
    },
  ]
  const state = await setupPlugin()

  expect(state.models.get("telnyx/vendor/vision-model")?.capabilities).toEqual({
    tools: true,
    input: ["text", "image"],
    output: ["text"],
  })
})

test("language hook wraps the model and strips maxOutputTokens for telnyx", async () => {
  const state = await setupPlugin()
  const hook = state.hooks["language"]
  expect(hook).toBeDefined()

  const calls: Array<{ method: string; options: any }> = []
  const language = {
    modelId: "vendor/model",
    specificationVersion: "v3",
    provider: "telnyx",
    supportedUrls: {},
    doGenerate: async (options: any) => {
      calls.push({ method: "doGenerate", options })
      return { content: [], finishReason: "stop" }
    },
    doStream: async (options: any) => {
      calls.push({ method: "doStream", options })
      return { stream: new ReadableStream() }
    },
  }

  let event = {
    model: { providerID: "telnyx", modelID: "vendor/model", id: "vendor/model" },
    sdk: { languageModel: () => language },
    options: {},
    language,
  }
  await hook!(event)

  expect(event.language).toBeDefined()
  await event.language.doGenerate({ prompt: [], maxOutputTokens: 2048 })
  await event.language.doStream({ prompt: [], maxOutputTokens: 4096 })

  expect(calls).toHaveLength(2)
  expect(calls[0].options.maxOutputTokens).toBeUndefined()
  expect(calls[1].options.maxOutputTokens).toBeUndefined()
})

test("language hook constructs and wraps the model when none is provided", async () => {
  const state = await setupPlugin()
  const hook = state.hooks["language"]

  const calls: any[] = []
  const language = {
    doGenerate: async (options: any) => {
      calls.push(options)
      return { content: [], finishReason: "stop" }
    },
    doStream: async (options: any) => {
      calls.push(options)
      return { stream: new ReadableStream() }
    },
  }

  let event = {
    model: { providerID: "telnyx", modelID: "vendor/model", id: "vendor/model" },
    sdk: { languageModel: (id: string) => language },
    options: {},
    language: undefined,
  }
  await hook!(event)

  expect(event.language).toBeDefined()
  await event.language.doGenerate({ prompt: [], maxOutputTokens: 2048 })
  expect(calls[0].maxOutputTokens).toBeUndefined()
})

test("language hook leaves other providers untouched", async () => {
  const state = await setupPlugin()
  const hook = state.hooks["language"]

  const language = {
    doGenerate: async (options: any) => ({ content: [], finishReason: "stop" }),
    doStream: async (options: any) => ({ stream: new ReadableStream() }),
  }

  let event = {
    model: { providerID: "openai", modelID: "gpt-5", id: "gpt-5" },
    sdk: { languageModel: () => language },
    options: {},
    language,
  }
  await hook!(event)

  expect(event.language).toBe(language)
})
