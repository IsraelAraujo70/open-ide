/**
 * StatusBar Component - Bottom status bar showing file info, cursor position, etc.
 */

import type { Theme, BufferState, FocusTarget, EditorMode } from "../../domain/types.ts"

interface StatusBarProps {
  theme: Theme
  width: number
  buffer: BufferState | null
  focusTarget: FocusTarget
  editorMode: EditorMode
}

export function StatusBar({ theme, width, buffer, focusTarget, editorMode }: StatusBarProps) {
  const { colors } = theme

  const fileName = buffer?.filePath ? buffer.filePath.split("/").pop() : buffer ? "Untitled" : "No file"
  const modified = buffer?.isDirty ? " [+]" : ""
  const language = buffer?.language ?? "plaintext"

  const cursorInfo = buffer
    ? `Ln ${buffer.cursorPosition.line + 1}, Col ${buffer.cursorPosition.column + 1}`
    : ""

  const mode = getModeLabel(focusTarget, editorMode)
  const modeColor = getModeColor(theme, focusTarget, editorMode)

  const rightContent = cursorInfo ? `${language} | ${cursorInfo} ` : `${language} `

  const modeTag = ` ${mode} `
  const leftMain = ` ${fileName}${modified}`
  const middleSpaces = Math.max(1, width - modeTag.length - leftMain.length - rightContent.length)

  return (
    <box height={1} width={width} backgroundColor={colors.lineHighlight} flexDirection="row">
      <text fg={colors.background} bg={modeColor}>
        {modeTag}
      </text>
      <text fg={colors.foreground} bg={colors.lineHighlight}>
        {leftMain}
      </text>
      <text fg={colors.foreground} bg={colors.lineHighlight}>
        {" ".repeat(middleSpaces)}
      </text>
      <text fg={colors.comment} bg={colors.lineHighlight}>
        {rightContent}
      </text>
    </box>
  )
}

function getModeLabel(focus: FocusTarget, editorMode: EditorMode): string {
  switch (focus) {
    case "editor":
      return editorMode === "insert" ? "INSERT" : "NORMAL"
    case "explorer":
      return "EXPLORER"
    case "terminal":
      return "TERMINAL"
    case "commandLine":
      return "COMMAND"
    case "palette":
      return "PALETTE"
    default:
      return "NORMAL"
  }
}

function getModeColor(theme: Theme, focus: FocusTarget, editorMode: EditorMode): string {
  const { colors } = theme

  if (focus === "editor") {
    return editorMode === "insert" ? colors.success : colors.primary
  }

  switch (focus) {
    case "explorer":
      return colors.primary
    case "terminal":
      return colors.warning
    case "commandLine":
      return colors.accent
    case "palette":
      return colors.secondary
    default:
      return colors.primary
  }
}
