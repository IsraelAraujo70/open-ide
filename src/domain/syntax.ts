/**
 * Simple syntax highlighting for common languages
 * 
 * Uses regex-based tokenization to provide basic syntax highlighting
 * until Tree-sitter integration is available.
 */

import type { ThemeColors } from "./types.ts"

// Token types that map to theme colors
export type TokenType = 
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "variable"
  | "type"
  | "operator"
  | "punctuation"
  | "default"

export interface Token {
  type: TokenType
  start: number  // character offset in full text
  end: number    // character offset in full text
  text: string
}

// Keywords for different languages
const jsKeywords = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "default", "delete", "do", "else", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "let",
  "new", "null", "of", "return", "static", "super", "switch", "this", "throw",
  "true", "try", "typeof", "undefined", "var", "void", "while", "with", "yield",
  "from", "as", "implements", "interface", "package", "private", "protected",
  "public", "abstract", "enum", "readonly", "declare", "type", "namespace",
  "module", "keyof", "infer", "never", "unknown", "any", "is", "asserts",
])

const tsTypes = new Set([
  "string", "number", "boolean", "object", "symbol", "bigint", "void",
  "null", "undefined", "never", "unknown", "any", "Array", "Object",
  "String", "Number", "Boolean", "Function", "Promise", "Map", "Set",
  "Record", "Partial", "Required", "Readonly", "Pick", "Omit", "Exclude",
  "Extract", "NonNullable", "ReturnType", "Parameters", "InstanceType",
])

const operators = new Set([
  "=", "+", "-", "*", "/", "%", "**", "++", "--",
  "==", "===", "!=", "!==", "<", ">", "<=", ">=",
  "&&", "||", "!", "??", "?.", "?:",
  "&", "|", "^", "~", "<<", ">>", ">>>",
  "=>", "...", "?",
])

/**
 * Tokenize JavaScript/TypeScript code
 */
export function tokenizeJS(code: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  
  while (i < code.length) {
    const char = code[i]!
    const remaining = code.slice(i)
    
    // Skip whitespace
    if (/\s/.test(char)) {
      i++
      continue
    }
    
    // Single-line comment
    if (remaining.startsWith("//")) {
      const end = code.indexOf("\n", i)
      const actualEnd = end === -1 ? code.length : end
      tokens.push({
        type: "comment",
        start: i,
        end: actualEnd,
        text: code.slice(i, actualEnd),
      })
      i = actualEnd
      continue
    }
    
    // Multi-line comment
    if (remaining.startsWith("/*")) {
      const end = code.indexOf("*/", i + 2)
      const actualEnd = end === -1 ? code.length : end + 2
      tokens.push({
        type: "comment",
        start: i,
        end: actualEnd,
        text: code.slice(i, actualEnd),
      })
      i = actualEnd
      continue
    }
    
    // String (double quotes)
    if (char === '"') {
      let j = i + 1
      while (j < code.length && code[j] !== '"') {
        if (code[j] === "\\") j++ // skip escaped char
        j++
      }
      j++ // include closing quote
      tokens.push({
        type: "string",
        start: i,
        end: j,
        text: code.slice(i, j),
      })
      i = j
      continue
    }
    
    // String (single quotes)
    if (char === "'") {
      let j = i + 1
      while (j < code.length && code[j] !== "'") {
        if (code[j] === "\\") j++
        j++
      }
      j++
      tokens.push({
        type: "string",
        start: i,
        end: j,
        text: code.slice(i, j),
      })
      i = j
      continue
    }
    
    // Template string
    if (char === "`") {
      let j = i + 1
      while (j < code.length && code[j] !== "`") {
        if (code[j] === "\\") j++
        j++
      }
      j++
      tokens.push({
        type: "string",
        start: i,
        end: j,
        text: code.slice(i, j),
      })
      i = j
      continue
    }
    
    // Number
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(code[i + 1] ?? ""))) {
      let j = i
      // Handle hex, binary, octal
      if (code[i] === "0" && /[xXbBoO]/.test(code[i + 1] ?? "")) {
        j += 2
        while (j < code.length && /[0-9a-fA-F_]/.test(code[j] ?? "")) j++
      } else {
        while (j < code.length && /[0-9._eE+-]/.test(code[j] ?? "")) j++
      }
      // Handle BigInt suffix
      if (code[j] === "n") j++
      tokens.push({
        type: "number",
        start: i,
        end: j,
        text: code.slice(i, j),
      })
      i = j
      continue
    }
    
    // Identifier or keyword
    if (/[a-zA-Z_$]/.test(char)) {
      let j = i
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j] ?? "")) j++
      const word = code.slice(i, j)
      
      let type: TokenType = "variable"
      if (jsKeywords.has(word)) {
        type = "keyword"
      } else if (tsTypes.has(word)) {
        type = "type"
      } else if (code[j] === "(") {
        type = "function"
      }
      
      tokens.push({
        type,
        start: i,
        end: j,
        text: word,
      })
      i = j
      continue
    }
    
    // Multi-char operators
    const threeChar = code.slice(i, i + 3)
    const twoChar = code.slice(i, i + 2)
    
    if (operators.has(threeChar)) {
      tokens.push({
        type: "operator",
        start: i,
        end: i + 3,
        text: threeChar,
      })
      i += 3
      continue
    }
    
    if (operators.has(twoChar)) {
      tokens.push({
        type: "operator",
        start: i,
        end: i + 2,
        text: twoChar,
      })
      i += 2
      continue
    }
    
    if (operators.has(char)) {
      tokens.push({
        type: "operator",
        start: i,
        end: i + 1,
        text: char,
      })
      i++
      continue
    }
    
    // Punctuation
    if (/[{}()\[\];,.:@#]/.test(char)) {
      tokens.push({
        type: "punctuation",
        start: i,
        end: i + 1,
        text: char,
      })
      i++
      continue
    }
    
    // Unknown - skip
    i++
  }
  
  return tokens
}

/**
 * Get color for a token type from theme
 */
export function getTokenColor(type: TokenType, colors: ThemeColors): string {
  switch (type) {
    case "keyword": return colors.keyword
    case "string": return colors.string
    case "number": return colors.number
    case "comment": return colors.comment
    case "function": return colors.function
    case "variable": return colors.variable
    case "type": return colors.type
    case "operator": return colors.operator
    case "punctuation": return colors.comment
    default: return colors.foreground
  }
}

/**
 * Detect language from file extension
 */
export function detectLanguageForHighlight(filePath: string | null): string | null {
  if (!filePath) return null
  
  const ext = filePath.split(".").pop()?.toLowerCase()
  
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript"
    case "json":
      return "json"
    case "md":
    case "mdx":
      return "markdown"
    case "css":
    case "scss":
    case "sass":
    case "less":
      return "css"
    case "html":
    case "htm":
      return "html"
    case "py":
      return "python"
    case "rs":
      return "rust"
    case "go":
      return "go"
    default:
      return null
  }
}
