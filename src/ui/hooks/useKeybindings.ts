/**
 * useKeybindings hook - Handles global keyboard shortcuts
 */

import { useKeyboard } from "@opentui/react"
import { commandRegistry } from "../../application/commands.ts"
import { store } from "../../application/store.ts"
import type { KeyEvent } from "@opentui/core"

export interface KeybindingConfig {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  command: string
  when?: (state: ReturnType<typeof store.getState>) => boolean
}

const defaultKeybindings: KeybindingConfig[] = [
  // File operations
  { key: "s", ctrl: true, command: "file.save" },
  { key: "n", ctrl: true, command: "file.new" },
  { key: "p", ctrl: true, command: "filePicker.open" },
  { key: "o", ctrl: true, command: "filePicker.open" },
  { key: "o", ctrl: true, shift: true, command: "project.open" },
  { key: "w", ctrl: true, command: "tab.close" },

  // Navigation
  { key: "k", ctrl: true, shift: true, command: "palette.open" },
  { key: "tab", ctrl: true, command: "tab.next" },
  { key: "tab", ctrl: true, shift: true, command: "tab.prev" },
  { key: "b", ctrl: true, command: "explorer.toggle" },

  // Edit
  { key: "a", ctrl: true, command: "edit.selectAll" },

  // Theme
  { key: "t", ctrl: true, shift: true, command: "theme.toggle" },
  { key: "k", ctrl: true, command: "themePicker.open" },

  // Focus
  { key: "e", ctrl: true, shift: true, command: "focus.explorer" },
  { key: "`", ctrl: true, command: "terminal.open" },
]

const editorNavKeys = new Set(["left", "right", "up", "down", "home", "end", "pageup", "pagedown"])
const editorInsertKeys = new Set(["insert", "return", "enter", "i"])

function normalizeKeyName(name: string): string {
  if (name === "return") return "enter"
  return name.toLowerCase()
}

function matchesBinding(event: KeyEvent, binding: KeybindingConfig): boolean {
  const eventKey = normalizeKeyName(event.name)
  const bindingKey = normalizeKeyName(binding.key)

  const altPressed = !!event.option || !!event.meta
  const metaPressed = !!event.super

  return (
    eventKey === bindingKey &&
    !!event.ctrl === !!binding.ctrl &&
    !!event.shift === !!binding.shift &&
    altPressed === !!binding.alt &&
    metaPressed === !!binding.meta
  )
}

export function useKeybindings() {
  useKeyboard((event: KeyEvent) => {
    const state = store.getState()

    // Special handling for Escape
    if (event.name === "escape") {
      if (state.commandLine.isOpen) {
        commandRegistry.execute("commandLine.close")
        return
      }
      if (state.palette.isOpen) {
        commandRegistry.execute("palette.close")
        return
      }
      if (state.filePicker.isOpen) {
        commandRegistry.execute("filePicker.close")
        return
      }
      if (state.themePicker.isOpen) {
        commandRegistry.execute("themePicker.close")
        return
      }
      if (state.keybindingsHelp.isOpen) {
        commandRegistry.execute("keybindings.close")
        return
      }

      if (state.focusTarget === "editor" && state.editorMode === "insert") {
        event.preventDefault?.()
        commandRegistry.execute("mode.normal")
        return
      }

      if (state.focusTarget !== "editor") {
        commandRegistry.execute("focus.editor")
      }
      return
    }

    const hasModalOpen =
      state.commandLine.isOpen ||
      state.palette.isOpen ||
      state.filePicker.isOpen ||
      state.themePicker.isOpen ||
      state.keybindingsHelp.isOpen

    // Let active modal widgets handle their own key events.
    if (hasModalOpen) {
      return
    }

    // Check keybindings first so Ctrl/Meta shortcuts keep working in all editor modes.
    for (const binding of defaultKeybindings) {
      if (matchesBinding(event, binding)) {
        if (!binding.when || binding.when(state)) {
          event.preventDefault?.()
          commandRegistry.execute(binding.command)
          return
        }
      }
    }

    const keyName = normalizeKeyName(event.name)

    if (state.focusTarget === "editor" && state.editorMode === "normal") {
      if (editorInsertKeys.has(keyName)) {
        event.preventDefault?.()
        commandRegistry.execute("mode.insert")
        return
      }

      if (event.sequence === ":") {
        event.preventDefault?.()
        commandRegistry.execute("commandLine.open")
        return
      }

      // Block text editing keys in NORMAL mode, while preserving arrow navigation.
      const hasModifier = !!event.ctrl || !!event.meta || !!event.option || !!event.super
      if (!hasModifier && !editorNavKeys.has(keyName)) {
        event.preventDefault?.()
      }
      return
    }

    // Open command line outside INSERT mode using :
    if (event.sequence === ":" && state.focusTarget !== "editor") {
      commandRegistry.execute("commandLine.open")
      return
    }
  })
}
