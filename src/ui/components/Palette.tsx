/**
 * Palette Component - Command palette overlay (Ctrl+Shift+P)
 */

import type { Theme, PaletteItem, Command } from "../../domain/types.ts"
import { commandRegistry } from "../../application/commands.ts"
import { useEffect, useMemo, useState } from "react"
import type { KeyEvent } from "@opentui/core"

interface PaletteProps {
  query: string
  items: PaletteItem[]
  theme: Theme
  width: number
  height: number
  onClose: () => void
  onQueryChange: (query: string) => void
}

interface CommandItem {
  id: string
  label: string
  description?: string
  action: () => void
}

function normalizeKeyName(name: string): string {
  if (name === "return") return "enter"
  return name.toLowerCase()
}

export function Palette({ query, theme, width, height, onClose, onQueryChange }: PaletteProps) {
  const { colors } = theme
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Get all available commands for the palette
  const allCommands = useMemo((): CommandItem[] => {
    return commandRegistry.getAll().map((cmd: Command) => ({
      id: cmd.id,
      label: cmd.name?.trim() || cmd.id,
      description: cmd.description,
      action: () => commandRegistry.execute(cmd.id),
    }))
  }, [])

  // Filter commands based on query
  const filteredItems = useMemo(() => {
    if (!query) return allCommands
    const lowerQuery = query.toLowerCase()
    return allCommands.filter(
      (item: CommandItem) =>
        item.label.toLowerCase().includes(lowerQuery) ||
        item.id.toLowerCase().includes(lowerQuery) ||
        item.description?.toLowerCase().includes(lowerQuery)
    )
  }, [query, allCommands])

  useEffect(() => {
    setSelectedIndex(index => {
      if (filteredItems.length === 0) return 0
      return Math.max(0, Math.min(filteredItems.length - 1, index))
    })
  }, [filteredItems.length])

  const runSelectedAction = (item: CommandItem | undefined) => {
    if (!item) {
      return
    }

    void Promise.resolve(item.action()).finally(onClose)
  }

  const handleKeyDown = (key: KeyEvent) => {
    const keyName = normalizeKeyName(key.name)

    if (keyName === "escape") {
      key.preventDefault?.()
      onClose()
    } else if (keyName === "enter") {
      key.preventDefault?.()
      runSelectedAction(filteredItems[selectedIndex])
    } else if (keyName === "up") {
      key.preventDefault?.()
      setSelectedIndex((i: number) => Math.max(0, i - 1))
    } else if (keyName === "down") {
      key.preventDefault?.()
      setSelectedIndex((i: number) => Math.min(filteredItems.length - 1, i + 1))
    }
  }

  // Center the palette
  const leftOffset = Math.floor((100 - width) / 2)
  const topOffset = 3

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
      zIndex={200}
    >
      {/* Search input */}
      <box height={1} paddingLeft={1} paddingRight={1} flexDirection="row">
        <text fg={colors.primary}>{">"}</text>
        <input
          flexGrow={1}
          value={query}
          focused={true}
          backgroundColor={colors.background}
          textColor={colors.foreground}
          placeholder="Type to search commands..."
          placeholderColor={colors.comment}
          onInput={(value: string) => {
            setSelectedIndex(0)
            onQueryChange(value)
          }}
          onKeyDown={handleKeyDown}
        />
      </box>

      {/* Divider */}
      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>

      {/* Command list */}
      <scrollbox flexGrow={1}>
        {filteredItems.length === 0 ? (
          <text fg={colors.comment} paddingLeft={1}>
            No matching commands
          </text>
        ) : (
          filteredItems.slice(0, height - 3).map((item: CommandItem, index: number) => (
            <PaletteItemRow
              key={item.id}
              item={item}
              isSelected={index === selectedIndex}
              theme={theme}
              onSelect={() => runSelectedAction(item)}
            />
          ))
        )}
      </scrollbox>
    </box>
  )
}

interface PaletteItemRowProps {
  item: CommandItem
  isSelected: boolean
  theme: Theme
  onSelect: () => void
}

function PaletteItemRow({ item, isSelected, theme, onSelect }: PaletteItemRowProps) {
  const { colors } = theme
  const bg = isSelected ? colors.selection : colors.background
  const primaryLabel = item.label.trim() || item.id

  return (
    <box height={1} backgroundColor={bg} paddingLeft={1} paddingRight={1} onMouseDown={onSelect}>
      <text fg={colors.foreground} bg={bg}>
        {primaryLabel}
      </text>
      {item.description && (
        <text fg={colors.comment} bg={bg}>
          {"  "}{item.description}
        </text>
      )}
    </box>
  )
}
