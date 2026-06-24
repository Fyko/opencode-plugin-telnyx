import type { Config, Plugin } from "@opencode-ai/plugin"
import { apiKey, loadApiAuth, PROVIDER_ID } from "./auth"
import { fetchModels, OPENAI_BASE } from "./models"

const TelnyxAuthPlugin: Plugin = async () => {
  const key = apiKey()
  const models = await fetchModels(key)

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

export default TelnyxAuthPlugin
