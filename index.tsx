/**
 * OpenCode IDE - Entry Point
 * 
 * Terminal-based IDE built with OpenTUI (React for terminal)
 */

import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./src/ui/App"

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // We handle Ctrl+C ourselves
    useMouse: true,
    useAlternateScreen: true,
    useKittyKeyboard: { events: true },
  })

  const root = createRoot(renderer)
  root.render(<App />)
}

main().catch(console.error)
