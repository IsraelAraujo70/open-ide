/**
 * Editor Component - Main text editing area with syntax highlighting
 * 
 * Uses OpenTUI's textarea component which has built-in:
 * - Cursor movement
 * - Text selection
 * - Undo/redo
 * - Mouse support
 * 
 * Syntax highlighting is provided by Tree-sitter via OpenTUI's TreeSitterClient.
 */

import { useRef, useEffect, useState, useCallback } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { BufferState, Theme } from "../../domain/types.ts"
import { getTreeSitter, initTreeSitter, getFiletype } from "../../shared/index.ts"
import { getSyntaxStyle } from "../../shared/syntaxStyle.ts"

// Re-define the highlight types locally to avoid module resolution issues
interface HighlightRange {
  startCol: number
  endCol: number
  group: string
}

interface HighlightResponse {
  line: number
  highlights: HighlightRange[]
  droppedHighlights: HighlightRange[]
}

interface EditorProps {
  buffer: BufferState | null
  theme: Theme
  width: number
  height: number
  focused: boolean
}

// Use a numeric ID for Tree-sitter buffers
let nextBufferId = 1
const bufferIdMap = new Map<string, number>()

function getNumericBufferId(bufferId: string): number {
  let id = bufferIdMap.get(bufferId)
  if (!id) {
    id = nextBufferId++
    bufferIdMap.set(bufferId, id)
  }
  return id
}

export function Editor({ buffer, theme, width, height, focused }: EditorProps) {
  const { colors } = theme
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const [treeSitterReady, setTreeSitterReady] = useState(false)
  const versionRef = useRef(0)
  
  // Initialize Tree-sitter on mount
  useEffect(() => {
    let mounted = true
    
    initTreeSitter()
      .then(() => {
        if (mounted) {
          setTreeSitterReady(true)
        }
      })
      .catch((err) => {
        console.error("Failed to initialize Tree-sitter:", err)
      })
    
    return () => {
      mounted = false
    }
  }, [])
  
  // Apply syntax style to textarea when theme changes
  useEffect(() => {
    if (textareaRef.current && buffer) {
      const syntaxStyle = getSyntaxStyle(theme)
      textareaRef.current.syntaxStyle = syntaxStyle
    }
  }, [theme, buffer])
  
  // Handle highlight responses from Tree-sitter
  const applyHighlights = useCallback((highlights: HighlightResponse[]) => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const syntaxStyle = getSyntaxStyle(theme)
    
    // Clear existing highlights before applying new ones
    textarea.clearAllHighlights()
    
    for (const lineHighlight of highlights) {
      const { line, highlights: ranges } = lineHighlight
      
      for (const range of ranges) {
        const styleId = syntaxStyle.resolveStyleId(range.group)
        if (styleId !== null) {
          textarea.addHighlight(line, {
            start: range.startCol,
            end: range.endCol,
            styleId,
          })
        }
      }
    }
  }, [theme])
  
  // Setup Tree-sitter buffer when buffer changes
  useEffect(() => {
    if (!treeSitterReady || !buffer || !buffer.filePath) return
    
    const filetype = getFiletype(buffer.filePath)
    if (!filetype) {
      // No parser available for this file type
      return
    }
    
    const ts = getTreeSitter()
    const numericId = getNumericBufferId(buffer.id)
    versionRef.current = 0
    
    // Create buffer in Tree-sitter
    ts.createBuffer(numericId, buffer.content, filetype, versionRef.current)
      .catch((err) => {
        console.error("Failed to create Tree-sitter buffer:", err)
      })
    
    // Listen for highlight responses
    const handleHighlights = (bufferId: number, _version: number, highlights: HighlightResponse[]) => {
      if (bufferId === numericId) {
        applyHighlights(highlights)
      }
    }
    
    ts.on("highlights:response", handleHighlights)
    
    return () => {
      ts.off("highlights:response", handleHighlights)
      // Remove buffer when component unmounts or buffer changes
      ts.removeBuffer(numericId).catch(() => {
        // Ignore errors on cleanup
      })
    }
  }, [treeSitterReady, buffer?.id, buffer?.filePath, buffer?.content, applyHighlights])
  
  if (!buffer) {
    return (
      <box
        width={width}
        height={height}
        backgroundColor={colors.background}
        justifyContent="center"
        alignItems="center"
      >
        <box flexDirection="column" alignItems="center">
          <text fg={colors.comment}>
            <b>OpenCode IDE</b>
          </text>
          <text fg={colors.comment}>
            {" "}
          </text>
          <text fg={colors.comment}>
            Press Ctrl+O to open a file
          </text>
          <text fg={colors.comment}>
            Press Ctrl+N to create a new file
          </text>
          <text fg={colors.comment}>
            Press Ctrl+P for command palette
          </text>
        </box>
      </box>
    )
  }

  // TODO: Line numbers disabled due to OpenTUI insertBefore bug
  // See: https://github.com/sst/opentui/issues/432
  
  return (
    <box width={width} height={height} flexDirection="row">
      <textarea
        ref={textareaRef}
        key={buffer.id}
        flexGrow={1}
        height={height}
        initialValue={buffer.content}
        focused={focused}
        backgroundColor={colors.background}
        textColor={colors.foreground}
        cursorColor={colors.primary}
        selectionBg={colors.selection}
        wrapMode="none"
        syntaxStyle={getSyntaxStyle(theme)}
      />
    </box>
  )
}
