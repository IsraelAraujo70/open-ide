/**
 * KeybindingsHelp Component - Keyboard shortcuts reference
 */

import type { KeyEvent } from "@opentui/core"
import type { Theme } from "../../domain/types.ts"

interface KeybindingsHelpProps {
  theme: Theme
  width: number
  height: number
  onClose: () => void
}

interface ShortcutItem {
  keys: string
  action: string
}

const shortcutItems: ShortcutItem[] = [
  { keys: "Ctrl+P", action: "Search project files" },
  { keys: "Ctrl+Shift+K", action: "Open command palette" },
  { keys: "Ctrl+B", action: "Toggle file tree" },
  { keys: "Ctrl+S", action: "Save current file" },
  { keys: "Ctrl+N", action: "New file" },
  { keys: "Ctrl+O", action: "Open file picker" },
  { keys: "Ctrl+Shift+O", action: "Open project picker" },
  { keys: "Esc", action: "INSERT -> NORMAL / close overlays" },
  { keys: "i / Insert / Enter", action: "NORMAL -> INSERT" },
  { keys: ":", action: "Open command line (NORMAL mode)" },
  { keys: "Arrows", action: "Navigate in NORMAL mode" },
  { keys: "Tab / Shift+Tab", action: "Indent / Outdent (4 spaces)" },
  { keys: "Ctrl+C / Ctrl+X", action: "Copy / Cut selection" },
  { keys: "Ctrl+V", action: "Paste clipboard" },
  { keys: "Ctrl+Z / Ctrl+Shift+Z", action: "Undo / Redo" },
]

export function KeybindingsHelp({ theme, width, height, onClose }: KeybindingsHelpProps) {
  const { colors } = theme
  const leftOffset = Math.floor((100 - width) / 2)
  const topOffset = Math.floor((24 - height) / 2)
  const listHeight = Math.max(1, height - 4)

  const handleKeyDown = (event: KeyEvent) => {
    if (event.name === "escape") {
      event.preventDefault?.()
      onClose()
    }
  }

  return (
    <box
      position="absolute"
      top={topOffset}
      left={leftOffset}
      width={width}
      height={height}
      backgroundColor={colors.background}
      borderStyle="single"
      border={true}
      borderColor={colors.primary}
      flexDirection="column"
      zIndex={220}
    >
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.primary}>
          <b>Keybindings</b>
        </text>
      </box>

      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>

      <scrollbox flexGrow={1} height={listHeight} focused={true} onKeyDown={handleKeyDown}>
        {shortcutItems.map(item => (
          <ShortcutRow key={item.keys} item={item} theme={theme} />
        ))}
      </scrollbox>

      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>
      <box height={1} paddingLeft={1}>
        <text fg={colors.comment}>Esc: close</text>
      </box>
    </box>
  )
}

function ShortcutRow({ item, theme }: { item: ShortcutItem; theme: Theme }) {
  const { colors } = theme
  const keyColumnWidth = 21

  return (
    <box
      height={1}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={colors.background}
      flexDirection="row"
    >
      <box width={keyColumnWidth} backgroundColor={colors.background}>
        <text fg={colors.primary} bg={colors.background}>
          {truncate(item.keys, keyColumnWidth - 1)}
        </text>
      </box>
      <box flexGrow={1} backgroundColor={colors.background}>
        <text fg={colors.foreground} bg={colors.background}>
          {item.action}
        </text>
      </box>
    </box>
  )
}

function truncate(input: string, maxLen: number): string {
  if (maxLen <= 1) return ""
  if (input.length <= maxLen) return input
  return `${input.slice(0, Math.max(0, maxLen - 1))}…`
}
