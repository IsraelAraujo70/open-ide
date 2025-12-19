/**
 * Command Registry
 *
 * Registers and executes commands. Commands can be invoked from:
 * - Keybindings
 * - Command Line (:save, :open, etc.)
 * - Command Palette
 */

import type { Command } from "../domain/types.ts"
import { store } from "./store.ts"
import { fileSystem, clipboard, settings, cleanupAndExit } from "../adapters/index.ts"

class CommandRegistry {
  private commands: Map<string, Command> = new Map()

  register(command: Command): void {
    this.commands.set(command.id, command)
  }

  get(id: string): Command | undefined {
    return this.commands.get(id)
  }

  getAll(): Command[] {
    return Array.from(this.commands.values())
  }

  async execute(id: string, args?: Record<string, unknown>): Promise<void> {
    const command = this.commands.get(id)
    if (command) {
      await command.execute(args)
    } else {
      console.error(`Command not found: ${id}`)
    }
  }

  /**
   * Parse and execute a command line string (e.g., ":save", ":open path/to/file")
   */
  async executeCommandLine(input: string): Promise<void> {
    const trimmed = input.trim()
    if (!trimmed) return

    // Remove leading : if present
    const line = trimmed.startsWith(":") ? trimmed.slice(1) : trimmed
    const parts = line.split(/\s+/)
    const commandName = parts[0]?.toLowerCase()
    const args = parts.slice(1)

    if (!commandName) return

    // Map command line aliases to command IDs
    const aliasMap: Record<string, string> = {
      // File operations
      save: "file.save",
      w: "file.save",
      write: "file.save",
      open: "file.open",
      e: "file.open",
      edit: "file.open",
      new: "file.new",
      close: "tab.close",
      q: "app.quit",
      quit: "app.quit",
      qa: "app.quitAll",
      wq: "file.saveAndQuit",

      // Navigation
      tabnext: "tab.next",
      tabprev: "tab.prev",
      tabn: "tab.next",
      tabp: "tab.prev",

      // Theme
      theme: "theme.set",
      colorscheme: "theme.set",

      // Terminal
      terminal: "terminal.open",
      term: "terminal.open",

      // OpenCode integration
      opencode: "opencode.open",
    }

    const commandId = aliasMap[commandName]
    if (commandId) {
      await this.execute(commandId, { args })
    } else {
      console.error(`Unknown command: ${commandName}`)
    }
  }
}

export const commandRegistry = new CommandRegistry()

/**
 * Parse and execute a command line string
 * This is a convenience export for the UI
 */
export async function parseAndExecuteCommand(input: string): Promise<void> {
  return commandRegistry.executeCommandLine(input)
}

// ============================================================================
// Register Built-in Commands
// ============================================================================

// File Operations
commandRegistry.register({
  id: "file.save",
  name: "Save File",
  category: "File",
  execute: async () => {
    const state = store.getState()
    const pane = getActivePane(state)
    if (!pane?.activeTabId) return

    const activeTab = pane.tabs.find(t => t.id === pane.activeTabId)
    if (!activeTab) return

    const buffer = state.buffers.get(activeTab.bufferId)
    if (!buffer?.filePath) {
      // TODO: Prompt for file path if untitled
      console.error("Cannot save untitled buffer without path")
      return
    }

    await fileSystem.writeFile(buffer.filePath, buffer.content)
    store.dispatch({ type: "SAVE_FILE", bufferId: buffer.id })
  },
})

commandRegistry.register({
  id: "file.open",
  name: "Open File",
  category: "File",
  execute: async args => {
    const argsArray = (args?.args as string[]) ?? []
    const path = argsArray[0]

    if (!path) {
      // Open file picker when no path provided
      store.dispatch({ type: "OPEN_FILE_PICKER" })
      return
    }

    // Load file content and open
    const exists = await fileSystem.exists(path)
    if (!exists) {
      console.error(`File not found: ${path}`)
      return
    }

    let content = ""
    try {
      content = await fileSystem.readFile(path)
    } catch (error) {
      console.error(`Failed to read file: ${path}`, error)
      return
    }

    store.dispatch({ type: "OPEN_FILE", path, content })
  },
})

