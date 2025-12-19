/**
 * SyntaxStyle factory for mapping theme colors to Tree-sitter highlight groups
 */

import { SyntaxStyle, parseColor } from "@opentui/core"
import type { Theme } from "../domain/types.ts"

/**
 * Create a SyntaxStyle from a Theme
 * Maps Tree-sitter capture groups to theme colors
 */
export function createSyntaxStyleFromTheme(theme: Theme): SyntaxStyle {
  const { colors } = theme
  
  // Tree-sitter highlight groups to theme color mappings
  // See: node_modules/@opentui/core/assets/*/highlights.scm for available groups
  return SyntaxStyle.fromStyles({
    // Keywords
    keyword: { fg: parseColor(colors.keyword) },
    "keyword.function": { fg: parseColor(colors.keyword) },
    "keyword.return": { fg: parseColor(colors.keyword) },
    "keyword.operator": { fg: parseColor(colors.operator) },
    "keyword.import": { fg: parseColor(colors.keyword) },
    "keyword.export": { fg: parseColor(colors.keyword) },
    "keyword.conditional": { fg: parseColor(colors.keyword) },
    "keyword.repeat": { fg: parseColor(colors.keyword) },
    
    // Strings
    string: { fg: parseColor(colors.string) },
    "string.special": { fg: parseColor(colors.string) },
    "string.escape": { fg: parseColor(colors.warning) },
    "string.regex": { fg: parseColor(colors.warning) },
    
    // Numbers
    number: { fg: parseColor(colors.number) },
    "number.float": { fg: parseColor(colors.number) },
    
    // Comments
    comment: { fg: parseColor(colors.comment), italic: true },
    "comment.line": { fg: parseColor(colors.comment), italic: true },
    "comment.block": { fg: parseColor(colors.comment), italic: true },
    "comment.documentation": { fg: parseColor(colors.comment), italic: true },
    
    // Functions
    function: { fg: parseColor(colors.function) },
    "function.method": { fg: parseColor(colors.function) },
    "function.builtin": { fg: parseColor(colors.function) },
    "function.macro": { fg: parseColor(colors.secondary) },
    "function.call": { fg: parseColor(colors.function) },
    
    // Variables
    variable: { fg: parseColor(colors.variable) },
    "variable.builtin": { fg: parseColor(colors.secondary) },
    "variable.parameter": { fg: parseColor(colors.variable) },
    "variable.member": { fg: parseColor(colors.variable) },
    
    // Types
    type: { fg: parseColor(colors.type) },
    "type.builtin": { fg: parseColor(colors.type) },
    "type.definition": { fg: parseColor(colors.type) },
    "type.qualifier": { fg: parseColor(colors.keyword) },
    
    // Operators
    operator: { fg: parseColor(colors.operator) },
    
    // Punctuation
    punctuation: { fg: parseColor(colors.comment) },
    "punctuation.delimiter": { fg: parseColor(colors.foreground) },
    "punctuation.bracket": { fg: parseColor(colors.foreground) },
    "punctuation.special": { fg: parseColor(colors.operator) },
    
    // Constants
    constant: { fg: parseColor(colors.number) },
    "constant.builtin": { fg: parseColor(colors.secondary) },
    boolean: { fg: parseColor(colors.number) },
    
    // Properties/attributes
    property: { fg: parseColor(colors.variable) },
    attribute: { fg: parseColor(colors.secondary) },
    
    // Tags (JSX/HTML)
    tag: { fg: parseColor(colors.keyword) },
    "tag.delimiter": { fg: parseColor(colors.foreground) },
    "tag.attribute": { fg: parseColor(colors.secondary) },
    
    // Labels
    label: { fg: parseColor(colors.secondary) },
    
    // Namespace
    namespace: { fg: parseColor(colors.type) },
    
    // Markup (Markdown)
    "markup.heading": { fg: parseColor(colors.primary), bold: true },
    "markup.bold": { fg: parseColor(colors.foreground), bold: true },
    "markup.italic": { fg: parseColor(colors.foreground), italic: true },
    "markup.link": { fg: parseColor(colors.accent), underline: true },
    "markup.list": { fg: parseColor(colors.secondary) },
    "markup.raw": { fg: parseColor(colors.string) },
  })
}

// Cache for SyntaxStyle instances per theme
const styleCache = new Map<string, SyntaxStyle>()

/**
 * Get or create a cached SyntaxStyle for a theme
 */
export function getSyntaxStyle(theme: Theme): SyntaxStyle {
  const cached = styleCache.get(theme.id)
  if (cached) {
    return cached
  }
  
  const style = createSyntaxStyleFromTheme(theme)
  styleCache.set(theme.id, style)
  return style
}

/**
 * Clear the style cache (e.g., when themes are reloaded)
 */
export function clearStyleCache(): void {
  for (const style of styleCache.values()) {
    style.destroy()
  }
  styleCache.clear()
}
