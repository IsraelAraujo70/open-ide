/**
 * LSP Runtime
 *
 * Watches application state transitions and keeps LSP servers/documents in sync:
 * - didOpen when a file-backed buffer appears
 * - didChange (debounced) when content changes
 * - didSave when dirty flag transitions true -> false
 * - didClose when buffer is removed
 */

import { pathToFileURL } from "node:url"
import type { AppAction, AppState, BufferState, LspServerConfig } from "../domain/types.ts"
import type { LspClient } from "../ports/index.ts"
import { defaultSettings } from "../ports/index.ts"
import { lsp, settings } from "../adapters/index.ts"
import { store } from "./store.ts"

const DID_CHANGE_DEBOUNCE_MS = 200

const SERVER_LANGUAGE_ALIASES: Record<string, string> = {
  javascript: "typescript",
  javascriptreact: "typescript",
  typescriptreact: "typescript",
}

interface TrackedDocument {
  bufferId: string
  uri: string
  serverLanguage: string
  languageId: string
  content: string
  version: number
  opened: boolean
  openPromise: Promise<void> | null
}

class LspRuntime {
  private started = false
  private unsubscribe: (() => void) | null = null
  private previousState: AppState = store.getState()
  private configs: Map<string, LspServerConfig> = new Map()
  private documents: Map<string, TrackedDocument> = new Map()
  private uriToBufferId: Map<string, string> = new Map()
  private changeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private initializingClients: Map<string, Promise<LspClient | null>> = new Map()
  private initializedLanguages: Set<string> = new Set()
  private diagnosticsBoundLanguages: Set<string> = new Set()
  private activeLanguages: Set<string> = new Set()
  private internalDispatchInProgress = false

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    let lspServers = defaultSettings.lspServers
    try {
      const loadedSettings = await settings.load()
      lspServers = loadedSettings.lspServers
    } catch (error) {
      console.error("[LSP runtime] Failed to load settings, using defaults:", error)
    }

    this.setServerConfigs(lspServers)

    this.previousState = store.getState()
    this.unsubscribe = store.subscribe(nextState => {
      if (!this.started) {
        this.previousState = nextState
        return
      }

      if (this.internalDispatchInProgress) {
        this.previousState = nextState
        return
      }

      const previousState = this.previousState
      this.previousState = nextState
      this.processStateTransition(previousState, nextState)
    })

    this.started = true
    this.syncAllBuffers(this.previousState, this.getWorkspaceRoot(this.previousState))
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false

    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    for (const timer of this.changeTimers.values()) {
      clearTimeout(timer)
    }
    this.changeTimers.clear()

    const trackedBufferIds = Array.from(this.documents.keys())
    for (const bufferId of trackedBufferIds) {
      this.closeDocument(bufferId)
    }

    await this.stopAllServers()