commandRegistry.register({
  id: "file.new",
  name: "New File",
  category: "File",
  execute: () => {
    store.dispatch({ type: "NEW_FILE" })
  },
})

commandRegistry.register({
  id: "file.saveAndQuit",
  name: "Save and Quit",
  category: "File",
  execute: async () => {
    await commandRegistry.execute("file.save")
    await commandRegistry.execute("app.quit")
  },
})

// Tab Operations
commandRegistry.register({
  id: "tab.close",
  name: "Close Tab",
  category: "Tab",
  execute: () => {
    const state = store.getState()
    const pane = getActivePane(state)
    if (pane?.activeTabId) {
      store.dispatch({ type: "CLOSE_TAB", tabId: pane.activeTabId })
    }
  },
})

commandRegistry.register({
  id: "tab.next",
  name: "Next Tab",
  category: "Tab",
  execute: () => {
    store.dispatch({ type: "NEXT_TAB" })
  },
})

commandRegistry.register({
  id: "tab.prev",
  name: "Previous Tab",
  category: "Tab",
  execute: () => {
    store.dispatch({ type: "PREV_TAB" })
  },
})

// Theme Operations
commandRegistry.register({
  id: "theme.set",
  name: "Set Theme",
  category: "Theme",
  execute: async args => {
    const argsArray = (args?.args as string[]) ?? []
    const themeName = argsArray[0]

    if (themeName) {
      store.dispatch({ type: "SET_THEME", themeId: themeName })
      await settings.set("theme", themeName)
    } else {
      // Open theme picker if no name provided
      store.dispatch({ type: "OPEN_THEME_PICKER" })
    }
  },
})

commandRegistry.register({
  id: "theme.toggle",
  name: "Toggle Theme",
  category: "Theme",
  execute: () => {
    store.dispatch({ type: "TOGGLE_THEME" })
  },
})

// Terminal Operations
commandRegistry.register({
  id: "terminal.open",
  name: "Open Terminal",
  category: "Terminal",
  execute: () => {
    store.dispatch({ type: "OPEN_TERMINAL" })
  },
})

commandRegistry.register({
  id: "terminal.close",
  name: "Close Terminal",
  category: "Terminal",
  execute: () => {
    const state = store.getState()
    const activeTerminal = Array.from(state.terminals.values()).find(t => t.isActive)
    if (activeTerminal) {
      store.dispatch({ type: "CLOSE_TERMINAL", terminalId: activeTerminal.id })
    }
  },
})

// App Operations
commandRegistry.register({
  id: "app.quit",
  name: "Quit",
  category: "Application",
  execute: async () => {
    // TODO: Check for unsaved changes
    await cleanupAndExit(0)
  },
})

commandRegistry.register({
  id: "app.quitAll",
  name: "Quit All",
  category: "Application",
  execute: async () => {
    // TODO: Check for unsaved changes in all buffers
    await cleanupAndExit(0)
  },
})

// Focus Operations
commandRegistry.register({
  id: "focus.editor",
  name: "Focus Editor",
  category: "Navigation",
  execute: () => {
    store.dispatch({ type: "SET_FOCUS", target: "editor" })
  },
})

commandRegistry.register({
  id: "focus.explorer",
  name: "Focus Explorer",
  category: "Navigation",
  execute: () => {
    store.dispatch({ type: "SET_FOCUS", target: "explorer" })
  },
})

commandRegistry.register({
  id: "focus.terminal",
  name: "Focus Terminal",
  category: "Navigation",
  execute: () => {
    store.dispatch({ type: "SET_FOCUS", target: "terminal" })
  },
})

// Command Line / Palette
commandRegistry.register({
  id: "commandLine.open",
  name: "Open Command Line",
  category: "UI",
  execute: () => {
    store.dispatch({ type: "OPEN_COMMAND_LINE" })
  },
})

commandRegistry.register({
  id: "commandLine.close",
  name: "Close Command Line",
  category: "UI",
  execute: () => {
    store.dispatch({ type: "CLOSE_COMMAND_LINE" })
  },
})

commandRegistry.register({
  id: "palette.open",
  name: "Open Command Palette",
  category: "UI",
  execute: () => {
    store.dispatch({ type: "OPEN_PALETTE" })
  },
})

