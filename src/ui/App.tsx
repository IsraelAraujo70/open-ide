/**
 * Main App Component - Root layout for Open IDE
 */

import { useEffect } from "react"
import { useTerminalDimensions } from "@opentui/react"
import { useStore } from "./hooks/useStore.ts"
import { StatusBar } from "./components/StatusBar"
import { TabBar } from "./components/TabBar"
import { Explorer } from "./components/Explorer"
import { ResizeHandle } from "./components/ResizeHandle"
import { Editor } from "./components/Editor"
import { CommandLine } from "./components/CommandLine"
import { Palette } from "./components/Palette"
import { FilePicker } from "./components/FilePicker"
import { ThemePicker } from "./components/ThemePicker"
import { useKeybindings } from "./hooks/useKeybindings.ts"
import { commandRegistry, parseAndExecuteCommand } from "../application/commands.ts"
import { fileSystem } from "../adapters/index.ts"

export function App() {
  const { width, height } = useTerminalDimensions()
  const [state, dispatch] = useStore()

  // Initialize global keybindings
  useKeybindings()

  // Auto-load current directory on startup
  useEffect(() => {
    const loadWorkspace = async () => {
      const cwd = process.cwd()
      dispatch({ type: "SET_WORKSPACE", path: cwd })

      try {
        const tree = await fileSystem.buildTree(cwd, 2)
        dispatch({ type: "SET_DIRECTORY_TREE", tree })
      } catch (error) {
        console.error("Failed to load workspace:", error)
      }
    }

    loadWorkspace()
  }, [])

  // Calculate layout dimensions
  const resizeHandleWidth = state.explorerVisible ? 2 : 0
  const minExplorerWidth = 8
  const editorMinWidth = 20
  const maxExplorerWidth = Math.max(minExplorerWidth, width - resizeHandleWidth - editorMinWidth)
  const explorerWidth = state.explorerVisible
    ? Math.max(minExplorerWidth, Math.min(maxExplorerWidth, state.explorerWidth))
    : 0

  const statusBarHeight = 1
  const tabBarHeight = 1
  const terminalHeight =
    state.terminals.size > 0 ? Math.floor((height - statusBarHeight - tabBarHeight) * 0.3) : 0
  const editorHeight = height - statusBarHeight - tabBarHeight - terminalHeight
  const editorWidth = Math.max(0, width - explorerWidth - resizeHandleWidth)

  const handleExplorerResize = (nextWidth: number) => {
    const clampedWidth = Math.max(minExplorerWidth, Math.min(maxExplorerWidth, nextWidth))
    dispatch({ type: "SET_EXPLORER_WIDTH", width: clampedWidth })
  }

  // Get active buffer for the editor
  const activePane = getActivePane(state.layout)
  const activeTab = activePane?.tabs.find(t => t.isActive)
  const activeBuffer = activeTab ? (state.buffers.get(activeTab.bufferId) ?? null) : null

  return (
    <box
      width={width}
      height={height}
      flexDirection="column"
      backgroundColor={state.theme.colors.background}
    >
      {/* Tab Bar */}
      <TabBar
        tabs={activePane?.tabs ?? []}
        activeTabId={activePane?.activeTabId ?? null}
        theme={state.theme}
        width={width}
      />

      {/* Main Content Area */}
      <box flexDirection="row" flexGrow={1}>
        {/* File Explorer */}
        {state.explorerVisible && (
          <Explorer
            width={explorerWidth}
            height={editorHeight}
            directoryTree={state.workspace.directoryTree}
            rootPath={state.workspace.rootPath}
            theme={state.theme}
            focused={state.focusTarget === "explorer"}
          />
        )}

        {state.explorerVisible && (
          <ResizeHandle
            height={editorHeight}
            theme={state.theme}
            explorerWidth={explorerWidth}
            onResize={handleExplorerResize}
          />
        )}

        {/* Editor Area */}
        <box flexDirection="column" flexGrow={1}>
          <Editor
            buffer={activeBuffer}
            theme={state.theme}
            width={editorWidth}
            height={editorHeight}
            focused={state.focusTarget === "editor"}
          />

          {/* Terminal Area (when visible) */}
          {state.terminals.size > 0 && (
            <box
              height={terminalHeight}
              backgroundColor={state.theme.colors.background}
              borderStyle="single"
              border={["top"]}
              borderColor={state.theme.colors.border}
            >
              <text fg={state.theme.colors.foreground}>Terminal (PTY integration pending)</text>
            </box>
          )}
        </box>
      </box>

      {/* Status Bar */}
      <StatusBar
        theme={state.theme}
        width={width}
        buffer={activeBuffer}
        focusTarget={state.focusTarget}
        editorMode={state.editorMode}
      />

      {/* Command Line Overlay */}
      {state.commandLine.isOpen && (
        <CommandLine
          value={state.commandLine.value}
          theme={state.theme}
          width={width}
          onSubmit={(cmd: string) => {
            parseAndExecuteCommand(cmd)
            dispatch({ type: "CLOSE_COMMAND_LINE" })
          }}
          onCancel={() => dispatch({ type: "CLOSE_COMMAND_LINE" })}
          onChange={(value: string) => dispatch({ type: "SET_COMMAND_LINE_VALUE", value })}
        />
      )}

      {/* Command Palette Overlay */}
      {state.palette.isOpen && (
        <Palette
          query={state.palette.query}
          items={state.palette.items}
          theme={state.theme}
          width={Math.min(60, width - 4)}
          height={Math.min(20, height - 4)}
          onClose={() => dispatch({ type: "CLOSE_PALETTE" })}
          onQueryChange={(query: string) => dispatch({ type: "SET_PALETTE_QUERY", query })}
        />
      )}

      {/* File Picker Overlay */}
      {state.filePicker.isOpen && (
        <FilePicker
          theme={state.theme}
          width={Math.min(60, width - 4)}
          height={Math.min(20, height - 4)}
          initialPath={state.workspace.rootPath || process.cwd()}
          mode={state.filePicker.mode}
          onSelect={async (path: string) => {
            dispatch({ type: "CLOSE_FILE_PICKER" })
            if (state.filePicker.mode === "project") {
              // Close all tabs and switch workspace
              dispatch({ type: "CLOSE_ALL_TABS" })
              dispatch({ type: "SET_WORKSPACE", path })
              // Reload directory tree
              try {
                const tree = await fileSystem.buildTree(path, 2)
                dispatch({ type: "SET_DIRECTORY_TREE", tree })
              } catch (error) {
                console.error("Failed to load workspace:", error)
              }
            } else {
              void commandRegistry.execute("file.open", { args: [path] })
            }
          }}
          onCancel={() => dispatch({ type: "CLOSE_FILE_PICKER" })}
        />
      )}

      {/* Theme Picker Overlay */}
      {state.themePicker.isOpen && (
        <ThemePicker
          currentTheme={state.theme}
          width={Math.min(50, width - 4)}
          height={Math.min(16, height - 4)}
          onSelect={(themeId: string) => {
            dispatch({ type: "CLOSE_THEME_PICKER" })
            dispatch({ type: "SET_THEME", themeId })
          }}
          onCancel={() => dispatch({ type: "CLOSE_THEME_PICKER" })}
        />
      )}
    </box>
  )
}

// Helper to get the active pane from layout
function getActivePane(layout: import("../domain/types.ts").PaneLayout) {
  const findPane = (
    node: import("../domain/types.ts").PaneLayout["root"]
  ): import("../domain/types.ts").Pane | null => {
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
