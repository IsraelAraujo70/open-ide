/**
 * Domain Types - Core business entities for OpenCode IDE
 * These are pure data structures with no dependencies on infrastructure
 */

// ============================================================================
// Buffer & Editor
// ============================================================================

export interface BufferState {
  id: string
  filePath: string | null // null = untitled/scratch buffer
  content: string
  isDirty: boolean
  language: string | null
  cursorPosition: CursorPosition
  selection: Selection | null
}

export interface CursorPosition {
  line: number
  column: number
  offset: number
}

export interface Selection {
  anchor: CursorPosition
  focus: CursorPosition
}

// ============================================================================
// Tabs & Panes
// ============================================================================

export interface Tab {
  id: string
  bufferId: string
  label: string
  isActive: boolean
  isPinned: boolean
}

export type PaneDirection = "horizontal" | "vertical"

export interface Pane {
  id: string
  type: "editor" | "terminal" | "explorer" | "output"
  tabs: Tab[]
  activeTabId: string | null
  size: number // percentage or flex value
}

export interface PaneLayout {
  root: PaneNode
}

export type PaneNode =
  | { type: "leaf"; pane: Pane }
  | { type: "split"; direction: PaneDirection; children: PaneNode[]; sizes: number[] }

// ============================================================================
// Theme
// ============================================================================

export interface ThemeColors {
  background: string
  foreground: string
  primary: string
  secondary: string
  accent: string
  error: string
  warning: string
  success: string
  info: string
  border: string
  selection: string
  lineHighlight: string
  comment: string
  keyword: string
  string: string
  number: string
  function: string
  variable: string
  type: string
  operator: string
}

export interface Theme {
  id: string
  name: string
  type: "dark" | "light"
  colors: ThemeColors
}

// ============================================================================
// Commands & Keybindings
// ============================================================================

export interface Command {
  id: string
  name: string
  description?: string
  category?: string
  execute: (args?: Record<string, unknown>) => void | Promise<void>
}

export interface Keybinding {
  key: string
  command: string
  when?: string // context condition
  args?: Record<string, unknown>
}

export type ModifierKey = "ctrl" | "shift" | "alt" | "meta" | "super"

export interface KeyCombo {
  key: string
  modifiers: ModifierKey[]
}

// ============================================================================
// File System
// ============================================================================

export interface FileEntry {
  name: string
  path: string
  type: "file" | "directory"
  size?: number
  modifiedAt?: Date
}

export interface DirectoryTree {
  entry: FileEntry
  children: DirectoryTree[]
  isExpanded: boolean
}

// ============================================================================
// Terminal
// ============================================================================

export interface TerminalState {
  id: string
  title: string
  cwd: string
  isActive: boolean
  pid?: number
}

// ============================================================================
// LSP
// ============================================================================

export interface LspServerConfig {
  language: string
  command: string
  args: string[]
  rootUri?: string
}

export interface Diagnostic {
  range: {
    start: CursorPosition
    end: CursorPosition
  }
  severity: "error" | "warning" | "info" | "hint"
  message: string
  source?: string
  code?: string | number
}

export interface CompletionItem {
  label: string
  kind: string
  detail?: string
  documentation?: string
  insertText?: string
  sortText?: string
}

export interface HoverInfo {
  contents: string
  range?: {
    start: CursorPosition
    end: CursorPosition
  }
}

// ============================================================================
// App State
// ============================================================================

export type FocusTarget = "editor" | "commandLine" | "explorer" | "terminal" | "palette"

export interface AppState {
  workspace: {
    rootPath: string | null
    directoryTree: DirectoryTree | null
  }
  buffers: Map<string, BufferState>
  layout: PaneLayout
  theme: Theme
  focusTarget: FocusTarget
  commandLine: {
    isOpen: boolean
    value: string
  }
  palette: {
    isOpen: boolean
    query: string
    items: PaletteItem[]
  }
  filePicker: {
    isOpen: boolean
  }
  themePicker: {
    isOpen: boolean
  }
  terminals: Map<string, TerminalState>
  diagnostics: Map<string, Diagnostic[]> // bufferId -> diagnostics
}

export interface PaletteItem {
  id: string
  label: string
  description?: string
  icon?: string
  action: () => void | Promise<void>
}

// ============================================================================
// Events / Actions
// ============================================================================

export type AppAction =
  // File operations
  | { type: "OPEN_FILE"; path: string; content?: string }
  | { type: "SAVE_FILE"; bufferId: string }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "NEW_FILE" }

  // Editor
  | { type: "SET_BUFFER_CONTENT"; bufferId: string; content: string }
  | { type: "SET_CURSOR"; bufferId: string; position: CursorPosition }
  | { type: "SET_SELECTION"; bufferId: string; selection: Selection | null }

  // Navigation
  | { type: "SET_FOCUS"; target: FocusTarget }
  | { type: "SWITCH_TAB"; tabId: string }
  | { type: "NEXT_TAB" }
  | { type: "PREV_TAB" }

  // Command line
  | { type: "OPEN_COMMAND_LINE" }
  | { type: "CLOSE_COMMAND_LINE" }
  | { type: "SET_COMMAND_LINE_VALUE"; value: string }
  | { type: "EXECUTE_COMMAND"; command: string }

  // Palette
  | { type: "OPEN_PALETTE" }
  | { type: "CLOSE_PALETTE" }
  | { type: "SET_PALETTE_QUERY"; query: string }

  // Theme
  | { type: "SET_THEME"; themeId: string }
  | { type: "TOGGLE_THEME" }

  // Terminal
  | { type: "OPEN_TERMINAL" }
  | { type: "CLOSE_TERMINAL"; terminalId: string }
  | { type: "FOCUS_TERMINAL"; terminalId: string }

  // Workspace
  | { type: "SET_WORKSPACE"; path: string }
  | { type: "SET_DIRECTORY_TREE"; tree: DirectoryTree }
  | { type: "LOAD_DIRECTORY_CHILDREN"; path: string; children: DirectoryTree[] }
  | { type: "REFRESH_TREE" }
  | { type: "TOGGLE_DIRECTORY"; path: string }

  // Panes
  | { type: "SPLIT_PANE"; direction: PaneDirection }
  | { type: "CLOSE_PANE"; paneId: string }
  | { type: "RESIZE_PANE"; paneId: string; size: number }

  // File Picker
  | { type: "OPEN_FILE_PICKER" }
  | { type: "CLOSE_FILE_PICKER" }

  // Theme Picker
  | { type: "OPEN_THEME_PICKER" }
  | { type: "CLOSE_THEME_PICKER" }
