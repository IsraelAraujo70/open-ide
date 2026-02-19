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
import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import type { BufferState, CursorPosition, Selection, Theme } from "../../domain/types.ts"
import { getTreeSitter, initTreeSitter, getFiletype } from "../../shared/index.ts"
import { getSyntaxStyle } from "../../shared/syntaxStyle.ts"
import { store } from "../../application/store.ts"

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

function toCursorPosition(row: number, col: number, offset: number): CursorPosition {
  return {
    line: row,
    column: col,
    offset,
  }
}

function toSelection(
  textarea: TextareaRenderable,
  selection: { start: number; end: number } | null
): Selection | null {
  if (!selection) {
    return null
  }

  const anchor = textarea.editBuffer.offsetToPosition(selection.start)
  const focus = textarea.editBuffer.offsetToPosition(selection.end)

  if (!anchor || !focus) {
    return null
  }

  return {
    anchor: toCursorPosition(anchor.row, anchor.col, selection.start),
    focus: toCursorPosition(focus.row, focus.col, selection.end),
  }
}

function isSameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a && !b) {
    return true
  }
  if (!a || !b) {
    return false
  }

  return (
    a.anchor.line === b.anchor.line &&
    a.anchor.column === b.anchor.column &&
    a.anchor.offset === b.anchor.offset &&
    a.focus.line === b.focus.line &&
    a.focus.column === b.focus.column &&
    a.focus.offset === b.focus.offset
  )
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
      .catch(err => {
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

  const syncBufferState = useCallback(() => {
    if (!buffer || !textareaRef.current) return

    const textarea = textareaRef.current
    const nextContent = textarea.plainText

    if (nextContent !== buffer.content) {
      store.dispatch({
        type: "SET_BUFFER_CONTENT",
        bufferId: buffer.id,
        content: nextContent,
      })
    }

    const logicalCursor = textarea.logicalCursor
    const nextCursor = toCursorPosition(logicalCursor.row, logicalCursor.col, logicalCursor.offset)

    if (
      nextCursor.line !== buffer.cursorPosition.line ||
      nextCursor.column !== buffer.cursorPosition.column ||
      nextCursor.offset !== buffer.cursorPosition.offset
    ) {
      store.dispatch({
        type: "SET_CURSOR",
        bufferId: buffer.id,
        position: nextCursor,
      })
    }

    const nextSelection = toSelection(textarea, textarea.getSelection())
    if (!isSameSelection(buffer.selection, nextSelection)) {
      store.dispatch({
        type: "SET_SELECTION",
        bufferId: buffer.id,
        selection: nextSelection,
      })
    }
  }, [buffer])

  const handleEditorKeyDown = useCallback(
    (event: KeyEvent) => {
      const state = store.getState()
      if (state.focusTarget !== "editor") return

      const textarea = textareaRef.current
      if (!textarea) return

      const keyName = event.name === "return" ? "enter" : event.name.toLowerCase()
      const ctrlOrMeta = !!event.ctrl || !!event.meta
      const hasHardModifier = !!event.ctrl || !!event.meta || !!event.option || !!event.super

      if (ctrlOrMeta && keyName === "z" && !event.option && !event.super) {
        event.preventDefault?.()
        if (event.shift) {
          textarea.redo()
        } else {
          textarea.undo()
        }
        syncBufferState()
        return
      }

      if (state.editorMode !== "insert") return

      if (keyName === "tab" && !hasHardModifier) {
        event.preventDefault?.()

        if (event.shift) {
          const selection = textarea.getSelection()

          if (selection && selection.start !== selection.end) {
            const startOffset = Math.min(selection.start, selection.end)
            const endOffset = Math.max(selection.start, selection.end)
            const startPos = textarea.editBuffer.offsetToPosition(startOffset)
            const endPos = textarea.editBuffer.offsetToPosition(endOffset)

            if (!startPos || !endPos) return

            for (let line = endPos.row; line >= startPos.row; line--) {
              const lineStartOffset = textarea.editBuffer.getLineStartOffset(line)
              const linePrefix = textarea.getTextRange(lineStartOffset, lineStartOffset + 4)
              let removeCount = 0

              while (
                removeCount < 4 &&
                removeCount < linePrefix.length &&
                linePrefix[removeCount] === " "
              ) {
                removeCount++
              }

              if (removeCount > 0) {
                textarea.deleteRange(line, 0, line, removeCount)
              }
            }
          } else {
            const cursor = textarea.logicalCursor
            if (cursor.col > 0) {
              const lineStartOffset = textarea.editBuffer.getLineStartOffset(cursor.row)
              const textBeforeCursor = textarea.getTextRange(lineStartOffset, cursor.offset)
              let removeCount = 0

              for (
                let i = textBeforeCursor.length - 1;
                i >= 0 && removeCount < 4 && textBeforeCursor[i] === " ";
                i--
              ) {
                removeCount++
              }

              if (removeCount > 0) {
                textarea.deleteRange(cursor.row, cursor.col - removeCount, cursor.row, cursor.col)
              }
            }
          }
        } else {
          textarea.insertText("    ")
        }

        syncBufferState()
        return
      }
    },
    [syncBufferState]
  )

  // Handle highlight responses from Tree-sitter
  const applyHighlights = useCallback(
    (highlights: HighlightResponse[]) => {
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
    },
    [theme]
  )

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
    ts.createBuffer(numericId, buffer.content, filetype, versionRef.current).catch(err => {
      console.error("Failed to create Tree-sitter buffer:", err)
    })

    // Listen for highlight responses
    const handleHighlights = (
      bufferId: number,
      _version: number,
      highlights: HighlightResponse[]
    ) => {
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
            <b>Open IDE</b>
          </text>
          <text fg={colors.comment}> </text>
          <text fg={colors.comment}>Press Ctrl+O to open a file</text>
          <text fg={colors.comment}>Press Ctrl+N to create a new file</text>
          <text fg={colors.comment}>Press Ctrl+P for command palette</text>
          <text fg={colors.comment}>Type :w to save and :q to quit</text>
          <text fg={colors.comment}>Esc: NORMAL | Insert/Enter: INSERT</text>
          <text fg={colors.comment}>Tab/Shift+Tab: indent | Ctrl+Z / Ctrl+Shift+Z</text>
        </box>
      </box>
    )
  }

  // TODO: Line numbers disabled due to OpenTUI bug
  // See: https://github.com/sst/opentui/issues/432
  // Using <line-number> wrapper causes: "Cannot remove target directly. Use clearTarget() instead."

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
        onContentChange={syncBufferState}
        onCursorChange={syncBufferState}
        onKeyDown={handleEditorKeyDown}
      />
    </box>
  )
}
