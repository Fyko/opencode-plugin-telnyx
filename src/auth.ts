import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { type as arkType } from "arktype"

export const PROVIDER_ID = "telnyx"

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
