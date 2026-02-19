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
import type { BufferState, CursorPosition, Selection, Theme, Diagnostic } from "../../domain/types.ts"
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
  diagnostics: Diagnostic[]
  theme: Theme
  width: number
  height: number
  focused: boolean
}

// Use a numeric ID for Tree-sitter buffers
let nextBufferId = 1
const bufferIdMap = new Map<string, number>()
const TREE_SITTER_HL_REF = 1001
const DIAGNOSTIC_HL_REF = 2001
const DIAGNOSTIC_HOVER_DELAY_MS = 180

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

function getDiagnosticStyleName(severity: Diagnostic["severity"]): string {
  switch (severity) {
    case "error":
      return "diagnostic.error"
    case "warning":
      return "diagnostic.warning"
    case "info":
      return "diagnostic.info"
    case "hint":
      return "diagnostic.hint"
    default:
      return "diagnostic.error"
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function diagnosticSeverityScore(severity: Diagnostic["severity"]): number {
  switch (severity) {
    case "error":
      return 4
    case "warning":
      return 3
    case "info":
      return 2
    case "hint":
      return 1
    default:
      return 0
  }
}

function isCursorInsideDiagnostic(diagnostic: Diagnostic, position: CursorPosition): boolean {
  const start = diagnostic.range.start
  const end = diagnostic.range.end

  if (position.line < start.line || position.line > end.line) {
    return false
  }

  if (start.line === end.line) {
    if (end.column <= start.column) {
      return position.line === start.line && position.column === start.column
    }
    return position.line === start.line && position.column >= start.column && position.column <= end.column
  }

  if (position.line === start.line) {
    return position.column >= start.column
  }

  if (position.line === end.line) {
    return position.column <= end.column
  }

  return true
}

function findDiagnosticAtCursor(
  diagnostics: Diagnostic[],
  position: CursorPosition | null
): Diagnostic | null {
  if (!position || diagnostics.length === 0) {
    return null
  }

  let selected: Diagnostic | null = null
  let lineSelected: Diagnostic | null = null

  for (const diagnostic of diagnostics) {
    if (
      position.line >= diagnostic.range.start.line &&
      position.line <= diagnostic.range.end.line
    ) {
      if (!lineSelected) {
        lineSelected = diagnostic
      } else {
        const currentScore = diagnosticSeverityScore(diagnostic.severity)
        const selectedScore = diagnosticSeverityScore(lineSelected.severity)
        if (currentScore > selectedScore) {
          lineSelected = diagnostic
        }
      }
    }

    if (!isCursorInsideDiagnostic(diagnostic, position)) {
      continue
    }

    if (!selected) {
      selected = diagnostic
      continue
    }

    const currentScore = diagnosticSeverityScore(diagnostic.severity)
    const selectedScore = diagnosticSeverityScore(selected.severity)
    if (currentScore > selectedScore) {
      selected = diagnostic
      continue
    }

    const currentLength =
      Math.max(0, diagnostic.range.end.line - diagnostic.range.start.line) * 10000 +
      Math.max(0, diagnostic.range.end.column - diagnostic.range.start.column)
    const selectedLength =
      Math.max(0, selected.range.end.line - selected.range.start.line) * 10000 +
      Math.max(0, selected.range.end.column - selected.range.start.column)

    if (currentScore === selectedScore && currentLength < selectedLength) {
      selected = diagnostic
    }
  }

  return selected ?? lineSelected
}

function getDiagnosticColor(theme: Theme, severity: Diagnostic["severity"]): string {
  switch (severity) {
    case "error":
      return theme.colors.error
    case "warning":
      return theme.colors.warning
    case "info":
      return theme.colors.info
    case "hint":
      return theme.colors.accent
    default:
      return theme.colors.border
  }
}

function buildDiagnosticHeader(diagnostic: Diagnostic): string {
  const severity = diagnostic.severity.toUpperCase()
  const source = diagnostic.source ? ` ${diagnostic.source}` : ""
  const code = diagnostic.code !== undefined ? ` (${String(diagnostic.code)})` : ""
  return `${severity}${source}${code}`
}

function getDiagnosticKey(diagnostic: Diagnostic): string {
  const { start, end } = diagnostic.range
  const code = diagnostic.code !== undefined ? String(diagnostic.code) : ""
  const source = diagnostic.source ?? ""
  return [
    diagnostic.severity,
    start.line,
    start.column,
    end.line,
    end.column,
    source,
    code,
    diagnostic.message,
  ].join("|")
}

function wrapText(text: string, width: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return [""]
  }

  if (width <= 2) {
    return [normalized]
  }

  const words = normalized.split(" ")
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    if (!current) {
      current = word
      continue
    }

    if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`
      continue
    }

    lines.push(current)
    current = word
  }

  if (current) {
    lines.push(current)
  }

  return lines
}

interface DiagnosticHoverProps {
  theme: Theme
  diagnostic: Diagnostic
  cursor: CursorPosition
  viewportWidth: number
  viewportHeight: number
}

function DiagnosticHover({
  theme,
  diagnostic,
  cursor,
  viewportWidth,
  viewportHeight,
}: DiagnosticHoverProps) {
  const borderColor = getDiagnosticColor(theme, diagnostic.severity)
  const header = buildDiagnosticHeader(diagnostic)
  const maxWidth = Math.max(32, Math.min(76, viewportWidth - 4))
  const messageLines = wrapText(diagnostic.message, Math.max(10, maxWidth - 4)).slice(0, 5)
  const contentLines = [header, ...messageLines]
  const popupWidth = Math.max(
    24,
    Math.min(maxWidth, contentLines.reduce((max, line) => Math.max(max, line.length), 20) + 4)
  )
  const popupHeight = Math.max(4, contentLines.length + 2)

  const gutterWidth = 6
  const preferredLeft = gutterWidth + cursor.column + 2
  const maxLeft = Math.max(0, viewportWidth - popupWidth)
  const left = clamp(preferredLeft, 0, maxLeft)

  const preferredTop = cursor.line + 1
  const maxTop = Math.max(0, viewportHeight - popupHeight)
  const top = preferredTop + popupHeight <= viewportHeight ? preferredTop : clamp(cursor.line - popupHeight, 0, maxTop)

  return (
    <box
      position="absolute"
      top={top}
      left={left}
      width={popupWidth}
      height={popupHeight}
      backgroundColor={theme.colors.lineHighlight}
      borderStyle="single"
      border={true}
      borderColor={borderColor}
      flexDirection="column"
      zIndex={300}
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg={borderColor}>
        <b>{header}</b>
      </text>
      {messageLines.map((line, index) => (
        <text key={`${line}-${index}`} fg={theme.colors.foreground}>
          {line}
        </text>
      ))}
    </box>
  )
}

export function Editor({ buffer, diagnostics, theme, width, height, focused }: EditorProps) {
  const { colors } = theme
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions()
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const activeBufferIdRef = useRef<string | null>(null)
  const treeSitterBufferIdRef = useRef<number | null>(null)
  const treeSitterHasParserRef = useRef(false)
  const treeSitterLastContentRef = useRef("")
  const hoverDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDiagnosticRef = useRef<{
    key: string
    diagnostic: Diagnostic
    cursor: CursorPosition
  } | null>(null)
  const [treeSitterReady, setTreeSitterReady] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [hoverPosition, setHoverPosition] = useState<CursorPosition | null>(null)
  const [activeDiagnostic, setActiveDiagnostic] = useState<{
    diagnostic: Diagnostic
    cursor: CursorPosition
  } | null>(null)
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

  const hoverCursorPosition = hoverPosition ?? buffer?.cursorPosition ?? null
  const immediateDiagnostic = useMemo(
    () => findDiagnosticAtCursor(diagnostics, hoverCursorPosition),
    [diagnostics, hoverCursorPosition]
  )

  useEffect(() => {
    setHoverPosition(null)
    setActiveDiagnostic(null)
    pendingDiagnosticRef.current = null

    if (hoverDelayRef.current) {
      clearTimeout(hoverDelayRef.current)
      hoverDelayRef.current = null
    }
  }, [buffer?.id])

  useEffect(() => {
    return () => {
      if (hoverDelayRef.current) {
        clearTimeout(hoverDelayRef.current)
        hoverDelayRef.current = null
      }
      pendingDiagnosticRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!hoverCursorPosition || !immediateDiagnostic) {
      pendingDiagnosticRef.current = null

      if (hoverDelayRef.current) {
        clearTimeout(hoverDelayRef.current)
        hoverDelayRef.current = null
      }

      setActiveDiagnostic(null)
      return
    }

    const nextKey = getDiagnosticKey(immediateDiagnostic)
    const currentKey = activeDiagnostic ? getDiagnosticKey(activeDiagnostic.diagnostic) : null

    if (currentKey === nextKey) {
      pendingDiagnosticRef.current = null

      if (hoverDelayRef.current) {
        clearTimeout(hoverDelayRef.current)
        hoverDelayRef.current = null
      }

      setActiveDiagnostic(previous => {
        if (!previous) {
          return previous
        }

        if (
          previous.cursor.line === hoverCursorPosition.line &&
          previous.cursor.column === hoverCursorPosition.column &&
          previous.cursor.offset === hoverCursorPosition.offset
        ) {
          return previous
        }

        return {
          diagnostic: previous.diagnostic,
          cursor: hoverCursorPosition,
        }
      })
      return
    }

    const pending = pendingDiagnosticRef.current
    pendingDiagnosticRef.current = {
      key: nextKey,
      diagnostic: immediateDiagnostic,
      cursor: hoverCursorPosition,
    }

    if (pending?.key === nextKey && hoverDelayRef.current) {
      return
    }

    if (hoverDelayRef.current) {
      clearTimeout(hoverDelayRef.current)
      hoverDelayRef.current = null
    }

    hoverDelayRef.current = setTimeout(() => {
      const payload = pendingDiagnosticRef.current
      hoverDelayRef.current = null

      if (!payload) {
        return
      }

      setActiveDiagnostic({
        diagnostic: payload.diagnostic,
        cursor: payload.cursor,
      })
      pendingDiagnosticRef.current = null
    }, DIAGNOSTIC_HOVER_DELAY_MS)
  }, [
    immediateDiagnostic,
    hoverCursorPosition,
    activeDiagnostic,
    hoverCursorPosition?.line,
    hoverCursorPosition?.column,
    hoverCursorPosition?.offset,
  ])

  // Keep the textarea instance stable and only reset content when switching buffers.
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      activeBufferIdRef.current = null
      return
    }

    if (!buffer) {
      textarea.removeHighlightsByRef(TREE_SITTER_HL_REF)
      textarea.removeHighlightsByRef(DIAGNOSTIC_HL_REF)
      activeBufferIdRef.current = null
      return
    }

    if (activeBufferIdRef.current !== buffer.id) {
      textarea.removeHighlightsByRef(TREE_SITTER_HL_REF)
      textarea.removeHighlightsByRef(DIAGNOSTIC_HL_REF)
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

  const handleEditorMouseMove = useCallback(
    (event: OtuMouseEvent) => {
      if (!buffer) {
        setHoverPosition(null)
        return
      }

      const textarea = textareaRef.current
      if (!textarea) {
        setHoverPosition(null)
        return
      }

      const localX = event.x - textarea.x
      const localY = event.y - textarea.y

      if (localX < 0 || localY < 0 || localX >= textarea.width || localY >= textarea.height) {
        setHoverPosition(null)
        return
      }

      const viewport = textarea.editorView.getViewport()
      const logicalLine = Math.max(0, viewport.offsetY + localY)
      const logicalColumn = Math.max(0, viewport.offsetX + localX)

      const lines = buffer.content.split("\n")
      const maxLineIndex = Math.max(0, lines.length - 1)
      const line = clamp(logicalLine, 0, maxLineIndex)
      const maxColumn = lines[line]?.length ?? 0
      const column = clamp(logicalColumn, 0, maxColumn)
      const offset = textarea.editBuffer.positionToOffset(line, column)

      setHoverPosition({
        line,
        column,
        offset,
      })
    },
    [buffer]
  )

  const handleEditorMouseOut = useCallback(() => {
    setHoverPosition(null)
  }, [])

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

  const clearSyntaxHighlights = useCallback(() => {
    textareaRef.current?.removeHighlightsByRef(TREE_SITTER_HL_REF)
  }, [])

  const clearDiagnosticHighlights = useCallback(() => {
    textareaRef.current?.removeHighlightsByRef(DIAGNOSTIC_HL_REF)
  }, [])

  const applyDiagnosticHighlights = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea || !buffer) {
      return
    }

    textarea.removeHighlightsByRef(DIAGNOSTIC_HL_REF)

    if (diagnostics.length === 0) {
      return
    }

    const syntaxStyle = getSyntaxStyle(theme)
    const lines = buffer.content.split("\n")
    const maxLineIndex = Math.max(0, lines.length - 1)

    for (const diagnostic of diagnostics) {
      const styleId = syntaxStyle.resolveStyleId(getDiagnosticStyleName(diagnostic.severity))
      if (styleId === null) {
        continue
      }

      const startLine = clamp(diagnostic.range.start.line, 0, maxLineIndex)
      const endLine = clamp(Math.max(startLine, diagnostic.range.end.line), startLine, maxLineIndex)

      for (let line = startLine; line <= endLine; line++) {
        const lineLength = lines[line]?.length ?? 0
        const rawStart = line === startLine ? diagnostic.range.start.column : 0
        const rawEnd = line === endLine ? diagnostic.range.end.column : lineLength

        let start = clamp(rawStart, 0, lineLength)
        let end = clamp(rawEnd, 0, lineLength)

        if (end <= start) {
          if (lineLength === 0) {
            continue
          }

          start = clamp(start, 0, lineLength - 1)
          end = Math.min(lineLength, start + 1)
        }

        textarea.addHighlight(line, {
          start,
          end,
          styleId,
          priority: 1000,
          hlRef: DIAGNOSTIC_HL_REF,
        })
      }
    }
  }, [buffer, diagnostics, theme])

  useEffect(() => {
    applyDiagnosticHighlights()
  }, [applyDiagnosticHighlights])

  // Handle highlight responses from Tree-sitter
  const applyHighlights = useCallback(
    (highlights: HighlightResponse[]) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const syntaxStyle = getSyntaxStyle(theme)

      textarea.removeHighlightsByRef(TREE_SITTER_HL_REF)

      for (const lineHighlight of highlights) {
        const { line, highlights: ranges } = lineHighlight

        for (const range of ranges) {
          const styleId = syntaxStyle.resolveStyleId(range.group)
          if (styleId !== null) {
            textarea.addHighlight(line, {
              start: range.startCol,
              end: range.endCol,
              styleId,
              hlRef: TREE_SITTER_HL_REF,
            })
          }
        }
      }

      // Tree-sitter refreshes can wipe layer order; re-apply diagnostics on top.
      textarea.removeHighlightsByRef(DIAGNOSTIC_HL_REF)
      applyDiagnosticHighlights()
    },
    [theme, applyDiagnosticHighlights]
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
      clearSyntaxHighlights()

      if (!buffer) {
        clearDiagnosticHighlights()
      }

      if (previousBufferId !== null) {
        ts.removeBuffer(previousBufferId).catch(() => {
          // Ignore cleanup errors
        })
      }
      return
    }

    clearSyntaxHighlights()

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
          clearSyntaxHighlights()
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
  }, [
    treeSitterReady,
    buffer?.id,
    buffer?.filePath,
    applyHighlights,
    clearSyntaxHighlights,
    clearDiagnosticHighlights,
    buffer,
  ])

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
          onMouseMove={handleEditorMouseMove}
          onMouseOut={handleEditorMouseOut}
          onMouseDown={handleEditorMouseDown}
        />
      </line-number>

      {buffer && activeDiagnostic && (
        <DiagnosticHover
          theme={theme}
          diagnostic={activeDiagnostic.diagnostic}
          cursor={activeDiagnostic.cursor}
          viewportWidth={width}
          viewportHeight={height}
        />
      )}

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
