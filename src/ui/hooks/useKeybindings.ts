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
  { key: "o", ctrl: true, command: "filePicker.open" },
  { key: "w", ctrl: true, command: "tab.close" },

  // Navigation
  { key: "p", ctrl: true, command: "palette.open" },
  { key: "Tab", ctrl: true, command: "tab.next" },
  { key: "Tab", ctrl: true, shift: true, command: "tab.prev" },

  // Edit
  { key: "c", ctrl: true, command: "clipboard.copy" },
  { key: "v", ctrl: true, command: "clipboard.paste" },
  { key: "x", ctrl: true, command: "clipboard.cut" },
  { key: "a", ctrl: true, command: "edit.selectAll" },

  // Theme
  { key: "t", ctrl: true, shift: true, command: "theme.toggle" },
  { key: "k", ctrl: true, command: "themePicker.open" },

  // Focus
  { key: "e", ctrl: true, shift: true, command: "focus.explorer" },
  { key: "`", ctrl: true, command: "terminal.open" },
]

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
      // Escape from editor focus (for : command line)
      if (state.focusTarget === "editor") {
        store.dispatch({ type: "SET_FOCUS", target: "editor" })
        // The UI will handle showing that we're ready for : input
        return
      }
    }

    // Handle : for command line (only when not focused on editor input)
    if (
      event.sequence === ":" &&
      state.focusTarget !== "commandLine" &&
      state.focusTarget !== "palette"
    ) {
      commandRegistry.execute("commandLine.open")
      return
    }

    // Check keybindings
    for (const binding of defaultKeybindings) {
      const matches =
        event.name === binding.key.toLowerCase() &&
        !!event.ctrl === !!binding.ctrl &&
        !!event.shift === !!binding.shift &&
        !!event.meta === !!binding.alt

      if (matches) {
        if (!binding.when || binding.when(state)) {
          event.preventDefault?.()
          commandRegistry.execute(binding.command)
          return
        }
      }
    }
  })
}
