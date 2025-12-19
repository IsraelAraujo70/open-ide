import { describe, expect, it } from "bun:test"

import { getFileIcon, getFolderIcon } from "./fileIcons.ts"

describe("getFileIcon", () => {
  it("prefers special filenames (exact match)", () => {
    expect(getFileIcon("package.json")).toEqual({ icon: "{}", color: "#e8274b" })
  })

  it("falls back to extension match", () => {
    expect(getFileIcon("main.ts")).toEqual({ icon: "TS", color: "#3178c6" })
  })

  it("normalizes extension case", () => {
    expect(getFileIcon("README.MD")).toEqual({ icon: "M↓", color: "#519aba" })
  })

  it("falls back to default icon for unknown extensions", () => {
    expect(getFileIcon("file.unknown")).toEqual({ icon: "○", color: "#6d8086" })
  })
})

describe("getFolderIcon", () => {
  it("returns open and closed icons based on state", () => {
    expect(getFolderIcon("src", true)).toBe("▼")
    expect(getFolderIcon("src", false)).toBe("▶")
  })
})
