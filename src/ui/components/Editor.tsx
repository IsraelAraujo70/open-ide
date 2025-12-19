/**
 * Editor Component - Main text editing area
 * 
 * Uses OpenTUI's textarea component which has built-in:
 * - Cursor movement
 * - Text selection
 * - Undo/redo
 * - Mouse support
 */

import type { BufferState, Theme } from "../../domain/types.ts"

interface EditorProps {
  buffer: BufferState | null
  theme: Theme
  width: number
  height: number
  focused: boolean
}

export function Editor({ buffer, theme, width, height, focused }: EditorProps) {
  const { colors } = theme
  
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
  // When fixed, restore <line-number target={...} /> component
  return (
    <box width={width} height={height} flexDirection="row">
      <textarea
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
      />
    </box>
  )
}
