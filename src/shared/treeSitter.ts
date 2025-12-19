/**
 * TreeSitterClient singleton for syntax highlighting
 * 
 * Manages the Tree-sitter parser worker and provides
 * a single instance for the entire application.
 */

import { TreeSitterClient } from "@opentui/core"
import * as path from "node:path"

let client: TreeSitterClient | null = null
let initPromise: Promise<void> | null = null

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
  initPromise = ts.initialize()
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
 * OpenTUI has built-in parsers for: javascript, typescript, markdown, zig
 */
export function getFiletype(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  
  const extMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",  // TSX uses typescript parser
    ".js": "javascript",
    ".jsx": "javascript",  // JSX uses javascript parser
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".md": "markdown",
    ".markdown": "markdown",
    ".zig": "zig",
  }
  
  return extMap[ext] ?? null
}

/**
 * Cleanup the TreeSitterClient
 */
export async function destroyTreeSitter(): Promise<void> {
  if (client) {
    await client.destroy()
    client = null
    initPromise = null
  }
}
