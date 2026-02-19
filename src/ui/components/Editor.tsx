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

import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { useTerminalDimensions } from "@opentui/react"
import type { KeyEvent, MouseEvent as OtuMouseEvent, TextareaRenderable } from "@opentui/core"
import type { BufferState, CursorPosition, Selection, Theme } from "../../domain/types.ts"
import { getTreeSitter, initTreeSitter, getFiletype } from "../../shared/index.ts"
import { getSyntaxStyle } from "../../shared/syntaxStyle.ts"
import { store } from "../../application/store.ts"
import { clipboard } from "../../adapters/index.ts"
import { commandRegistry } from "../../application/commands.ts"
import { ContextMenu, type ContextMenuItem } from "./ContextMenu.tsx"

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
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions()
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const activeBufferIdRef = useRef<string | null>(null)
  const treeSitterBufferIdRef = useRef<number | null>(null)
  const treeSitterHasParserRef = useRef(false)
  const treeSitterLastContentRef = useRef("")
  const [treeSitterReady, setTreeSitterReady] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
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

  // Keep the textarea instance stable and only reset content when switching buffers.
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !buffer) {
      activeBufferIdRef.current = null
      return
    }

    if (activeBufferIdRef.current !== buffer.id) {
      textarea.setText(buffer.content)
      const maxOffset = textarea.plainText.length
      textarea.cursorOffset = Math.max(0, Math.min(maxOffset, buffer.cursorPosition.offset))
      activeBufferIdRef.current = buffer.id
    }
  }, [buffer])

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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const copySelection = useCallback(async () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const selection = textarea.getSelection()
    if (!selection || selection.start === selection.end) return

    const start = Math.min(selection.start, selection.end)
    const end = Math.max(selection.start, selection.end)
    const selectedText = textarea.getTextRange(start, end)
    await clipboard.writeText(selectedText)
  }, [])

  const cutSelection = useCallback(async () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const selection = textarea.getSelection()
    if (!selection || selection.start === selection.end) return

    const start = Math.min(selection.start, selection.end)
    const end = Math.max(selection.start, selection.end)
    const selectedText = textarea.getTextRange(start, end)
    const startPos = textarea.editBuffer.offsetToPosition(start)
    const endPos = textarea.editBuffer.offsetToPosition(end)
    if (!startPos || !endPos) return

    textarea.deleteRange(startPos.row, startPos.col, endPos.row, endPos.col)
    syncBufferState()
    await clipboard.writeText(selectedText)
  }, [syncBufferState])

  const pasteFromClipboard = useCallback(async () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const text = await clipboard.readText()
    if (!text) return

    const selection = textarea.getSelection()
    if (selection && selection.start !== selection.end) {
      const start = Math.min(selection.start, selection.end)
      const end = Math.max(selection.start, selection.end)
      const startPos = textarea.editBuffer.offsetToPosition(start)
      const endPos = textarea.editBuffer.offsetToPosition(end)
      if (startPos && endPos) {
        textarea.deleteRange(startPos.row, startPos.col, endPos.row, endPos.col)
      }
    }

    textarea.insertText(text)
    syncBufferState()
  }, [syncBufferState])

  const contextMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: "editor-copy",
        label: "Copy",
        shortcut: "Ctrl+C",
        onSelect: copySelection,
      },
      {
        id: "editor-cut",
        label: "Cut",
        shortcut: "Ctrl+X",
        onSelect: cutSelection,
      },
      {
        id: "editor-paste",
        label: "Paste",
        shortcut: "Ctrl+V",
        onSelect: pasteFromClipboard,
      },
      {
        id: "editor-sep-1",
        type: "separator",
      },
      {
        id: "editor-search-files",
        label: "Search Files",
        shortcut: "Ctrl+P",
        onSelect: () => commandRegistry.execute("filePicker.open"),
      },
      {
        id: "editor-command-palette",
        label: "Command Palette",
        shortcut: "Ctrl+Shift+K",
        onSelect: () => commandRegistry.execute("palette.open"),
      },
      {
        id: "editor-keybindings",
        label: "Show Keybindings",
        onSelect: () => commandRegistry.execute("keybindings.open"),
      },
      {
        id: "editor-sep-2",
        type: "separator",
      },
      {
        id: "editor-tree-toggle",
        label: "Toggle File Tree",
        shortcut: "Ctrl+B",
        onSelect: () => commandRegistry.execute("explorer.toggle"),
      },
    ],
    [copySelection, cutSelection, pasteFromClipboard]
  )

  const handleEditorMouseDown = useCallback(
    (event: OtuMouseEvent) => {
      if (event.button === 2) {
        event.preventDefault?.()
        event.stopPropagation?.()
        setContextMenu({
          x: event.x,
          y: event.y,
        })
        return
      }

      if (contextMenu) {
        closeContextMenu()
      }
    },
    [closeContextMenu, contextMenu]
  )

  const handleEditorKeyDown = useCallback(
    (event: KeyEvent) => {
      if (contextMenu) {
        closeContextMenu()
      }

      const state = store.getState()
      if (state.focusTarget !== "editor") return

      const textarea = textareaRef.current
      if (!textarea) return

      const keyName = event.name === "return" ? "enter" : event.name.toLowerCase()
      const ctrlOrMeta = !!event.ctrl || !!event.meta
      const hasHardModifier = !!event.ctrl || !!event.meta || !!event.option || !!event.super

      if (ctrlOrMeta && !event.option && !event.super) {
        if (keyName === "c" && !event.shift) {
          event.preventDefault?.()
          void copySelection()
          return
        }

        if (keyName === "x" && !event.shift) {
          event.preventDefault?.()
          void cutSelection()
          return
        }

        if (keyName === "v" && !event.shift) {
          event.preventDefault?.()
          void pasteFromClipboard()
          return
        }

        if (keyName === "insert" && event.shift) {
          event.preventDefault?.()
          void pasteFromClipboard()
          return
        }
      }

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
    [closeContextMenu, contextMenu, copySelection, cutSelection, pasteFromClipboard, syncBufferState]
  )

  const clearHighlights = useCallback(() => {
    textareaRef.current?.clearAllHighlights()
  }, [])

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

  // Setup Tree-sitter session for the active buffer.
  useEffect(() => {
    const ts = getTreeSitter()

    if (!treeSitterReady || !buffer || !buffer.filePath) {
      const previousBufferId = treeSitterBufferIdRef.current
      treeSitterBufferIdRef.current = null
      treeSitterHasParserRef.current = false
      treeSitterLastContentRef.current = ""
      versionRef.current = 0
      clearHighlights()

      if (previousBufferId !== null) {
        ts.removeBuffer(previousBufferId).catch(() => {
          // Ignore cleanup errors
        })
      }
      return
    }

    clearHighlights()

    const filetype = getFiletype(buffer.filePath)
    if (!filetype) {
      treeSitterBufferIdRef.current = null
      treeSitterHasParserRef.current = false
      treeSitterLastContentRef.current = ""
      versionRef.current = 0
      return
    }

    const numericId = getNumericBufferId(buffer.id)
    treeSitterBufferIdRef.current = numericId
    treeSitterHasParserRef.current = false
    treeSitterLastContentRef.current = buffer.content
    versionRef.current = 1
    let disposed = false

    ts.createBuffer(numericId, buffer.content, filetype, versionRef.current)
      .then(hasParser => {
        if (disposed || treeSitterBufferIdRef.current !== numericId) {
          return
        }

        treeSitterHasParserRef.current = hasParser
        if (!hasParser) {
          clearHighlights()
        }
      })
      .catch(err => {
        console.error("Failed to create Tree-sitter buffer:", err)
      })

    const handleHighlights = (
      bufferId: number,
      _version: number,
      highlights: HighlightResponse[]
    ) => {
      if (!disposed && bufferId === numericId) {
        applyHighlights(highlights)
      }
    }

    ts.on("highlights:response", handleHighlights)

    return () => {
      disposed = true
      ts.off("highlights:response", handleHighlights)

      if (treeSitterBufferIdRef.current === numericId) {
        treeSitterBufferIdRef.current = null
        treeSitterHasParserRef.current = false
      }

      ts.removeBuffer(numericId).catch(() => {
        // Ignore cleanup errors
      })
    }
  }, [treeSitterReady, buffer?.id, buffer?.filePath, applyHighlights, clearHighlights])

  // Reparse active Tree-sitter buffer on content changes.
  useEffect(() => {
    if (!treeSitterReady || !buffer) {
      return
    }

    const numericId = treeSitterBufferIdRef.current
    if (numericId === null || !treeSitterHasParserRef.current) {
      return
    }

    if (treeSitterLastContentRef.current === buffer.content) {
      return
    }

    treeSitterLastContentRef.current = buffer.content
    versionRef.current += 1

    getTreeSitter()
      .resetBuffer(numericId, versionRef.current, buffer.content)
      .catch(error => {
        console.error("Failed to refresh Tree-sitter highlights:", error)
      })
  }, [treeSitterReady, buffer?.id, buffer?.content])

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
          <text fg={colors.comment}>Press Ctrl+P to search files</text>
          <text fg={colors.comment}>Press Ctrl+Shift+K for command palette</text>
          <text fg={colors.comment}>Type :w to save and :q to quit</text>
          <text fg={colors.comment}>Esc: NORMAL | Insert/Enter: INSERT</text>
          <text fg={colors.comment}>Tab/Shift+Tab: indent | Ctrl+Z / Ctrl+Shift+Z</text>
          <text fg={colors.comment}>Right click: context menu</text>
        </box>
      </box>
    )
  }

  return (
    <box width={width} height={height} flexDirection="row" onMouseDown={handleEditorMouseDown}>
      <line-number
        flexGrow={1}
        fg={colors.comment}
        bg={colors.background}
        minWidth={4}
        paddingRight={1}
      >
        <textarea
          ref={textareaRef}
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
          onMouseDown={handleEditorMouseDown}
        />
      </line-number>

      {contextMenu && (
        <ContextMenu
          theme={theme}
          items={contextMenuItems}
          x={contextMenu.x}
          y={contextMenu.y}
          viewportWidth={terminalWidth}
          viewportHeight={terminalHeight}
          onClose={closeContextMenu}
        />
      )}
    </box>
  )
}
