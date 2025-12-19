/**
 * Process Adapter - Bun implementation for spawning processes and PTY
 *
 * Note: For PTY we use node-pty which needs to be installed separately.
 * For MVP, we implement a basic PTY using Bun.spawn with proper stdin/stdout handling.
 */

import type {
  ProcessPort,
  SpawnOptions,
  PtyOptions,
  ChildProcess,
  PtyProcess,
} from "../ports/index.ts"

export class BunProcessAdapter implements ProcessPort {
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess {
    const proc = Bun.spawn([command, ...args], {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    return {
      pid: proc.pid,
      stdin: new WritableStream({
        write(chunk) {
          proc.stdin.write(chunk)
        },
        close() {
          proc.stdin.end()
        },
      }),
      stdout: proc.stdout as ReadableStream<Uint8Array>,
      stderr: proc.stderr as ReadableStream<Uint8Array>,
      exited: proc.exited,
      kill: (signal?: number) => proc.kill(signal),
    }
  }

  spawnPty(command: string, args: string[], options?: PtyOptions): PtyProcess {
    // For real PTY support we need node-pty or similar
    // This is a simplified implementation that works for basic cases
    // using script(1) command to create a pseudo-terminal on Unix systems

    const cols = options?.cols ?? 80
    const rows = options?.rows ?? 24

    // Use script command to create a pseudo-terminal
    // On Linux: script -q -c "command" /dev/null
    const scriptArgs = ["-q", "-c", [command, ...args].join(" "), "/dev/null"]

    const proc = Bun.spawn(["script", ...scriptArgs], {
      cwd: options?.cwd,
      env: {
        ...process.env,
        ...options?.env,
        TERM: "xterm-256color",
        COLUMNS: String(cols),
        LINES: String(rows),
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    const dataCallbacks: ((data: string) => void)[] = []
    const exitCallbacks: ((code: number) => void)[] = []
    const decoder = new TextDecoder()

    // Read stdout asynchronously
    const readStdout = async () => {
      const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value)
          for (const cb of dataCallbacks) {
            cb(text)
          }
        }
      } catch {
        // Stream closed
      }
    }

    readStdout()

    // Handle exit
    proc.exited.then(code => {
      for (const cb of exitCallbacks) {
        cb(code)
      }
    })

    return {
      pid: proc.pid,

      write(data: string) {
        proc.stdin.write(data)
      },

      onData(callback: (data: string) => void) {
        dataCallbacks.push(callback)
      },

      onExit(callback: (code: number) => void) {
        exitCallbacks.push(callback)
      },

      resize(_cols: number, _rows: number) {
        // Send SIGWINCH with new size
        // This is tricky without proper PTY - for now we just set env vars
        // A real implementation would use ioctl TIOCSWINSZ
        // For MVP, this is a no-op but noted for future implementation
      },

      kill() {
        proc.kill()
      },
    }
  }
}

export const processAdapter = new BunProcessAdapter()
