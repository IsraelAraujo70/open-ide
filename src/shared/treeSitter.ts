/**
 * TreeSitterClient singleton for syntax highlighting
 *
 * Manages the Tree-sitter parser worker and provides
 * a single instance for the entire application.
 */

import { TreeSitterClient } from "@opentui/core"
import * as fs from "node:fs/promises"
import * as path from "node:path"

let client: TreeSitterClient | null = null
let initPromise: Promise<void> | null = null
let customParsersLoaded = false

interface ParserManifest {
  parsers: CustomParserDefinition[]
}

interface CustomParserDefinition {
  filetype: string
  wasm: string
  queries: {
    highlights: string[]
    injections?: string[]
  }
  injectionMapping?: {
    nodeTypes?: Record<string, string>
    infoStringMap?: Record<string, string>
  }
  extensions?: string[]
}

const DEFAULT_EXTENSION_TO_FILETYPE = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".zig", "zig"],

  // Extra languages supported through custom parser manifest (no fallback mapping)
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".json", "json"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".toml", "toml"],
  [".html", "html"],
  [".htm", "html"],
  [".css", "css"],
  [".scss", "scss"],
  [".less", "less"],
  [".sh", "bash"],
  [".bash", "bash"],
  [".zsh", "bash"],
])

const extensionToFiletype = new Map<string, string>(DEFAULT_EXTENSION_TO_FILETYPE)

/**
 * Get the TreeSitterClient singleton instance.
 * Creates and initializes it on first call.
 */
export function getTreeSitter(): TreeSitterClient {
  if (!client) {
    const dataPath = path.join(process.cwd(), ".opentui-data")
    client = new TreeSitterClient({ dataPath })
  }
  return client
}

/**
 * Initialize the TreeSitterClient.
 * Safe to call multiple times - will only initialize once.
 */
export async function initTreeSitter(): Promise<void> {
  if (initPromise) {
    return initPromise
  }

  const ts = getTreeSitter()
  initPromise = (async () => {
    await ts.initialize()
    await registerCustomParsers(ts)
  })().catch(error => {
    initPromise = null
    throw error
  })

  return initPromise
}

/**
 * Check if TreeSitterClient is initialized
 */
export function isTreeSitterReady(): boolean {
  return client?.isInitialized() ?? false
}

/**
 * Map file extension to Tree-sitter filetype
 * No fallback: each extension maps to exactly one filetype.
 * If that filetype has no registered parser, syntax highlighting is disabled.
 */
export function getFiletype(filePath: string): string | null {
  const ext = normalizeExtension(path.extname(filePath))
  if (!ext) {
    return null
  }

  return extensionToFiletype.get(ext) ?? null
}

/**
 * Cleanup the TreeSitterClient
 */
export async function destroyTreeSitter(): Promise<void> {
  if (client) {
    await client.destroy()
    client = null
    initPromise = null
    customParsersLoaded = false
    resetExtensionMap()
  }
}

function resetExtensionMap(): void {
  extensionToFiletype.clear()
  for (const [ext, filetype] of DEFAULT_EXTENSION_TO_FILETYPE) {
    extensionToFiletype.set(ext, filetype)
  }
}

function normalizeExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase()
  if (!normalized) {
    return ""
  }

  return normalized.startsWith(".") ? normalized : `.${normalized}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  )
}

function isUrl(assetPath: string): boolean {
  return /^https?:\/\//.test(assetPath) || assetPath.startsWith("file://")
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  )

  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries)
}

function resolveAssetPath(assetPath: string, manifestDir: string): string {
  if (isUrl(assetPath) || path.isAbsolute(assetPath)) {
    return assetPath
  }

  return path.resolve(manifestDir, assetPath)
}

function normalizeParserDefinition(value: unknown): CustomParserDefinition | null {
  if (!isRecord(value)) {
    return null
  }

  const filetype = typeof value.filetype === "string" ? value.filetype.trim() : ""
  const wasm = typeof value.wasm === "string" ? value.wasm.trim() : ""

  if (!filetype || !wasm) {
    return null
  }

  if (!isRecord(value.queries) || !Array.isArray(value.queries.highlights)) {
    return null
  }

  const highlights = value.queries.highlights
    .filter((queryPath): queryPath is string => typeof queryPath === "string")
    .map(queryPath => queryPath.trim())
    .filter(queryPath => queryPath.length > 0)

  if (highlights.length === 0) {
    return null
  }

  const injections = Array.isArray(value.queries.injections)
    ? value.queries.injections
        .filter((queryPath): queryPath is string => typeof queryPath === "string")
        .map(queryPath => queryPath.trim())
        .filter(queryPath => queryPath.length > 0)
    : undefined

  const extensions = Array.isArray(value.extensions)
    ? value.extensions
        .filter((ext): ext is string => typeof ext === "string")
        .map(ext => normalizeExtension(ext))
        .filter(ext => ext.length > 0)
    : undefined

  const injectionMapping = isRecord(value.injectionMapping)
    ? {
        nodeTypes: toStringRecord(value.injectionMapping.nodeTypes),
        infoStringMap: toStringRecord(value.injectionMapping.infoStringMap),
      }
    : undefined

  return {
    filetype,
    wasm,
    queries: {
      highlights,
      injections,
    },
    injectionMapping,
    extensions,
  }
}

function parseParserManifest(raw: string): ParserManifest {
  const parsed: unknown = JSON.parse(raw)

  if (!isRecord(parsed) || !Array.isArray(parsed.parsers)) {
    return { parsers: [] }
  }

  const parsers = parsed.parsers
    .map(normalizeParserDefinition)
    .filter((parser): parser is CustomParserDefinition => parser !== null)

  return { parsers }
}

async function registerCustomParsers(ts: TreeSitterClient): Promise<void> {
  if (customParsersLoaded) {
    return
  }

  customParsersLoaded = true

  const envManifestPath = process.env.OPEN_IDE_PARSERS_FILE?.trim()
  const manifestPath = envManifestPath
    ? path.resolve(envManifestPath)
    : path.join(process.cwd(), ".open-ide", "parsers.json")

  let rawManifest: string
  try {
    rawManifest = await fs.readFile(manifestPath, "utf8")
  } catch (error) {
    if (isNotFoundError(error)) {
      return
    }

    console.error("[TreeSitter] Failed to read parser manifest:", error)
    return
  }

  let manifest: ParserManifest
  try {
    manifest = parseParserManifest(rawManifest)
  } catch (error) {
    console.error("[TreeSitter] Failed to parse parser manifest JSON:", error)
    return
  }

  if (manifest.parsers.length === 0) {
    return
  }

  const manifestDir = path.dirname(manifestPath)

  for (const parser of manifest.parsers) {
    ts.addFiletypeParser({
      filetype: parser.filetype,
      wasm: resolveAssetPath(parser.wasm, manifestDir),
      queries: {
        highlights: parser.queries.highlights.map(queryPath =>
          resolveAssetPath(queryPath, manifestDir)
        ),
        injections: parser.queries.injections?.map(queryPath =>
          resolveAssetPath(queryPath, manifestDir)
        ),
      },
      injectionMapping: parser.injectionMapping,
    })

    for (const extension of parser.extensions ?? []) {
      extensionToFiletype.set(extension, parser.filetype)
    }
  }
}