commandRegistry.register({
  id: "palette.close",
  name: "Close Command Palette",
  category: "UI",
  execute: () => {
    store.dispatch({ type: "CLOSE_PALETTE" })
  },
})

// File Picker
commandRegistry.register({
  id: "filePicker.open",
  name: "Open File Picker",
  category: "UI",
  description: "Open the file browser dialog",
  execute: () => {
    store.dispatch({ type: "OPEN_FILE_PICKER" })
  },
})

commandRegistry.register({
  id: "filePicker.close",
  name: "Close File Picker",
  category: "UI",
  execute: () => {
    store.dispatch({ type: "CLOSE_FILE_PICKER" })
  },
})

// Theme Picker
commandRegistry.register({
  id: "themePicker.open",
  name: "Open Theme Picker",
  category: "UI",
  description: "Open the theme selection dialog",
  execute: () => {
    store.dispatch({ type: "OPEN_THEME_PICKER" })
  },
})

commandRegistry.register({
  id: "themePicker.close",
  name: "Close Theme Picker",
  category: "UI",
  execute: () => {
    store.dispatch({ type: "CLOSE_THEME_PICKER" })
  },
})

// Clipboard Operations
commandRegistry.register({
  id: "clipboard.copy",
  name: "Copy",
  category: "Edit",
  execute: async () => {
    const state = store.getState()
    const pane = getActivePane(state)
    if (!pane?.activeTabId) return

    const activeTab = pane.tabs.find(t => t.id === pane.activeTabId)
    if (!activeTab) return

    const buffer = state.buffers.get(activeTab.bufferId)
    if (!buffer?.selection) return

    // Get selected text
    const { anchor, focus } = buffer.selection
    const start = Math.min(anchor.offset, focus.offset)
    const end = Math.max(anchor.offset, focus.offset)
    const selectedText = buffer.content.slice(start, end)

    await clipboard.writeText(selectedText)
  },
})

commandRegistry.register({
  id: "clipboard.paste",
  name: "Paste",
  category: "Edit",
  execute: async () => {
    const text = await clipboard.readText()
    // TODO: Insert text at cursor position
    console.log("Paste:", text)
  },
})

commandRegistry.register({
  id: "clipboard.cut",
  name: "Cut",
  category: "Edit",
  execute: async () => {
    await commandRegistry.execute("clipboard.copy")
    // TODO: Delete selection
  },
})

commandRegistry.register({
  id: "edit.selectAll",
  name: "Select All",
  category: "Edit",
  execute: () => {
    const state = store.getState()
    const pane = getActivePane(state)
    if (!pane?.activeTabId) return

    const activeTab = pane.tabs.find(t => t.id === pane.activeTabId)
    if (!activeTab) return

    const buffer = state.buffers.get(activeTab.bufferId)
    if (!buffer) return

    const lastLine = buffer.content.split("\n").length - 1
    const lastCol = buffer.content.split("\n")[lastLine]?.length ?? 0

    store.dispatch({
      type: "SET_SELECTION",
      bufferId: buffer.id,
      selection: {
        anchor: { line: 0, column: 0, offset: 0 },
        focus: {
          line: lastLine,
          column: lastCol,
          offset: buffer.content.length,
        },
      },
    })
  },
})

// OpenCode Integration
commandRegistry.register({
  id: "opencode.open",
  name: "Open OpenCode AI",
  category: "AI",
  description: "Open an OpenCode AI chat instance",
  execute: () => {
    // TODO: Implement OpenCode AI integration
    // This would open a pane with the OpenCode AI chat interface
    console.log("OpenCode AI integration coming soon!")
  },
})

// ============================================================================
// Helpers
// ============================================================================

import type { Pane, PaneNode } from "../domain/types.ts"

function getActivePane(state: ReturnType<typeof store.getState>): Pane | null {
  const findPane = (node: PaneNode): Pane | null => {
    if (node.type === "leaf") {
      return node.pane
    }
    for (const child of node.children) {
      const found = findPane(child)
      if (found) return found
    }
    return null
  }
  return findPane(state.layout.root)
}
