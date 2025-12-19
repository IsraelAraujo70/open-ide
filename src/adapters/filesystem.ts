/**
 * FileSystem Adapter - Bun implementation
 */

import type { FileSystemPort, FileWatchEvent, FileWatcher, FileStat } from "../ports/index.ts"
import type { FileEntry, DirectoryTree } from "../domain/types.ts"
import { watch, readdirSync, statSync } from "fs"
import { join, basename } from "path"

export class BunFileSystemAdapter implements FileSystemPort {
  async readFile(path: string): Promise<string> {
    const file = Bun.file(path)
    return await file.text()
  }

  async writeFile(path: string, content: string): Promise<void> {
    await Bun.write(path, content)
  }

  async listDirectory(path: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = []

    try {
      const items = readdirSync(path, { withFileTypes: true })

      for (const item of items) {
        // Skip hidden files and node_modules for performance
        if (item.name.startsWith(".") && item.name !== ".gitignore" && item.name !== ".env") {
          continue
        }

        const fullPath = join(path, item.name)
        const isDir = item.isDirectory()

        let size = 0
        if (!isDir) {
          try {
            const stat = statSync(fullPath)
            size = stat.size
          } catch {
            // Ignore stat errors
          }
        }

        entries.push({
          name: item.name,
          path: fullPath,
          type: isDir ? "directory" : "file",
          size: isDir ? undefined : size,
        })
      }
    } catch (e) {
      // Directory not readable
      return []
    }

    // Sort: directories first, then alphabetically
    return entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  async buildTree(path: string, depth = 2): Promise<DirectoryTree> {
    const name = basename(path)
    const entry: FileEntry = {
      name,
      path,
      type: "directory",
    }

    if (depth <= 0) {
      return { entry, children: [], isExpanded: false }
    }

    const children: DirectoryTree[] = []
    const entries = await this.listDirectory(path)

    for (const e of entries) {
      // Skip node_modules for initial tree
      if (e.name === "node_modules") {
        children.push({
          entry: e,
          children: [],
          isExpanded: false,
        })
        continue
      }

      if (e.type === "directory") {
        const subtree = await this.buildTree(e.path, depth - 1)
        children.push(subtree)
      } else {
        children.push({
          entry: e,
          children: [],
          isExpanded: false,
        })
      }
    }

    return { entry, children, isExpanded: true }
  }

  async exists(path: string): Promise<boolean> {
    try {
      statSync(path)
      return true
    } catch {
      return false
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stat = statSync(path)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  watch(path: string, callback: (event: FileWatchEvent) => void): FileWatcher {
    const watcher = watch(path, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      const fullPath = join(path, filename)
      let type: FileWatchEvent["type"] = "modify"

      if (eventType === "rename") {
        type = "rename"
      }

      callback({ type, path: fullPath })
    })

    return {
      close: () => watcher.close(),
    }
  }

  async stat(path: string): Promise<FileStat> {
    try {
      const stat = statSync(path)
      return {
        size: stat.size,
        modifiedAt: stat.mtime,
        createdAt: stat.birthtime,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
      }
    } catch (e) {
      throw e
    }
  }

  async mkdir(path: string): Promise<void> {
    const proc = Bun.spawn(["mkdir", "-p", path])
    await proc.exited
  }

  async remove(path: string): Promise<void> {
    const proc = Bun.spawn(["rm", "-rf", path])
    await proc.exited
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const proc = Bun.spawn(["mv", oldPath, newPath])
    await proc.exited
  }
}

export const fileSystem = new BunFileSystemAdapter()
