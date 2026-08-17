import { expect, test } from "bun:test"
import TelnyxPlugin from "../src/index"

test("default export exposes both the V1 server and V2 setup entrypoints", () => {
  expect(typeof TelnyxPlugin.id).toBe("string")
  expect(TelnyxPlugin.id).toBe("fyko.telnyx")
  expect(typeof TelnyxPlugin.server).toBe("function")
  expect(typeof TelnyxPlugin.setup).toBe("function")
})
