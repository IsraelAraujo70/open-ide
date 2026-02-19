/**
 * Clipboard Adapter - Uses OSC 52 escape sequences for terminal clipboard
 * Falls back to system commands if available
 */

import type { ClipboardPort } from "../ports/index.ts"

export class TerminalClipboardAdapter implements ClipboardPort {
  private async tryReadCommand(command: string[]): Promise<string | null> {
    try {
      const proc = Bun.spawn(command)
      const text = await new Response(proc.stdout).text()
      const exitCode = await proc.exited
      if (exitCode !== 0) return null
      return text
    } catch {
      return null
    }
  }

  private async tryWriteCommand(command: string[], text: string): Promise<boolean> {
    try {
      const proc = Bun.spawn(command, {
        stdin: new Blob([text]),
      })
      const exitCode = await proc.exited
      return exitCode === 0
    } catch {
      return false
    }
  }

  async readText(): Promise<string> {
    const platform = process.platform

    if (platform === "darwin") {
      return (await this.tryReadCommand(["pbpaste"])) ?? ""
    }

    if (platform === "linux") {
      const isWayland = !!process.env.WAYLAND_DISPLAY
      if (isWayland) {
        const waylandText = await this.tryReadCommand(["wl-paste"])
        if (waylandText !== null) {
          return waylandText
        }
      }

      const xclipText = await this.tryReadCommand(["xclip", "-selection", "clipboard", "-o"])
      if (xclipText !== null) {
        return xclipText
      }

      const xselText = await this.tryReadCommand(["xsel", "--clipboard", "--output"])
      if (xselText !== null) {
        return xselText
      }
    }

    return ""
  }

  async writeText(text: string): Promise<void> {
    const platform = process.platform

    // First try OSC 52 escape sequence (works in modern terminals)
    const base64 = Buffer.from(text).toString("base64")
    process.stdout.write(`\x1b]52;c;${base64}\x07`)

    // Also try system clipboard as fallback
    if (platform === "darwin") {
      await this.tryWriteCommand(["pbcopy"], text)
      return
    }

    if (platform === "linux") {
      const isWayland = !!process.env.WAYLAND_DISPLAY
      if (isWayland) {
        const wroteWayland = await this.tryWriteCommand(["wl-copy"], text)
        if (wroteWayland) return
      }

      const wroteXclip = await this.tryWriteCommand(["xclip", "-selection", "clipboard"], text)
      if (wroteXclip) return

      await this.tryWriteCommand(["xsel", "--clipboard", "--input"], text)
    }
  }
}

export const clipboard = new TerminalClipboardAdapter()
