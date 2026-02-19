/**
 * ContextMenu Component - Right-click menu for quick actions
 */

import type { Theme } from "../../domain/types.ts"

export interface ContextMenuActionItem {
  type?: "action"
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

export interface ContextMenuSeparatorItem {
  id: string
  type: "separator"
}

export type ContextMenuItem = ContextMenuActionItem | ContextMenuSeparatorItem

interface ContextMenuProps {
  theme: Theme
  items: ContextMenuItem[]
  x: number
  y: number
  viewportWidth: number
  viewportHeight: number
  onClose: () => void
}

function isSeparator(item: ContextMenuItem): item is ContextMenuSeparatorItem {
  return item.type === "separator"
}

export function ContextMenu({
  theme,
  items,
  x,
  y,
  viewportWidth,
  viewportHeight,
  onClose,
}: ContextMenuProps) {
  const { colors } = theme

  const longestLine = items.reduce((maxLen, item) => {
    if (isSeparator(item)) return maxLen
    const shortcut = item.shortcut ? ` (${item.shortcut})` : ""
    return Math.max(maxLen, item.label.length + shortcut.length)
  }, 16)

  const menuWidth = Math.max(22, Math.min(68, longestLine + 4))
  const menuHeight = Math.max(3, items.length + 2)
  const left = Math.max(0, Math.min(viewportWidth - menuWidth, x))
  const top = Math.max(1, Math.min(viewportHeight - menuHeight - 1, y))

  return (
    <box
      position="absolute"
      top={top}
      left={left}
      width={menuWidth}
      height={menuHeight}
      backgroundColor={colors.background}
      borderStyle="single"
      border={true}
      borderColor={colors.primary}
      flexDirection="column"
      zIndex={240}
      onMouseDown={event => {
        event.stopPropagation?.()
        if (event.button === 2) {
          event.preventDefault?.()
        }
      }}
    >
      {items.map(item => {
        if (isSeparator(item)) {
          return (
            <box key={item.id} height={1} paddingLeft={1} paddingRight={1}>
              <text fg={colors.border}>{"─".repeat(Math.max(1, menuWidth - 2))}</text>
            </box>
          )
        }

        const fg = item.disabled ? colors.comment : colors.foreground
        const shortcutText = item.shortcut ? ` (${item.shortcut})` : ""
        const lineText = truncate(`${item.label}${shortcutText}`, menuWidth - 4)

        return (
          <box
            key={item.id}
            height={1}
            paddingLeft={1}
            paddingRight={1}
            onMouseDown={event => {
              if (event.button !== 0 || item.disabled) return
              event.preventDefault?.()
              event.stopPropagation?.()
              onClose()
              void item.onSelect()
            }}
          >
            <text fg={fg}>{lineText}</text>
          </box>
        )
      })}
    </box>
  )
}

function truncate(input: string, maxLen: number): string {
  if (maxLen <= 1) return ""
  if (input.length <= maxLen) return input
  return `${input.slice(0, Math.max(0, maxLen - 1))}…`
}
