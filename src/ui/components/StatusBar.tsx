/**
 * StatusBar Component - Bottom status bar showing file info, cursor position, etc.
 */

import type { Theme, BufferState, FocusTarget } from "../../domain/types.ts"

interface StatusBarProps {
  theme: Theme
  width: number
  buffer: BufferState | null
  focusTarget: FocusTarget
}

export function StatusBar({ theme, width, buffer, focusTarget }: StatusBarProps) {
  const { colors } = theme

  // Build status segments
  const fileName = buffer?.filePath
    ? buffer.filePath.split("/").pop()
    : buffer
      ? "Untitled"
      : "No file"

  const modified = buffer?.isDirty ? " [+]" : ""
  const language = buffer?.language ?? "plaintext"

  const cursorInfo = buffer
    ? `Ln ${buffer.cursorPosition.line + 1}, Col ${buffer.cursorPosition.column + 1}`
    : ""

  const focusIndicator = getFocusIndicator(focusTarget)

  // Calculate spacing
  const leftContent = ` ${fileName}${modified}`
  const rightContent = `${language} | ${cursorInfo} | ${focusIndicator} `
  const middleSpaces = Math.max(0, width - leftContent.length - rightContent.length)

  return (
    <box height={1} width={width} backgroundColor={colors.primary} flexDirection="row">
      <text fg={colors.background} bg={colors.primary}>
        {leftContent}
      </text>
      <text fg={colors.background} bg={colors.primary}>
        {" ".repeat(middleSpaces)}
      </text>
      <text fg={colors.background} bg={colors.primary}>
        {rightContent}
      </text>
    </box>
  )
}

function getFocusIndicator(focus: FocusTarget): string {
  switch (focus) {
    case "editor":
      return "EDIT"
    case "explorer":
      return "EXPLORER"
    case "terminal":
      return "TERM"
    case "commandLine":
      return "CMD"
    case "palette":
      return "PALETTE"
    default:
      return ""
  }
}
