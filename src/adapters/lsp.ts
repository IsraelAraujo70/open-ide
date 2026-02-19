/**
 * LSP Adapter - JSON-RPC over stdio implementation.
 *
 * This adapter starts language servers as child processes and exchanges
 * Language Server Protocol messages over stdin/stdout.
 */

import type { CompletionItem, CursorPosition, Diagnostic, HoverInfo, LspServerConfig } from "../domain/types.ts"
import type { ChildProcess, LspClient, LspPort } from "../ports/index.ts"
import { processAdapter } from "./process.ts"

interface JsonRpcError {
  code: number
  message: string
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

interface LspPosition {
  line?: unknown
  character?: unknown
}

interface LspRange {
  start?: LspPosition
  end?: LspPosition
}

interface LspPublishDiagnosticsParams {
  uri?: unknown
  diagnostics?: unknown
}

interface LspDiagnostic {
  range?: LspRange
  severity?: unknown
  message?: unknown
  source?: unknown
  code?: unknown
}

interface LspCompletionItem {
  label?: unknown
  kind?: unknown
  detail?: unknown
  documentation?: unknown
  insertText?: unknown
  sortText?: unknown
}

interface LspHoverResult {
  contents?: unknown
  range?: LspRange
}

const COMPLETION_KIND_MAP: Record<number, string> = {
  1: "text",
  2: "method",
  3: "function",
  4: "constructor",
  5: "field",
  6: "variable",
  7: "class",
  8: "interface",
  9: "module",
  10: "property",
  11: "unit",
  12: "value",
  13: "enum",
  14: "keyword",
  15: "snippet",
  16: "color",
  17: "file",
  18: "reference",
  19: "folder",
  20: "enumMember",
  21: "constant",
  22: "struct",
  23: "event",
  24: "operator",
  25: "typeParameter",
}

export class StdioLspClient implements LspClient {
  readonly language: string
  isReady: boolean = false

  private process: ChildProcess
  private nextRequestId = 1
  private pendingRequests: Map<number, PendingRequest> = new Map()
  private diagnosticsCallbacks: Set<(uri: string, diagnostics: Diagnostic[]) => void> = new Set()
  private writeQueue: Promise<void> = Promise.resolve()
  private receiveBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  private decoder = new TextDecoder()
  private encoder = new TextEncoder()
  private initialized = false
  private closed = false

  constructor(language: string, process: ChildProcess) {
    this.language = language
    this.process = process

    void this.readStdout()
    void this.readStderr()
    void this.process.exited
      .then(() => {
        this.handleProcessClosed()
      })
      .catch(() => {
        this.handleProcessClosed()
      })
  }

  async initialize(rootUri: string): Promise<void> {
    if (this.closed || this.initialized) {
      this.isReady = !this.closed
      return
    }

    const result = await this.sendRequest<unknown>(
      "initialize",
      {
        processId: this.process.pid,
        rootUri,
        capabilities: {
          textDocument: {
            publishDiagnostics: {
              relatedInformation: true,
            },
            completion: {
              completionItem: {
                snippetSupport: true,
              },
            },
          },
        },
        clientInfo: {
          name: "open-ide",
        },
      },
      15000
    )

    // If initialize succeeded, send initialized notification.
    if (result !== undefined) {
      this.sendNotification("initialized", {})
    } else {
      this.sendNotification("initialized", {})
    }

    this.initialized = true
    this.isReady = true
  }

