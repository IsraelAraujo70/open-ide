/**
 * Ports - Interfaces that define how the application layer communicates
 * with the outside world (file system, clipboard, processes, LSP, settings)
 *
 * These are contracts that adapters must implement.
 */

import type {
  FileEntry,
  DirectoryTree,
  LspServerConfig,
  Diagnostic,
  CompletionItem,
  HoverInfo,
  CursorPosition,
  Keybinding,
} from "../domain/types.ts"

// ============================================================================
// FileSystemPort
// ============================================================================

export interface FileSystemPort {
  /**
   * Read file contents as string
   */
  readFile(path: string): Promise<string>

  /**
   * Write content to file
   */
  writeFile(path: string, content: string): Promise<void>

  /**
   * List directory contents
   */
  listDirectory(path: string): Promise<FileEntry[]>

  /**
   * Build a directory tree recursively (with depth limit)
   */
  buildTree(path: string, depth?: number): Promise<DirectoryTree>

  /**
   * Check if path exists
   */
  exists(path: string): Promise<boolean>

  /**
   * Check if path is a directory
   */
  isDirectory(path: string): Promise<boolean>

  /**
   * Watch for file/directory changes
   */
  watch(path: string, callback: (event: FileWatchEvent) => void): FileWatcher

  /**
   * Get file stats
   */
  stat(path: string): Promise<FileStat>

  /**
   * Create directory (recursive)
   */
  mkdir(path: string): Promise<void>

  /**
   * Delete file or directory
   */
  remove(path: string): Promise<void>

  /**
   * Rename/move file or directory
   */
  rename(oldPath: string, newPath: string): Promise<void>
}

export interface FileWatchEvent {
  type: "create" | "modify" | "delete" | "rename"
  path: string
}

export interface FileWatcher {
  close(): void
}

export interface FileStat {
  size: number
  modifiedAt: Date
  createdAt: Date
  isDirectory: boolean
  isFile: boolean
}

// ============================================================================
// ClipboardPort
// ============================================================================

export interface ClipboardPort {
  /**
   * Read text from clipboard
   */
  readText(): Promise<string>

  /**
   * Write text to clipboard
   */
  writeText(text: string): Promise<void>
}

// ============================================================================
// ProcessPort (for running commands and PTY)
// ============================================================================

export interface ProcessPort {
  /**
   * Spawn a simple process (non-interactive)
   */
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess

  /**
   * Spawn a PTY (pseudo-terminal) for interactive sessions
   */
  spawnPty(command: string, args: string[], options?: PtyOptions): PtyProcess
}

export interface SpawnOptions {
  cwd?: string
  env?: Record<string, string>
}

export interface PtyOptions extends SpawnOptions {
  cols?: number
  rows?: number
}

export interface ChildProcess {
  readonly pid: number
  readonly stdin: WritableStream<Uint8Array>
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly exited: Promise<number>
  kill(signal?: number): void
}

export interface PtyProcess {
  readonly pid: number

  /**
   * Write data to PTY stdin
   */
  write(data: string): void

  /**
   * Read data from PTY stdout
   */
  onData(callback: (data: string) => void): void

  /**
   * Called when PTY exits
   */
  onExit(callback: (code: number) => void): void

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void

  /**
   * Kill the PTY process
   */
  kill(): void
}

// ============================================================================
// LspPort
// ============================================================================

export interface LspPort {
  /**
   * Start an LSP server for a language
   */
  startServer(config: LspServerConfig): Promise<LspClient>

  /**
   * Stop an LSP server
   */
  stopServer(language: string): Promise<void>

  /**
   * Get active client for a language
   */
  getClient(language: string): LspClient | null
}

export interface LspClient {
  readonly language: string
  readonly isReady: boolean

  /**
   * Initialize the server with workspace root
   */
  initialize(rootUri: string): Promise<void>

  /**
   * Notify server of document open
   */
  didOpen(uri: string, languageId: string, version: number, text: string): void

  /**
   * Notify server of document change
   */
  didChange(uri: string, version: number, text: string): void

  /**
   * Notify server of document close
   */
  didClose(uri: string): void

  /**
   * Notify server of document save
   */
  didSave(uri: string, text?: string): void

  /**
   * Get completions at position
   */
  completion(uri: string, position: CursorPosition): Promise<CompletionItem[]>

  /**
   * Get hover info at position
   */
  hover(uri: string, position: CursorPosition): Promise<HoverInfo | null>

  /**
   * Get diagnostics for document
   */
  getDiagnostics(uri: string): Diagnostic[]

  /**
   * Listen for diagnostics updates
   */
  onDiagnostics(callback: (uri: string, diagnostics: Diagnostic[]) => void): void

  /**
   * Shutdown the client
   */
  shutdown(): Promise<void>
}

// ============================================================================
// SettingsPort
// ============================================================================

export interface SettingsPort {
  /**
   * Load settings from persistent storage
   */
  load(): Promise<Settings>

  /**
   * Save settings to persistent storage
   */
  save(settings: Settings): Promise<void>

  /**
   * Get a specific setting value
   */
  get<K extends keyof Settings>(key: K): Promise<Settings[K]>

  /**
   * Set a specific setting value
   */
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
}

export interface Settings {
  theme: string
  fontSize: number
  fontFamily: string
  tabSize: number
  insertSpaces: boolean
  wordWrap: "none" | "char" | "word"
  lineNumbers: boolean
  relativeLine: boolean
  cursorStyle: "block" | "line" | "underline"
  cursorBlink: boolean
  keybindings: Keybinding[]
  recentWorkspaces: string[]
  lspServers: Record<string, LspServerConfig>
}

export const defaultSettings: Settings = {
  theme: "tokyo-night",
  fontSize: 14,
  fontFamily: "monospace",
  tabSize: 2,
  insertSpaces: true,
  wordWrap: "word",
  lineNumbers: true,
  relativeLine: false,
  cursorStyle: "block",
  cursorBlink: true,
  keybindings: [],
  recentWorkspaces: [],
  lspServers: {
    typescript: {
      language: "typescript",
      command: "typescript-language-server",
      args: ["--stdio"],
    },
    python: {
      language: "python",
      command: "pylsp",
      args: [],
    },
    go: {
      language: "go",
      command: "gopls",
      args: [],
    },
  },
}
