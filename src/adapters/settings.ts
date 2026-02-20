/**
 * Settings Adapter - Persists settings to ~/.config/open-ide/settings.json
 */

import type { SettingsPort, Settings } from "../ports/index.ts"
import { defaultSettings as defaults } from "../ports/index.ts"
import { join } from "path"
import { homedir } from "os"

const CONFIG_DIR = join(homedir(), ".config", "open-ide")
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json")

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeLspServerConfig(
  key: string,
  value: unknown,
  fallback?: Settings["lspServers"][string]
): Settings["lspServers"][string] | null {
  if (!isRecord(value)) {
    return fallback ? { ...fallback } : null
  }

  const language = typeof value.language === "string" ? value.language.trim() : fallback?.language ?? key
  const command = typeof value.command === "string" ? value.command.trim() : fallback?.command ?? ""
  const args = Array.isArray(value.args)
    ? value.args.filter((arg): arg is string => typeof arg === "string")
    : fallback?.args ?? []
  const rootUri = typeof value.rootUri === "string" ? value.rootUri : fallback?.rootUri

  if (!language || !command) {
    return null
  }

  return {
    language,
    command,
    args,
    rootUri,
  }
}

function mergeSettings(parsed: Partial<Settings>): Settings {
  const mergedLspServers: Settings["lspServers"] = {}

  for (const [key, config] of Object.entries(defaults.lspServers)) {
    mergedLspServers[key] = { ...config }
  }

  if (isRecord(parsed.lspServers)) {
    for (const [key, value] of Object.entries(parsed.lspServers)) {
      const normalized = normalizeLspServerConfig(key, value, mergedLspServers[key])
      if (normalized) {
        mergedLspServers[key] = normalized
      }
    }
  }

  return {
    ...defaults,
    ...parsed,
    lspServers: mergedLspServers,
  }
}

export class JsonSettingsAdapter implements SettingsPort {
  private cache: Settings | null = null

  async load(): Promise<Settings> {
    try {
      const file = Bun.file(SETTINGS_FILE)
      if (await file.exists()) {
        const content = await file.text()
        const parsed = JSON.parse(content) as Partial<Settings>
        // Merge with defaults to ensure all keys exist.
        // lspServers needs a deep-ish merge so newly added defaults are preserved.
        this.cache = mergeSettings(parsed)
        return this.cache
      }
    } catch {
      // File doesn't exist or is invalid
    }

    this.cache = mergeSettings({})
    return this.cache
  }

  async save(settings: Settings): Promise<void> {
    // Ensure config directory exists
    const proc = Bun.spawn(["mkdir", "-p", CONFIG_DIR])
    await proc.exited

    await Bun.write(SETTINGS_FILE, JSON.stringify(settings, null, 2))
    this.cache = settings
  }

  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
    if (!this.cache) {
      await this.load()
    }
    return this.cache![key]
  }

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    if (!this.cache) {
      await this.load()
    }
    this.cache![key] = value
    await this.save(this.cache!)
  }
}

export const settings = new JsonSettingsAdapter()