  didOpen(uri: string, languageId: string, version: number, text: string): void {
    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    })
  }

  didChange(uri: string, version: number, text: string): void {
    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [{ text }],
    })
  }

  didClose(uri: string): void {
    this.sendNotification("textDocument/didClose", {
      textDocument: { uri },
    })
  }

  didSave(uri: string, text?: string): void {
    this.sendNotification("textDocument/didSave", {
      textDocument: { uri },
      text,
    })
  }

  async completion(uri: string, position: CursorPosition): Promise<CompletionItem[]> {
    const result = await this.sendRequest<unknown>(
      "textDocument/completion",
      {
        textDocument: { uri },
        position: {
          line: position.line,
          character: position.column,
        },
      },
      5000
    )

    return normalizeCompletionList(result)
  }

  async hover(uri: string, position: CursorPosition): Promise<HoverInfo | null> {
    const result = await this.sendRequest<unknown>(
      "textDocument/hover",
      {
        textDocument: { uri },
        position: {
          line: position.line,
          character: position.column,
        },
      },
      5000
    )

    return normalizeHoverResult(result)
  }

  getDiagnostics(_uri: string): Diagnostic[] {
    // Diagnostics are delivered via publishDiagnostics notifications.
    return []
  }

  onDiagnostics(callback: (uri: string, diagnostics: Diagnostic[]) => void): void {
    this.diagnosticsCallbacks.add(callback)
  }

  async shutdown(): Promise<void> {
    if (this.closed) {
      return
    }

    try {
      await this.sendRequest<unknown>("shutdown", null, 3000)
    } catch {
      // Ignore shutdown failures; we'll still try to exit.
    }

    this.sendNotification("exit")

    await Promise.race([this.process.exited, delay(500)])
    this.handleProcessClosed()
  }

  private async sendRequest<T>(method: string, params?: unknown, timeoutMs: number = 10000): Promise<T> {
    if (this.closed) {
      throw new Error(`[LSP:${this.language}] Client is closed`)
    }

    const id = this.nextRequestId++

    const request: Record<string, unknown> = {
      jsonrpc: "2.0",
      id,
      method,
    }

    if (params !== undefined) {
      request.params = params
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`[LSP:${this.language}] Request timeout for ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timeoutId,
      })

      this.enqueueMessage(request)
    })
  }

  private sendNotification(method: string, params?: unknown): void {
    if (this.closed) {
      return
    }

    const notification: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
    }

    if (params !== undefined) {
      notification.params = params
    }

    this.enqueueMessage(notification)
  }

  private sendErrorResponse(id: unknown, error: JsonRpcError): void {
    if (this.closed) {
      return
    }

    const message = {
      jsonrpc: "2.0",
      id,
      error,
    }

    this.enqueueMessage(message)
  }

  private enqueueMessage(message: Record<string, unknown>): void {
    const packet = encodeMessage(this.encoder, message)

    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (this.closed) {
          return
        }

        const writer = this.process.stdin.getWriter()
        try {
          await writer.write(packet)
        } finally {
          writer.releaseLock()
        }
      })
      .catch(error => {
        console.error(`[LSP:${this.language}] Failed to write message:`, error)
        this.handleProcessClosed()
      })
  }

  private async readStdout(): Promise<void> {
    const reader = this.process.stdout.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          this.consumeChunk(value)
        }
      }
    } catch (error) {
      if (!this.closed) {
        console.error(`[LSP:${this.language}] Failed to read stdout:`, error)
      }
    } finally {
      reader.releaseLock()
      this.handleProcessClosed()
    }
  }

  private async readStderr(): Promise<void> {
    const reader = this.process.stderr.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        const text = this.decoder.decode(value)
        const output = text.trim()
        if (output.length > 0) {
          console.error(`[LSP:${this.language}] ${output}`)
        }
      }
    } catch (error) {
      if (!this.closed) {
        console.error(`[LSP:${this.language}] Failed to read stderr:`, error)
      }
    } finally {
      reader.releaseLock()
    }
  }

  private consumeChunk(chunk: Uint8Array<ArrayBufferLike>): void {
    this.receiveBuffer = concatUint8Arrays(this.receiveBuffer, chunk)

    while (true) {
      const headerEnd = findHeaderEnd(this.receiveBuffer)
      if (headerEnd === -1) {
        return
      }

      const headerBytes = this.receiveBuffer.slice(0, headerEnd)
      const headerText = this.decoder.decode(headerBytes)
      const contentLength = parseContentLength(headerText)

      const bodyStart = headerEnd + 4
      if (contentLength === null) {
        // Skip invalid header and continue parsing.
        this.receiveBuffer = this.receiveBuffer.slice(bodyStart)
        continue
      }

      const bodyEnd = bodyStart + contentLength
      if (this.receiveBuffer.length < bodyEnd) {
        return
      }

      const bodyBytes = this.receiveBuffer.slice(bodyStart, bodyEnd)
      this.receiveBuffer = this.receiveBuffer.slice(bodyEnd)

      try {
        const body = this.decoder.decode(bodyBytes)
        const message = JSON.parse(body) as unknown
        this.handleMessage(message)
      } catch (error) {
        console.error(`[LSP:${this.language}] Failed to parse message:`, error)
      }
    }
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) {
      return
    }

    const hasId = "id" in message
    const hasMethod = typeof message.method === "string"
    const hasResultOrError = "result" in message || "error" in message

    if (hasId && hasResultOrError) {
      this.handleResponse(message)
      return
    }

    if (!hasMethod) {
      return
    }

    const method = message.method
    if (method === "textDocument/publishDiagnostics") {
      this.handlePublishDiagnostics(message.params)
      return
    }

    // We do not currently implement server -> client requests.
    if (hasId) {
      this.sendErrorResponse(message.id, {
        code: -32601,
        message: `Method not implemented: ${method}`,
      })
    }
  }

  private handleResponse(response: Record<string, unknown>): void {
    const id = response.id
    if (typeof id !== "number") {
      return
    }

    const pending = this.pendingRequests.get(id)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeoutId)
    this.pendingRequests.delete(id)

    if ("error" in response && isRecord(response.error)) {
      const errorMessage =
        typeof response.error.message === "string"
          ? response.error.message
          : `LSP request failed with code ${String(response.error.code)}`
      pending.reject(new Error(`[LSP:${this.language}] ${errorMessage}`))
      return
    }

    pending.resolve(response.result)
  }

  private handlePublishDiagnostics(params: unknown): void {
    const parsed = normalizePublishDiagnosticsParams(params)
    if (!parsed) {
      return
    }

    for (const callback of this.diagnosticsCallbacks) {
      callback(parsed.uri, parsed.diagnostics)
    }
  }

  private handleProcessClosed(): void {
    if (this.closed) {
      return
    }

    this.closed = true
    this.isReady = false

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId)
      pending.reject(new Error(`[LSP:${this.language}] Process closed`))
    }
    this.pendingRequests.clear()

    try {
      this.process.kill()
    } catch {
      // Process may already be dead.
    }
  }
}

export class StdioLspAdapter implements LspPort {
  private clients: Map<string, StdioLspClient> = new Map()

  async startServer(config: LspServerConfig): Promise<LspClient> {
    const existing = this.clients.get(config.language)
    if (existing) {
      return existing
    }

    const childProcess = processAdapter.spawn(config.command, config.args)
    const client = new StdioLspClient(config.language, childProcess)
    this.clients.set(config.language, client)

    void childProcess.exited
      .then(() => {
        this.removeClientIfCurrent(config.language, client)
      })
      .catch(() => {
        this.removeClientIfCurrent(config.language, client)
      })

    return client
  }

  async stopServer(language: string): Promise<void> {
    const client = this.clients.get(language)
    if (!client) {
      return
    }

    this.clients.delete(language)
    await client.shutdown()
  }

  getClient(language: string): LspClient | null {
    return this.clients.get(language) ?? null
  }

  private removeClientIfCurrent(language: string, client: StdioLspClient): void {
    const current = this.clients.get(language)
    if (current === client) {
      this.clients.delete(language)
    }
  }
}

function normalizePublishDiagnosticsParams(
  params: unknown
): { uri: string; diagnostics: Diagnostic[] } | null {
  if (!isRecord(params)) {
    return null
  }

  const data = params as LspPublishDiagnosticsParams
  if (typeof data.uri !== "string" || !Array.isArray(data.diagnostics)) {
    return null
  }

  const diagnostics = data.diagnostics
    .map(item => normalizeDiagnostic(item))
    .filter((item): item is Diagnostic => item !== null)

  return {
    uri: data.uri,
    diagnostics,
  }
}

function normalizeDiagnostic(input: unknown): Diagnostic | null {
  if (!isRecord(input)) {
    return null
  }

  const diagnostic = input as LspDiagnostic
  const range = normalizeRange(diagnostic.range)
  if (!range) {
    return null
  }

  const message = typeof diagnostic.message === "string" ? diagnostic.message : ""
  if (!message) {
    return null
  }

  const source = typeof diagnostic.source === "string" ? diagnostic.source : undefined
  const code = normalizeDiagnosticCode(diagnostic.code)

  return {
    range,
    severity: normalizeSeverity(diagnostic.severity),
    message,
    source,
    code,
  }
}

function normalizeDiagnosticCode(code: unknown): string | number | undefined {
  if (typeof code === "string" || typeof code === "number") {
    return code
  }

  if (isRecord(code) && (typeof code.value === "string" || typeof code.value === "number")) {
    return code.value
  }

  return undefined
}

function normalizeSeverity(severity: unknown): Diagnostic["severity"] {
  switch (severity) {
    case 1:
      return "error"
    case 2:
      return "warning"
    case 3:
      return "info"
    case 4:
      return "hint"
    default:
      return "error"
  }
}

function normalizeRange(range: unknown): Diagnostic["range"] | null {
  if (!isRecord(range)) {
    return null
  }

  const start = normalizePosition(range.start)
  const end = normalizePosition(range.end)
  if (!start || !end) {
    return null
  }

  return { start, end }
}

function normalizePosition(position: unknown): CursorPosition | null {
  if (!isRecord(position)) {
    return null
  }

  if (typeof position.line !== "number" || typeof position.character !== "number") {
    return null
  }

  return {
    line: position.line,
    column: position.character,
    offset: 0,
  }
}

function normalizeCompletionList(result: unknown): CompletionItem[] {
  if (Array.isArray(result)) {
    return result.map(item => normalizeCompletionItem(item)).filter((item): item is CompletionItem => item !== null)
  }

  if (isRecord(result) && Array.isArray(result.items)) {
    return result.items
      .map(item => normalizeCompletionItem(item))
      .filter((item): item is CompletionItem => item !== null)
  }

  return []
}

function normalizeCompletionItem(input: unknown): CompletionItem | null {
  if (!isRecord(input)) {
    return null
  }

  const item = input as LspCompletionItem
  if (typeof item.label !== "string" || item.label.length === 0) {
    return null
  }

  let kind = "text"
  if (typeof item.kind === "number") {
    kind = COMPLETION_KIND_MAP[item.kind] ?? "text"
  }

  return {
    label: item.label,
    kind,
    detail: typeof item.detail === "string" ? item.detail : undefined,
    documentation: normalizeDocumentation(item.documentation),
    insertText: typeof item.insertText === "string" ? item.insertText : undefined,
    sortText: typeof item.sortText === "string" ? item.sortText : undefined,
  }
}

function normalizeDocumentation(documentation: unknown): string | undefined {
  if (typeof documentation === "string") {
    return documentation
  }

  if (isRecord(documentation) && typeof documentation.value === "string") {
    return documentation.value
  }

  return undefined
}

function normalizeHoverResult(result: unknown): HoverInfo | null {
  if (!isRecord(result)) {
    return null
  }

  const hover = result as LspHoverResult
  const contents = normalizeHoverContents(hover.contents)
  if (!contents) {
    return null
  }

  return {
    contents,
    range: normalizeRange(hover.range) ?? undefined,
  }
}

function normalizeHoverContents(contents: unknown): string {
  if (typeof contents === "string") {
    return contents
  }

  if (isRecord(contents) && typeof contents.value === "string") {
    return contents.value
  }

  if (isRecord(contents) && typeof contents.language === "string" && typeof contents.value === "string") {
    return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``
  }

  if (Array.isArray(contents)) {
    const parts = contents
      .map(item => normalizeHoverContents(item))
      .filter(part => part.length > 0)
    return parts.join("\n\n")
  }

  return ""
}

function encodeMessage(
  encoder: TextEncoder,
  message: Record<string, unknown>
): Uint8Array<ArrayBufferLike> {
  const payloadBytes = encoder.encode(JSON.stringify(message))
  const headerBytes = encoder.encode(`Content-Length: ${payloadBytes.byteLength}\r\n\r\n`)
  const packet = new Uint8Array(headerBytes.length + payloadBytes.length)
  packet.set(headerBytes, 0)
  packet.set(payloadBytes, headerBytes.length)
  return packet
}

function parseContentLength(headers: string): number | null {
  const lines = headers.split("\r\n")
  for (const line of lines) {
    const separatorIndex = line.indexOf(":")
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase()
    if (key !== "content-length") {
      continue
    }

    const value = line.slice(separatorIndex + 1).trim()
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null
    }
    return parsed
  }

  return null
}

function findHeaderEnd(buffer: Uint8Array<ArrayBufferLike>): number {
  for (let i = 0; i <= buffer.length - 4; i++) {
    if (
      buffer[i] === 13 &&
      buffer[i + 1] === 10 &&
      buffer[i + 2] === 13 &&
      buffer[i + 3] === 10
    ) {
      return i
    }
  }

  return -1
}

function concatUint8Arrays(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> {
  const merged = new Uint8Array(a.length + b.length)
  merged.set(a, 0)
  merged.set(b, a.length)
  return merged
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

export const lsp = new StdioLspAdapter()
