/**
 * Application State Store
 *
 * Central state management using a simple reducer pattern.
 * The UI subscribes to state changes and re-renders accordingly.
 */

import type {
  AppState,
  AppAction,
  BufferState,
  Tab,
  Pane,
  PaneLayout,
  FocusTarget,
  DirectoryTree,
  TerminalState,
} from "../domain/types.ts"
import { defaultTheme, defaultThemes } from "../domain/themes.ts"

// ============================================================================
// Initial State
// ============================================================================

const createInitialPane = (): Pane => ({
  id: "main-pane",
  type: "editor",
  tabs: [],
  activeTabId: null,
  size: 100,
})

const createInitialLayout = (): PaneLayout => ({
  root: {
    type: "leaf",
    pane: createInitialPane(),
  },
})

export const createInitialState = (): AppState => ({
  workspace: {
    rootPath: null,
    directoryTree: null,
  },
  buffers: new Map(),
  layout: createInitialLayout(),
  explorerWidth: 25,
  explorerVisible: true,
  theme: defaultTheme,
  focusTarget: "editor",
  editorMode: "insert",
  commandLine: {
    isOpen: false,
    value: "",
  },
  palette: {
    isOpen: false,
    query: "",
    items: [],
  },
  filePicker: {
    isOpen: false,
    mode: "file",
  },
  themePicker: {
    isOpen: false,
  },
  terminals: new Map(),
  diagnostics: new Map(),
})

// ============================================================================
// Helpers
// ============================================================================

let bufferId = 0
const generateBufferId = () => `buffer-${++bufferId}`

let tabId = 0
const generateTabId = () => `tab-${++tabId}`

let terminalId = 0
const generateTerminalId = () => `terminal-${++terminalId}`

function getActivePane(layout: PaneLayout): Pane | null {
  const findPane = (node: PaneLayout["root"]): Pane | null => {
    if (node.type === "leaf") {
      return node.pane
    }
    for (const child of node.children) {
      const found = findPane(child)
      if (found) return found
    }
    return null
  }
  return findPane(layout.root)
}

function updatePaneInLayout(
  node: PaneLayout["root"],
  paneId: string,
  updater: (pane: Pane) => Pane
): PaneLayout["root"] {
  if (node.type === "leaf") {
    if (node.pane.id === paneId) {
      return { type: "leaf", pane: updater(node.pane) }
    }
    return node
  }
  return {
    ...node,
    children: node.children.map(child => updatePaneInLayout(child, paneId, updater)),
  }
}

function basename(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] || path
}

