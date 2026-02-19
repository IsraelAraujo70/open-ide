import { describe, expect, it } from "bun:test"
import { getFiletype } from "./treeSitter.ts"

describe("getFiletype", () => {
  it("maps known extensions to strict filetypes", () => {
    expect(getFiletype("/tmp/main.ts")).toBe("typescript")
    expect(getFiletype("/tmp/main.tsx")).toBe("typescript")
    expect(getFiletype("/tmp/main.py")).toBe("python")
    expect(getFiletype("/tmp/main.go")).toBe("go")
    expect(getFiletype("/tmp/main.rs")).toBe("rust")
    expect(getFiletype("/tmp/main.json")).toBe("json")
  })

  it("normalizes extension casing", () => {
    expect(getFiletype("/tmp/README.MD")).toBe("markdown")
    expect(getFiletype("/tmp/STYLE.CSS")).toBe("css")
  })

  it("returns null for unknown extensions", () => {
    expect(getFiletype("/tmp/file.unknown")).toBeNull()
    expect(getFiletype("/tmp/no-extension")).toBeNull()
  })
})
