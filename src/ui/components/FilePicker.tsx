/**
 * FilePicker Component - File browser dialog for opening files
 */

import { useState, useMemo, useEffect } from "react"
import type { Theme, FileEntry } from "../../domain/types.ts"
import { fileSystem } from "../../adapters/index.ts"
import type { KeyEvent } from "@opentui/core"

interface FilePickerProps {
  theme: Theme
  width: number
  height: number
  initialPath: string
  onSelect: (path: string) => void
  onCancel: () => void
}

export function FilePicker({
  theme,
  width,
  height,
  initialPath,
  onSelect,
  onCancel,
}: FilePickerProps) {
  const { colors } = theme
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)

  // Load directory contents
  useEffect(() => {
    setLoading(true)
    fileSystem
      .listDirectory(currentPath)
      .then(items => {
        // Sort: directories first, then files, alphabetically
        const sorted = items.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name)
          return a.type === "directory" ? -1 : 1
        })
        setEntries(sorted)
        setSelectedIndex(0)
        setLoading(false)
      })
      .catch(() => {
        setEntries([])
        setLoading(false)
      })
  }, [currentPath])

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!filter) return entries
    const lowerFilter = filter.toLowerCase()
    return entries.filter(e => e.name.toLowerCase().includes(lowerFilter))
  }, [entries, filter])

  const handleKeyDown = (key: KeyEvent) => {
    if (key.name === "escape") {
      onCancel()
    } else if (key.name === "return" || key.name === "enter") {
      const selected = filteredEntries[selectedIndex]
      if (selected) {
        if (selected.type === "directory") {
          setCurrentPath(selected.path)
          setFilter("")
        } else {
          onSelect(selected.path)
        }
      }
    } else if (key.name === "up") {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.name === "down") {
      setSelectedIndex(i => Math.min(filteredEntries.length - 1, i + 1))
    } else if (key.name === "backspace" && !filter) {
      // Go up one directory
      const parent = currentPath.split("/").slice(0, -1).join("/") || "/"
      setCurrentPath(parent)
    }
  }

  // Center the picker
  const leftOffset = Math.floor((100 - width) / 2)
  const topOffset = 2

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
      {/* Header with path */}
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.primary}>Open File</text>
      </box>

      {/* Current path */}
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.comment}>{currentPath}</text>
      </box>

      {/* Search/filter input */}
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.primary}>{">"}</text>
        <input
          flexGrow={1}
          value={filter}
          focused={true}
          backgroundColor={colors.background}
          textColor={colors.foreground}
          placeholder="Type to filter..."
          placeholderColor={colors.comment}
          onInput={(value: string) => {
            setFilter(value)
            setSelectedIndex(0)
          }}
          onKeyDown={handleKeyDown}
        />
      </box>

      {/* Divider */}
      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>

      {/* File list */}
      <scrollbox flexGrow={1}>
        {loading ? (
          <text fg={colors.comment} paddingLeft={1}>
            Loading...
          </text>
        ) : filteredEntries.length === 0 ? (
          <text fg={colors.comment} paddingLeft={1}>
            No files found
          </text>
        ) : (
          filteredEntries.slice(0, height - 6).map((entry, index) => (
            <FileEntryRow
              key={entry.path}
              entry={entry}
              isSelected={index === selectedIndex}
              theme={theme}
              onSelect={() => {
                if (entry.type === "directory") {
                  setCurrentPath(entry.path)
                  setFilter("")
                } else {
                  onSelect(entry.path)
                }
              }}
            />
          ))
        )}
      </scrollbox>

      {/* Help */}
      <box height={1} paddingLeft={1}>
        <text fg={colors.comment}>Enter: select | Backspace: parent | Esc: cancel</text>
      </box>
    </box>
  )
}

interface FileEntryRowProps {
  entry: FileEntry
  isSelected: boolean
  theme: Theme
  onSelect: () => void
}

function FileEntryRow({ entry, isSelected, theme, onSelect }: FileEntryRowProps) {
  const { colors } = theme
  const bg = isSelected ? colors.selection : colors.background
  const fg = entry.type === "directory" ? colors.keyword : colors.foreground
  const icon = entry.type === "directory" ? "📁 " : "📄 "

  return (
    <box height={1} backgroundColor={bg} paddingLeft={1} paddingRight={1} onMouseDown={onSelect}>
      <text fg={fg} bg={bg}>
        {icon}
        {entry.name}
      </text>
    </box>
  )
}
