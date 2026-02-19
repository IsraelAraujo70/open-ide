/**
 * Settings Adapter - Persists settings to ~/.config/open-ide/settings.json
 */

import type { SettingsPort, Settings } from "../ports/index.ts"
import { defaultSettings as defaults } from "../ports/index.ts"
import { join } from "path"
import { homedir } from "os"

const CONFIG_DIR = join(homedir(), ".config", "open-ide")
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json")

export class JsonSettingsAdapter implements SettingsPort {
  private cache: Settings | null = null

  async load(): Promise<Settings> {
    try {
      const file = Bun.file(SETTINGS_FILE)
      if (await file.exists()) {
        const content = await file.text()
        const parsed = JSON.parse(content) as Partial<Settings>
        // Merge with defaults to ensure all keys exist
        this.cache = { ...defaults, ...parsed }
        return this.cache
      }
    } catch {
      // File doesn't exist or is invalid
    }

    this.cache = { ...defaults }
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
