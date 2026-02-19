#!/usr/bin/env node

import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const currentDir = dirname(fileURLToPath(import.meta.url))
const entrypoint = resolve(currentDir, "../index.tsx")
const bunCommand = process.platform === "win32" ? "bun.exe" : "bun"
const defaultParserManifest = resolve(currentDir, "../.open-ide/parsers.json")

if (!process.env.OPEN_IDE_PARSERS_FILE) {
  process.env.OPEN_IDE_PARSERS_FILE = defaultParserManifest
}

const child = spawn(bunCommand, ["run", entrypoint, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
})

child.on("error", error => {
  const message =
    error.code === "ENOENT"
      ? "open-ide requires Bun installed and available in PATH."
      : `Failed to start open-ide: ${error.message}`
  console.error(message)
  process.exit(1)
})

child.on("exit", code => {
  process.exit(code ?? 0)
})
