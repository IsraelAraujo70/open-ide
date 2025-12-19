/**
 * ThemePicker Component - Visual theme selector
 */

import { useState } from "react"
import type { Theme } from "../../domain/types.ts"
import { defaultThemes } from "../../domain/themes.ts"
import type { KeyEvent } from "@opentui/core"

interface ThemePickerProps {
  currentTheme: Theme
  width: number
  height: number
  onSelect: (themeId: string) => void
  onCancel: () => void
}

export function ThemePicker({ currentTheme, width, height, onSelect, onCancel }: ThemePickerProps) {
  const { colors } = currentTheme
  const [selectedIndex, setSelectedIndex] = useState(() => 
    defaultThemes.findIndex(t => t.id === currentTheme.id)
  )
  
  const handleKeyDown = (key: KeyEvent) => {
    if (key.name === "escape") {
      onCancel()
    } else if (key.name === "return" || key.name === "enter") {
      const selected = defaultThemes[selectedIndex]
      if (selected) {
        onSelect(selected.id)
      }
    } else if (key.name === "up") {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.name === "down") {
      setSelectedIndex(i => Math.min(defaultThemes.length - 1, i + 1))
    }
  }
  
  // Center the picker
  const leftOffset = Math.floor((100 - width) / 2)
  const topOffset = Math.floor((24 - height) / 2)
  
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
      {/* Header */}
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.primary}>
          <b>Select Theme</b>
        </text>
      </box>
      
      {/* Divider */}
      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>
      
      {/* Theme list */}
      <scrollbox 
        flexGrow={1}
        onKeyDown={handleKeyDown}
        focused={true}
      >
        {defaultThemes.map((theme, index) => (
          <ThemeRow
            key={theme.id}
            theme={theme}
            isSelected={index === selectedIndex}
            isCurrent={theme.id === currentTheme.id}
            currentTheme={currentTheme}
            onSelect={() => onSelect(theme.id)}
          />
        ))}
      </scrollbox>
      
      {/* Preview */}
      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>
      <box height={3} paddingLeft={1} paddingRight={1} flexDirection="column">
        <text fg={colors.comment}>Preview:</text>
        <ThemePreview theme={defaultThemes[selectedIndex] ?? currentTheme} />
      </box>
      
      {/* Help */}
      <box height={1} paddingLeft={1}>
        <text fg={colors.comment}>Enter: select | Esc: cancel</text>
      </box>
    </box>
  )
}

interface ThemeRowProps {
  theme: Theme
  isSelected: boolean
  isCurrent: boolean
  currentTheme: Theme
  onSelect: () => void
}

function ThemeRow({ theme, isSelected, isCurrent, currentTheme, onSelect }: ThemeRowProps) {
  const { colors } = currentTheme
  const bg = isSelected ? colors.selection : colors.background
  const indicator = isCurrent ? " *" : ""
  const label = `${theme.name}${indicator} (${theme.type})`
  
  return (
    <box
      height={1}
      backgroundColor={bg}
      paddingLeft={1}
      paddingRight={1}
      onMouseDown={onSelect}
    >
      <text fg={colors.foreground} bg={bg}>{label}</text>
    </box>
  )
}

interface ThemePreviewProps {
  theme: Theme
}

function ThemePreview({ theme }: ThemePreviewProps) {
  const { colors } = theme
  
  return (
    <box flexDirection="row" height={1}>
      <text bg={colors.background} fg={colors.foreground}>text</text>
      <text bg={colors.background} fg={colors.keyword}> keyword</text>
      <text bg={colors.background} fg={colors.string}> "string"</text>
      <text bg={colors.background} fg={colors.comment}> // comment</text>
      <text bg={colors.primary} fg={colors.background}> primary </text>
    </box>
  )
}
