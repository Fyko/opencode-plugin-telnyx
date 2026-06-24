import { afterEach, beforeEach, expect, test } from "bun:test"
import type { Config } from "@opencode-ai/sdk"
import TelnyxAuthPlugin from "../src/index"

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

test("registered telnyx models include the sdk-required output limit", async () => {
  const hooks = await TelnyxAuthPlugin({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["google/gemma-2b-it"]?.limit).toEqual({
    context: 8192,
    output: expect.any(Number),
  })
})

test("registered telnyx models use pricing returned by the models api", async () => {
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
  const hooks = await TelnyxAuthPlugin({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["vendor/custom-priced"]?.cost).toEqual({
    input: 9.1,
    output: 3.4,
    cache_read: 1.2,
  })
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
  const hooks = await TelnyxAuthPlugin({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["vendor/unpriced"]?.cost).toBeUndefined()
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
  const hooks = await TelnyxAuthPlugin({} as never)
  const config: Config = {}

  await hooks.config?.(config)

  expect(config.provider?.telnyx?.models?.["vendor/non-usd"]?.cost).toBeUndefined()
})