    this.documents.clear()
    this.uriToBufferId.clear()
    this.initializingClients.clear()
    this.initializedLanguages.clear()
    this.diagnosticsBoundLanguages.clear()
    this.activeLanguages.clear()
  }

  private processStateTransition(previousState: AppState, nextState: AppState): void {
    const previousRoot = this.getWorkspaceRoot(previousState)
    const nextRoot = this.getWorkspaceRoot(nextState)

    if (previousRoot !== nextRoot) {
      this.handleWorkspaceChange(nextState, nextRoot)
      return
    }

    const previousBufferIds = new Set(previousState.buffers.keys())
    const nextBufferIds = new Set(nextState.buffers.keys())

    for (const bufferId of previousBufferIds) {
      if (!nextBufferIds.has(bufferId)) {
        this.closeDocument(bufferId)
      }
    }

    for (const [bufferId, nextBuffer] of nextState.buffers) {
      const previousBuffer = previousState.buffers.get(bufferId)
      this.syncBuffer(nextBuffer, previousBuffer ?? null, nextRoot)
    }
  }

  private handleWorkspaceChange(nextState: AppState, nextRoot: string): void {
    for (const timer of this.changeTimers.values()) {
      clearTimeout(timer)
    }
    this.changeTimers.clear()

    const trackedBufferIds = Array.from(this.documents.keys())
    for (const bufferId of trackedBufferIds) {
      this.closeDocument(bufferId)
    }

    this.documents.clear()
    this.uriToBufferId.clear()

    void this.stopAllServers().finally(() => {
      this.dispatchInternal({ type: "CLEAR_ALL_DIAGNOSTICS" })
      this.syncAllBuffers(nextState, nextRoot)
    })
  }

  private syncAllBuffers(state: AppState, workspaceRoot: string): void {
    for (const buffer of state.buffers.values()) {
      this.syncBuffer(buffer, null, workspaceRoot)
    }
  }

  private syncBuffer(nextBuffer: BufferState, previousBuffer: BufferState | null, workspaceRoot: string): void {
    const metadata = this.getDocumentMetadata(nextBuffer)
    const tracked = this.documents.get(nextBuffer.id)

    if (!metadata) {
      if (tracked) {
        this.closeDocument(nextBuffer.id)
      }
      return
    }

    const documentChanged =
      !tracked ||
      tracked.uri !== metadata.uri ||
      tracked.serverLanguage !== metadata.serverLanguage ||
      tracked.languageId !== metadata.languageId

    if (documentChanged) {
      if (tracked) {
        this.closeDocument(nextBuffer.id)
      }
      this.openDocument(nextBuffer, metadata.uri, metadata.serverLanguage, metadata.languageId, workspaceRoot)
    } else if (tracked) {
      tracked.content = nextBuffer.content
    }

    if (previousBuffer && previousBuffer.content !== nextBuffer.content) {
      this.scheduleDidChange(nextBuffer.id)
    }

    if (previousBuffer && previousBuffer.isDirty && !nextBuffer.isDirty) {
      this.sendDidSave(nextBuffer.id)
    }
  }

  private openDocument(
    buffer: BufferState,
    uri: string,
    serverLanguage: string,
    languageId: string,
    workspaceRoot: string
  ): void {
    const document: TrackedDocument = {
      bufferId: buffer.id,
      uri,
      serverLanguage,
      languageId,
      content: buffer.content,
      version: 1,
      opened: false,
      openPromise: null,
    }

    this.documents.set(buffer.id, document)
    this.uriToBufferId.set(uri, buffer.id)

    const openPromise = this.ensureClient(serverLanguage, workspaceRoot)
      .then(client => {
        if (!client) {
          return
        }

        const current = this.documents.get(buffer.id)
        if (!current || current.uri !== uri) {
          return
        }

        client.didOpen(current.uri, current.languageId, current.version, current.content)
        current.opened = true
      })
      .catch(error => {
        console.error(`[LSP runtime] Failed to open document ${uri}:`, error)
      })

    document.openPromise = openPromise
  }

  private closeDocument(bufferId: string): void {
    const timer = this.changeTimers.get(bufferId)
    if (timer) {
      clearTimeout(timer)
      this.changeTimers.delete(bufferId)
    }

    const tracked = this.documents.get(bufferId)
    if (!tracked) {
      return
    }

    this.documents.delete(bufferId)
    this.uriToBufferId.delete(tracked.uri)

    const closeTask = async () => {
      try {
        if (tracked.openPromise) {
          await tracked.openPromise
        }
      } catch {
        // Ignore open errors during close.
      }

      const client = lsp.getClient(tracked.serverLanguage)
      if (!client || !client.isReady || !tracked.opened) {
        return
      }

      client.didClose(tracked.uri)
    }

    void closeTask().catch(error => {
      console.error(`[LSP runtime] Failed to close document ${tracked.uri}:`, error)
    })

    this.dispatchInternal({ type: "CLEAR_BUFFER_DIAGNOSTICS", bufferId })
  }

  private scheduleDidChange(bufferId: string): void {
    const existing = this.changeTimers.get(bufferId)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      this.changeTimers.delete(bufferId)
      this.sendDidChange(bufferId)
    }, DID_CHANGE_DEBOUNCE_MS)

    this.changeTimers.set(bufferId, timer)
  }

  private sendDidChange(bufferId: string): void {
    const task = async () => {
      const tracked = this.documents.get(bufferId)
      if (!tracked) {
        return
      }

      if (tracked.openPromise) {
        await tracked.openPromise
      }

      const current = this.documents.get(bufferId)
      if (!current || !current.opened) {
        return
      }

      const client = lsp.getClient(current.serverLanguage)
      if (!client || !client.isReady) {
        return
      }

      current.version += 1
      client.didChange(current.uri, current.version, current.content)
    }

    void task().catch(error => {
      console.error(`[LSP runtime] Failed to send didChange for ${bufferId}:`, error)
    })
  }

  private sendDidSave(bufferId: string): void {
    const task = async () => {
      const tracked = this.documents.get(bufferId)
      if (!tracked) {
        return
      }

      if (tracked.openPromise) {
        await tracked.openPromise
      }

      const current = this.documents.get(bufferId)
      if (!current || !current.opened) {
        return
      }

      const client = lsp.getClient(current.serverLanguage)
      if (!client || !client.isReady) {
        return
      }

      client.didSave(current.uri, current.content)
    }

    void task().catch(error => {
      console.error(`[LSP runtime] Failed to send didSave for ${bufferId}:`, error)
    })
  }

  private async ensureClient(serverLanguage: string, workspaceRoot: string): Promise<LspClient | null> {
    const inFlight = this.initializingClients.get(serverLanguage)
    if (inFlight) {
      return inFlight
    }

    const promise = (async () => {
      const config = this.configs.get(serverLanguage)
      if (!config) {
        return null
      }

      let client = lsp.getClient(serverLanguage)
      if (!client) {
        client = await this.startServerWithFallback(serverLanguage, config)
        if (!client) {
          return null
        }
      }

      if (!this.diagnosticsBoundLanguages.has(serverLanguage)) {
        client.onDiagnostics((uri, diagnostics) => {
          const bufferId = this.uriToBufferId.get(uri)
          if (!bufferId) {
            return
          }

          this.dispatchInternal({
            type: "SET_BUFFER_DIAGNOSTICS",
            bufferId,
            diagnostics,
          })
        })
        this.diagnosticsBoundLanguages.add(serverLanguage)
      }

      if (!this.initializedLanguages.has(serverLanguage)) {
        try {
          await client.initialize(pathToFileURL(workspaceRoot).toString())
          this.initializedLanguages.add(serverLanguage)
        } catch (error) {
          console.error(`[LSP runtime] Failed to initialize server for ${serverLanguage}:`, error)
          try {
            await lsp.stopServer(serverLanguage)
          } catch {
            // Ignore stop errors after failed init.
          }
          this.diagnosticsBoundLanguages.delete(serverLanguage)
          this.initializedLanguages.delete(serverLanguage)
          return null
        }
      }

      this.activeLanguages.add(serverLanguage)
      return client
    })()

    this.initializingClients.set(serverLanguage, promise)
    void promise.finally(() => {
      this.initializingClients.delete(serverLanguage)
    })

    return promise
  }

  private async startServerWithFallback(
    serverLanguage: string,
    config: LspServerConfig
  ): Promise<LspClient | null> {
    try {
      return await lsp.startServer(config)
    } catch (error) {
      if (serverLanguage !== "typescript" || config.command === "bunx") {
        console.error(`[LSP runtime] Failed to start server for ${serverLanguage}:`, error)
        return null
      }

      const fallbackConfig: LspServerConfig = {
        language: config.language,
        command: "bunx",
        args: ["typescript-language-server", "--stdio"],
        rootUri: config.rootUri,
      }

      try {
        console.error(
          `[LSP runtime] Falling back to bunx for ${serverLanguage} language server startup`
        )
        return await lsp.startServer(fallbackConfig)
      } catch (fallbackError) {
        console.error(`[LSP runtime] Failed to start fallback server for ${serverLanguage}:`, fallbackError)
        return null
      }
    }
  }

  private async stopAllServers(): Promise<void> {
    const languages = Array.from(this.activeLanguages)
    this.activeLanguages.clear()
    this.initializedLanguages.clear()
    this.diagnosticsBoundLanguages.clear()

    for (const language of languages) {
      try {
        await lsp.stopServer(language)
      } catch (error) {
        console.error(`[LSP runtime] Failed to stop server for ${language}:`, error)
      }
    }
  }

  private setServerConfigs(serverConfigs: Record<string, LspServerConfig>): void {
    this.configs.clear()

    for (const [key, config] of Object.entries(serverConfigs)) {
      const language = (config.language || key).trim()
      if (!language) {
        continue
      }

      const normalizedConfig: LspServerConfig = {
        language,
        command: config.command,
        args: config.args,
        rootUri: config.rootUri,
      }

      this.configs.set(language, normalizedConfig)
      this.configs.set(key, normalizedConfig)
    }
  }

  private getWorkspaceRoot(state: AppState): string {
    return state.workspace.rootPath ?? process.cwd()
  }

  private getDocumentMetadata(
    buffer: BufferState
  ): { uri: string; serverLanguage: string; languageId: string } | null {
    if (!buffer.filePath || !buffer.language) {
      return null
    }

    const serverLanguage = this.resolveServerLanguage(buffer.language)
    if (!serverLanguage) {
      return null
    }

    return {
      uri: pathToFileURL(buffer.filePath).toString(),
      serverLanguage,
      languageId: buffer.language,
    }
  }

  private resolveServerLanguage(bufferLanguage: string): string | null {
    if (this.configs.has(bufferLanguage)) {
      const config = this.configs.get(bufferLanguage)
      return config?.language ?? bufferLanguage
    }

    const alias = SERVER_LANGUAGE_ALIASES[bufferLanguage]
    if (!alias) {
      return null
    }

    if (!this.configs.has(alias)) {
      return null
    }

    const config = this.configs.get(alias)
    return config?.language ?? alias
  }

  private dispatchInternal(action: AppAction): void {
    this.internalDispatchInProgress = true
    try {
      store.dispatch(action)
      this.previousState = store.getState()
    } finally {
      this.internalDispatchInProgress = false
    }
  }
}

const runtime = new LspRuntime()

export async function initializeLspRuntime(): Promise<void> {
  await runtime.start()
}

export async function shutdownLspRuntime(): Promise<void> {
  await runtime.stop()
}
