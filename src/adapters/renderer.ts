/**
 * Renderer Adapter
 *
 * Holds reference to the CLI renderer for proper cleanup on exit.
 * The renderer manages terminal state (alternate screen, kitty keyboard, mouse).
 */

import type { CliRenderer } from "@opentui/core"

let rendererInstance: CliRenderer | null = null

/**
 * Store the renderer instance for later access (e.g., cleanup on exit)
 */
export function setRenderer(renderer: CliRenderer): void {
  rendererInstance = renderer
}

/**
 * Get the stored renderer instance
 */
export function getRenderer(): CliRenderer | null {
  return rendererInstance
}

/**
 * Properly cleanup and exit the application.
 * This ensures terminal state is restored before exiting.
 */
export async function cleanupAndExit(code: number = 0): Promise<void> {
  if (rendererInstance) {
    try {
      rendererInstance.destroy()
    } catch (error) {
      // Ignore cleanup errors, we're exiting anyway
      console.error("Cleanup error:", error)
    }
  }
  process.exit(code)
}
