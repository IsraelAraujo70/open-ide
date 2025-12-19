/**
 * Clipboard Adapter - Uses OSC 52 escape sequences for terminal clipboard
 * Falls back to system commands if available
 */

import type { ClipboardPort } from "../ports/index.ts"

export class TerminalClipboardAdapter implements ClipboardPort {
  async readText(): Promise<string> {
    // Try xclip/xsel on Linux, pbpaste on macOS
    const platform = process.platform

    try {
      if (platform === "darwin") {
        const proc = Bun.spawn(["pbpaste"])
        const text = await new Response(proc.stdout).text()
        return text
      } else if (platform === "linux") {
        // Try xclip first, then xsel
        try {
          const proc = Bun.spawn(["xclip", "-selection", "clipboard", "-o"])
          const text = await new Response(proc.stdout).text()
          return text
        } catch {
          const proc = Bun.spawn(["xsel", "--clipboard", "--output"])
          const text = await new Response(proc.stdout).text()
          return text
        }
      }
    } catch {
      // Clipboard not available
    }

    return ""
  }

  async writeText(text: string): Promise<void> {
    const platform = process.platform

    // First try OSC 52 escape sequence (works in modern terminals)
    const base64 = Buffer.from(text).toString("base64")
    process.stdout.write(`\x1b]52;c;${base64}\x07`)

    // Also try system clipboard as fallback
    try {
      if (platform === "darwin") {
        const proc = Bun.spawn(["pbcopy"], {
          stdin: new Blob([text]),
        })
        await proc.exited
      } else if (platform === "linux") {
        try {
          const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
            stdin: new Blob([text]),
          })
          await proc.exited
        } catch {
          const proc = Bun.spawn(["xsel", "--clipboard", "--input"], {
            stdin: new Blob([text]),
          })
          await proc.exited
        }
      }
    } catch {
      // System clipboard not available, OSC 52 was already sent
    }
  }
}

export const clipboard = new TerminalClipboardAdapter()
