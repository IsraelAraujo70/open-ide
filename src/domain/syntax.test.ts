import { describe, expect, it } from "bun:test"

import type { ThemeColors } from "./types.ts"
import { detectLanguageForHighlight, getTokenColor, tokenizeJS } from "./syntax.ts"

describe("tokenizeJS", () => {
  it("tokenizes keywords, types, strings, numbers and comments", () => {
    const code = `const name: string = 'opencode'\n// comment\nlet n = 42`

    const tokens = tokenizeJS(code).map(t => ({ type: t.type, text: t.text }))

    expect(tokens).toContainEqual({ type: "keyword", text: "const" })
    expect(tokens).toContainEqual({ type: "variable", text: "name" })
    expect(tokens).toContainEqual({ type: "type", text: "string" })
    expect(tokens).toContainEqual({ type: "string", text: "'opencode'" })
    expect(tokens).toContainEqual({ type: "comment", text: "// comment" })
    expect(tokens).toContainEqual({ type: "keyword", text: "let" })
    expect(tokens).toContainEqual({ type: "number", text: "42" })
  })

  it("classifies function calls as function tokens", () => {
    const code = "print(123)"
    const tokens = tokenizeJS(code).map(t => ({ type: t.type, text: t.text }))

    expect(tokens).toContainEqual({ type: "function", text: "print" })
  })
})

describe("getTokenColor", () => {
  const colors: ThemeColors = {
    background: "bg",
    foreground: "fg",
    primary: "primary",
    secondary: "secondary",
    accent: "accent",
    error: "error",
    warning: "warning",
    success: "success",
    info: "info",
    border: "border",
    selection: "selection",
    lineHighlight: "lineHighlight",
    comment: "comment",
    keyword: "keyword",
    string: "string",
    number: "number",
    function: "function",
    variable: "variable",
    type: "type",
    operator: "operator",
  }

  it("maps token types to theme colors", () => {
    expect(getTokenColor("keyword", colors)).toBe("keyword")
    expect(getTokenColor("string", colors)).toBe("string")
    expect(getTokenColor("number", colors)).toBe("number")
    expect(getTokenColor("function", colors)).toBe("function")
    expect(getTokenColor("operator", colors)).toBe("operator")
    expect(getTokenColor("punctuation", colors)).toBe("comment")
    expect(getTokenColor("default", colors)).toBe("fg")
  })
})

describe("detectLanguageForHighlight", () => {
  it("returns null for missing paths", () => {
    expect(detectLanguageForHighlight(null)).toBeNull()
  })

  it("maps common extensions to a language id", () => {
    expect(detectLanguageForHighlight("a.ts")).toBe("javascript")
    expect(detectLanguageForHighlight("a.tsx")).toBe("javascript")
    expect(detectLanguageForHighlight("a.md")).toBe("markdown")
    expect(detectLanguageForHighlight("a.json")).toBe("json")
  })

  it("returns null for unknown extensions", () => {
    expect(detectLanguageForHighlight("a.weird")).toBeNull()
  })
})
