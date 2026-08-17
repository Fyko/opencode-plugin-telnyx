import { afterEach, beforeEach, expect, test } from "bun:test"
import type { Config } from "@opencode-ai/sdk"
import { telnyxV1 } from "../src/v1"

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

test("v1 config registers the telnyx provider with models", async () => {
  const hooks = await telnyxV1({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.npm).toBe("@ai-sdk/openai-compatible")
  expect(config.provider?.telnyx?.name).toBe("Telnyx")
  expect(config.provider?.telnyx?.options?.baseURL).toBe("https://api.telnyx.com/v2/ai/openai")
  expect(config.provider?.telnyx?.models?.["google/gemma-2b-it"]?.limit).toEqual({
    context: 8192,
    output: 8192,
  })
})

test("v1 models map pricing into the V1 cost shape with cache_read", async () => {
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
  const hooks = await telnyxV1({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["vendor/custom-priced"]?.cost).toEqual({
    input: 9.1,
    output: 3.4,
    cache_read: 1.2,
  })
})

test("v1 models do not synthesize tier pricing", async () => {
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
  const hooks = await telnyxV1({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["vendor/unpriced"]?.cost).toBeUndefined()
})

test("v1 models ignore pricing with unexpected unit metadata", async () => {
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
  const hooks = await telnyxV1({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["vendor/non-usd"]?.cost).toBeUndefined()
})

test("v1 vision models advertise image input", async () => {
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
  const hooks = await telnyxV1({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["vendor/vision-model"]?.modalities).toEqual({
    input: ["text", "image"],
    output: ["text"],
  })
})

test("v1 auth exposes an API key method", async () => {
  const hooks = await telnyxV1({} as never)

  expect(hooks.auth?.provider).toBe("telnyx")
  expect(hooks.auth?.methods).toEqual([{ type: "api", label: "API Key" }])
  expect(typeof hooks.auth?.loader).toBe("function")
})

test("v1 chat.params unsets maxOutputTokens for telnyx", async () => {
  const hooks = await telnyxV1({} as never)

  const output = { maxOutputTokens: 2048 }
  await hooks["chat.params"]?.({ model: { providerID: "telnyx" } } as never, output)
  expect(output.maxOutputTokens).toBeUndefined()
})

test("v1 chat.params leaves other providers untouched", async () => {
  const hooks = await telnyxV1({} as never)

  const output = { maxOutputTokens: 2048 }
  await hooks["chat.params"]?.({ model: { providerID: "openai" } } as never, output)
  expect(output.maxOutputTokens).toBe(2048)
})