// ============================================================================
// Reducer
// ============================================================================

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "OPEN_FILE": {
      const { path } = action
      const initialContent = action.content ?? ""

      // Check if already open
      for (const [id, buffer] of state.buffers) {
        if (buffer.filePath === path) {
          // Just switch to existing tab
          const pane = getActivePane(state.layout)
          if (pane) {
            const existingTab = pane.tabs.find(t => t.bufferId === id)
            if (existingTab) {
              const newLayout: PaneLayout = {
                root: updatePaneInLayout(state.layout.root, pane.id, p => ({
                  ...p,
                  activeTabId: existingTab.id,
                  tabs: p.tabs.map(t => ({
                    ...t,
                    isActive: t.id === existingTab.id,
                  })),
                })),
              }
              return { ...state, layout: newLayout, focusTarget: "editor" }
            }
          }
        }
      }

      // Create new buffer (content will be loaded async)
      const newBufferId = generateBufferId()
      const newBuffer: BufferState = {
        id: newBufferId,
        filePath: path,
        content: initialContent,
        isDirty: false,
        language: detectLanguage(path),
        cursorPosition: { line: 0, column: 0, offset: 0 },
        selection: null,
      }

      const newTab: Tab = {
        id: generateTabId(),
        bufferId: newBufferId,
        label: basename(path),
        isActive: true,
        isPinned: false,
      }

      const newBuffers = new Map(state.buffers)
      newBuffers.set(newBufferId, newBuffer)

      const pane = getActivePane(state.layout)
      if (!pane) return state

      const newLayout: PaneLayout = {
        root: updatePaneInLayout(state.layout.root, pane.id, p => ({
          ...p,
          activeTabId: newTab.id,
          tabs: [...p.tabs.map(t => ({ ...t, isActive: false })), newTab],
        })),
      }

      return {
        ...state,
        buffers: newBuffers,
        layout: newLayout,
        focusTarget: "editor",
      }
    }

    case "SAVE_FILE": {
      const buffer = state.buffers.get(action.bufferId)
      if (!buffer) return state

      const newBuffers = new Map(state.buffers)
      newBuffers.set(action.bufferId, { ...buffer, isDirty: false })

      return { ...state, buffers: newBuffers }
    }

    case "CLOSE_TAB": {
      const pane = getActivePane(state.layout)
      if (!pane) return state

      const tabIndex = pane.tabs.findIndex(t => t.id === action.tabId)
      if (tabIndex === -1) return state

      const closingTab = pane.tabs[tabIndex]!
      const newTabs = pane.tabs.filter(t => t.id !== action.tabId)

      // Remove buffer if no other tabs reference it
      const newBuffers = new Map(state.buffers)
      const isBufferUsedElsewhere = newTabs.some(t => t.bufferId === closingTab.bufferId)
      if (!isBufferUsedElsewhere) {
        newBuffers.delete(closingTab.bufferId)
      }

      // Determine new active tab
      let newActiveTabId: string | null = null
      if (newTabs.length > 0) {
        if (closingTab.isActive) {
          // Activate adjacent tab
          const newIndex = Math.min(tabIndex, newTabs.length - 1)
          newActiveTabId = newTabs[newIndex]!.id
        } else {
          newActiveTabId = pane.activeTabId
        }
      }

      const newLayout: PaneLayout = {
        root: updatePaneInLayout(state.layout.root, pane.id, p => ({
          ...p,
          activeTabId: newActiveTabId,
          tabs: newTabs.map(t => ({
            ...t,
            isActive: t.id === newActiveTabId,
          })),
        })),
      }

      return { ...state, buffers: newBuffers, layout: newLayout }
    }

    case "NEW_FILE": {
      const newBufferId = generateBufferId()
      const newBuffer: BufferState = {
        id: newBufferId,
        filePath: null,
        content: "",
        isDirty: false,
        language: null,
        cursorPosition: { line: 0, column: 0, offset: 0 },
        selection: null,
      }

      const newTab: Tab = {
        id: generateTabId(),
        bufferId: newBufferId,
        label: "Untitled",
        isActive: true,
        isPinned: false,
      }

      const newBuffers = new Map(state.buffers)
      newBuffers.set(newBufferId, newBuffer)

      const pane = getActivePane(state.layout)
      if (!pane) return state

      const newLayout: PaneLayout = {
        root: updatePaneInLayout(state.layout.root, pane.id, p => ({
          ...p,
          activeTabId: newTab.id,
          tabs: [...p.tabs.map(t => ({ ...t, isActive: false })), newTab],
        })),
      }

      return {
        ...state,
        buffers: newBuffers,
        layout: newLayout,
        focusTarget: "editor",
      }
    }

    case "SET_BUFFER_CONTENT": {
      const buffer = state.buffers.get(action.bufferId)
      if (!buffer) return state

      const newBuffers = new Map(state.buffers)
      newBuffers.set(action.bufferId, {
        ...buffer,
        content: action.content,
        isDirty: buffer.content !== action.content,
      })

      return { ...state, buffers: newBuffers }
    }

    case "SET_CURSOR": {
      const buffer = state.buffers.get(action.bufferId)
      if (!buffer) return state

      const newBuffers = new Map(state.buffers)
      newBuffers.set(action.bufferId, {
        ...buffer,
        cursorPosition: action.position,
      })

      return { ...state, buffers: newBuffers }
    }

    case "SET_SELECTION": {
      const buffer = state.buffers.get(action.bufferId)
      if (!buffer) return state

      const newBuffers = new Map(state.buffers)
      newBuffers.set(action.bufferId, {
        ...buffer,
        selection: action.selection,
      })

      return { ...state, buffers: newBuffers }
    }

    case "SET_EDITOR_MODE": {
      return { ...state, editorMode: action.mode }
    }

    case "SET_FOCUS": {
      return { ...state, focusTarget: action.target }
    }

    case "SET_EXPLORER_WIDTH": {
      const minWidth = 8
      const width = Math.max(minWidth, Math.floor(action.width))
      return { ...state, explorerWidth: width }
    }

    case "TOGGLE_EXPLORER": {
      const explorerVisible = !state.explorerVisible
      const focusTarget =
        !explorerVisible && state.focusTarget === "explorer" ? "editor" : state.focusTarget

      return { ...state, explorerVisible, focusTarget }
    }

    case "SWITCH_TAB": {
      const pane = getActivePane(state.layout)
      if (!pane) return state

      const newLayout: PaneLayout = {
        root: updatePaneInLayout(state.layout.root, pane.id, p => ({
          ...p,
          activeTabId: action.tabId,
          tabs: p.tabs.map(t => ({
            ...t,
            isActive: t.id === action.tabId,
          })),
        })),
      }

      return { ...state, layout: newLayout }
    }

    case "NEXT_TAB": {
      const pane = getActivePane(state.layout)
      if (!pane || pane.tabs.length === 0) return state

      const currentIndex = pane.tabs.findIndex(t => t.isActive)
      const nextIndex = (currentIndex + 1) % pane.tabs.length
      const nextTab = pane.tabs[nextIndex]!

      return appReducer(state, { type: "SWITCH_TAB", tabId: nextTab.id })
    }

    case "PREV_TAB": {
      const pane = getActivePane(state.layout)
      if (!pane || pane.tabs.length === 0) return state

      const currentIndex = pane.tabs.findIndex(t => t.isActive)
      const prevIndex = currentIndex === 0 ? pane.tabs.length - 1 : currentIndex - 1
      const prevTab = pane.tabs[prevIndex]!

      return appReducer(state, { type: "SWITCH_TAB", tabId: prevTab.id })
    }

    case "OPEN_COMMAND_LINE": {
      return {
        ...state,
        commandLine: { isOpen: true, value: "" },
        focusTarget: "commandLine",
      }
    }

    case "CLOSE_COMMAND_LINE": {
      return {
        ...state,
        commandLine: { isOpen: false, value: "" },
        focusTarget: "editor",
      }
    }

    case "SET_COMMAND_LINE_VALUE": {
      return {
        ...state,
        commandLine: { ...state.commandLine, value: action.value },
      }
    }

    case "EXECUTE_COMMAND": {
      // Command execution is handled externally; this just closes the command line
      return {
        ...state,
        commandLine: { isOpen: false, value: "" },
        focusTarget: "editor",
      }
    }

    case "OPEN_PALETTE": {
      return {
        ...state,
        palette: { isOpen: true, query: "", items: [] },
        focusTarget: "palette",
      }
    }

    case "CLOSE_PALETTE": {
      return {
        ...state,
        palette: { isOpen: false, query: "", items: [] },
        focusTarget: "editor",
      }
    }

    case "SET_PALETTE_QUERY": {
      return {
        ...state,
        palette: { ...state.palette, query: action.query },
      }
    }

    case "SET_THEME": {
      const theme = defaultThemes.find(t => t.id === action.themeId)
      if (!theme) return state
      return { ...state, theme }
    }

    case "TOGGLE_THEME": {
      const currentIndex = defaultThemes.findIndex(t => t.id === state.theme.id)
      const nextIndex = (currentIndex + 1) % defaultThemes.length
      return { ...state, theme: defaultThemes[nextIndex]! }
    }

    case "OPEN_TERMINAL": {
      const id = generateTerminalId()
      const terminal: TerminalState = {
        id,
        title: "Terminal",
        cwd: state.workspace.rootPath || process.cwd(),
        isActive: true,
      }

      const newTerminals = new Map(state.terminals)
      // Deactivate other terminals
      for (const [termId, term] of newTerminals) {
        newTerminals.set(termId, { ...term, isActive: false })
      }
      newTerminals.set(id, terminal)

      return { ...state, terminals: newTerminals, focusTarget: "terminal" }
    }

    case "CLOSE_TERMINAL": {
      const newTerminals = new Map(state.terminals)
      newTerminals.delete(action.terminalId)

      // If closing active terminal, activate another or go back to editor
      const wasActive = state.terminals.get(action.terminalId)?.isActive
      let newFocus: FocusTarget = state.focusTarget

      if (wasActive) {
        if (newTerminals.size > 0) {
          const first = newTerminals.values().next().value
          if (first) {
            newTerminals.set(first.id, { ...first, isActive: true })
          }
        } else {
          newFocus = "editor"
        }
      }

      return { ...state, terminals: newTerminals, focusTarget: newFocus }
    }

    case "FOCUS_TERMINAL": {
      const newTerminals = new Map(state.terminals)
      for (const [termId, term] of newTerminals) {
        newTerminals.set(termId, {
          ...term,
          isActive: termId === action.terminalId,
        })
      }

      return { ...state, terminals: newTerminals, focusTarget: "terminal" }
    }

    case "SET_WORKSPACE": {
      return {
        ...state,
        workspace: { rootPath: action.path, directoryTree: null },
      }
    }

    case "CLOSE_ALL_TABS": {
      const pane = getActivePane(state.layout)
      if (!pane) return state

      const newLayout: PaneLayout = {
        root: updatePaneInLayout(state.layout.root, pane.id, p => ({
          ...p,
          tabs: [],
          activeTabId: null,
        })),
      }

      return {
        ...state,
        buffers: new Map(),
        layout: newLayout,
      }
    }

    case "SET_DIRECTORY_TREE": {
      return {
        ...state,
        workspace: {
          ...state.workspace,
          directoryTree: action.tree,
        },
      }
    }

    case "REFRESH_TREE": {
      // Tree refresh is handled async externally
      return state
    }

    case "TOGGLE_DIRECTORY": {
      if (!state.workspace.directoryTree) return state

      const toggleInTree = (node: DirectoryTree): DirectoryTree => {
        if (node.entry.path === action.path) {
          return { ...node, isExpanded: !node.isExpanded }
        }
        return {
          ...node,
          children: node.children.map(toggleInTree),
        }
      }

      return {
        ...state,
        workspace: {
          ...state.workspace,
          directoryTree: toggleInTree(state.workspace.directoryTree),
        },
      }
    }

    case "LOAD_DIRECTORY_CHILDREN": {
      if (!state.workspace.directoryTree) return state

      const loadChildrenInTree = (node: DirectoryTree): DirectoryTree => {
        if (node.entry.path === action.path) {
          return {
            ...node,
            children: action.children,
            isExpanded: true,
          }
        }
        return {
          ...node,
          children: node.children.map(loadChildrenInTree),
        }
      }

      return {
        ...state,
        workspace: {
          ...state.workspace,
          directoryTree: loadChildrenInTree(state.workspace.directoryTree),
        },
      }
    }

    case "SPLIT_PANE":
    case "CLOSE_PANE":
    case "RESIZE_PANE":
      // TODO: Implement pane splitting/resizing
      return state

    case "OPEN_FILE_PICKER": {
      return {
        ...state,
        filePicker: { isOpen: true, mode: action.mode ?? "file" },
      }
    }

    case "CLOSE_FILE_PICKER": {
      return {
        ...state,
        filePicker: { isOpen: false, mode: "file" },
        focusTarget: "editor",
      }
    }

    case "OPEN_THEME_PICKER": {
      return {
        ...state,
        themePicker: { isOpen: true },
      }
    }

    case "CLOSE_THEME_PICKER": {
      return {
        ...state,
        themePicker: { isOpen: false },
        focusTarget: "editor",
      }
    }

    default:
      return state
  }
}

// ============================================================================
// Language Detection
// ============================================================================

function detectLanguage(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase()

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    py: "python",
    go: "go",
    rs: "rust",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    sh: "shellscript",
    bash: "shellscript",
    zsh: "shellscript",
  }

  return ext ? (languageMap[ext] ?? null) : null
}

// ============================================================================
// Store
// ============================================================================

type Listener = (state: AppState) => void

class Store {
  private state: AppState
  private listeners: Set<Listener> = new Set()

  constructor() {
    this.state = createInitialState()
  }

  getState(): AppState {
    return this.state
  }

  dispatch(action: AppAction): void {
    this.state = appReducer(this.state, action)
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const store = new Store()
