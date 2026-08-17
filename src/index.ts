import { telnyxV1 } from "./v1"
import { telnyxV2Setup } from "./v2"

/**
 * Dual-compatible plugin module. OpenCode V1's loader reads `server`; OpenCode
 * V2's loader reads `setup`. Each loader ignores the other's key.
 */
export default {
  id: "fyko.telnyx",
  server: telnyxV1,
  setup: telnyxV2Setup,
}
