import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { type as arkType } from "arktype"
import type { Plugin } from "@opencode-ai/plugin"

export const PROVIDER_ID = "telnyx"

// --- V1 auth ---------------------------------------------------------------

const ApiAuth = arkType({
  type: "'api'",
  key: "string",
})

const StoredAuthFile = arkType({
  "telnyx?": ApiAuth,
})

function authFilePath(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "auth.json")
}

function storedApiKey(): string | undefined {
  try {
    const rawAuth: unknown = JSON.parse(readFileSync(authFilePath(), "utf8"))
    const auth = StoredAuthFile(rawAuth)
    if (auth instanceof arkType.errors) return undefined
    return auth.telnyx?.key ? auth.telnyx.key : undefined
  } catch {
    return undefined
  }
}

export function apiKey(): string | undefined {
  return process.env.TELNYX_API_KEY ?? storedApiKey()
}

export async function loadApiAuth(auth: () => Promise<unknown>): Promise<{ apiKey: string } | Record<string, never>> {
  const stored = ApiAuth(await auth())
  return stored instanceof arkType.errors ? {} : { apiKey: stored.key }
}

// --- V2 auth ---------------------------------------------------------------

/**
 * Resolve the Telnyx API key from the environment variable or the stored
 * integration credential. The environment variable takes precedence, matching
 * the V1 plugin's behavior.
 */
export async function resolveApiKey(ctx: Plugin.Context): Promise<string | undefined> {
  const envKey = process.env.TELNYX_API_KEY
  if (envKey) return envKey

  const connection = await ctx.integration.connection.active(PROVIDER_ID)
  if (!connection) return undefined
  if (connection.type === "env") return process.env[connection.name]

  const credential = await ctx.integration.connection.resolve(connection)
  return credential?.type === "key" ? credential.key : undefined
}
