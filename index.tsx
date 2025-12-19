/**
 * OpenCode IDE - Entry Point
 *
 * Terminal-based IDE built with OpenTUI (React for terminal)
 */

import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./src/ui/App"
import { setRenderer, cleanupAndExit } from "./src/adapters/renderer.ts"

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // We handle Ctrl+C ourselves
    useMouse: true,
    useAlternateScreen: true,
    useKittyKeyboard: { events: true },
  })

  // Store renderer reference for cleanup on exit
  setRenderer(renderer)

  // Handle process signals for proper cleanup
  const handleExit = () => {
    renderer.destroy()
    process.exit(0)
  }
  process.on("SIGINT", handleExit)
  process.on("SIGTERM", handleExit)

  const root = createRoot(renderer)
  root.render(<App />)
}

main().catch(error => {
  console.error(error)
  cleanupAndExit(1)
})
