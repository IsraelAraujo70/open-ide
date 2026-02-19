/**
 * FilePicker Component
 * - mode=file: project file finder with live search and preview
 * - mode=project: directory picker for selecting workspace root
 */

import { useState, useMemo, useEffect } from "react"
import { basename, dirname, relative } from "path"
import type { Theme, FileEntry } from "../../domain/types.ts"
import { fileSystem } from "../../adapters/index.ts"
import { folderColor, getFileIcon, getFolderIcon } from "../../domain/fileIcons.ts"
import type { KeyEvent } from "@opentui/core"
import { getFiletype, getSyntaxStyle, getTreeSitter, initTreeSitter, isTreeSitterReady } from "../../shared/index.ts"

interface FilePickerProps {
  theme: Theme
  width: number
  height: number
  initialPath: string
  mode?: "file" | "project"
  onSelect: (path: string) => void
  onCancel: () => void
}

interface SearchResult {
  entry: FileEntry
  relativePath: string
  directory: string
  score: number
}

interface PickerTreeNode {
  entry: FileEntry
  children: PickerTreeNode[]
}

interface TreeListItem {
  node: PickerTreeNode
  depth: number
  isLast: boolean
  parentPrefixes: boolean[]
  parentPath: string | null
  isRoot: boolean
}

const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "coverage", "target", "out", ".next"])
const MAX_INDEXED_FILES = 6000
const MAX_PREVIEW_CHARS = 20000

export function FilePicker({ mode = "file", ...props }: FilePickerProps) {
  if (mode === "project") {
    return <ProjectDirectoryPicker mode={mode} {...props} />
  }

  return <ProjectFileFinder mode={mode} {...props} />
}

function ProjectFileFinder({ theme, width, height, initialPath, onSelect, onCancel }: FilePickerProps) {
  const { colors } = theme
  const [query, setQuery] = useState("")
  const [indexedFiles, setIndexedFiles] = useState<FileEntry[]>([])
  const [indexedDirectories, setIndexedDirectories] = useState<FileEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set([initialPath]))
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState<string>("")
  const [previewLoading, setPreviewLoading] = useState(false)
  const [treeSitterReady, setTreeSitterReady] = useState(isTreeSitterReady())

  useEffect(() => {
    let mounted = true

    if (isTreeSitterReady()) {
      setTreeSitterReady(true)
      return
    }

    initTreeSitter()
      .then(() => {
        if (mounted) {
          setTreeSitterReady(true)
        }
      })
      .catch(error => {
        console.error("Failed to initialize Tree-sitter for preview:", error)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let disposed = false

    const indexFiles = async () => {
      setLoadingIndex(true)
      const files: FileEntry[] = []
      const directories: FileEntry[] = [
        {
          name: basename(initialPath) || initialPath,
          path: initialPath,
          type: "directory",
        },
      ]
      const queue: string[] = [initialPath]
      const seenDirectories = new Set<string>([initialPath])

      while (queue.length > 0 && files.length < MAX_INDEXED_FILES && !disposed) {
        const dir = queue.shift()!
        const entries = await fileSystem.listDirectory(dir)

        for (const entry of entries) {
          if (entry.type === "directory") {
            if (!IGNORED_DIRS.has(entry.name)) {
              if (!seenDirectories.has(entry.path)) {
                seenDirectories.add(entry.path)
                directories.push(entry)
                queue.push(entry.path)
              }
            }
            continue
          }

          files.push(entry)
          if (files.length >= MAX_INDEXED_FILES) {
            break
          }
        }
      }

      if (!disposed) {
        setIndexedFiles(files)
        setIndexedDirectories(directories)
        setSelectedIndex(0)
        setSelectedTreePath(initialPath)
        setExpandedDirectories(new Set([initialPath]))
        setLoadingIndex(false)
      }
    }

    void indexFiles()

    return () => {
      disposed = true
    }
  }, [initialPath])

  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length > 0

  const results = useMemo((): SearchResult[] => {
    const normalizedQuery = trimmedQuery.toLowerCase()

    if (!normalizedQuery) return []

    const scored = indexedFiles
      .map(file => {
        const rel = relative(initialPath, file.path) || basename(file.path)
        const dir = relative(initialPath, dirname(file.path)) || "."
        const score = scoreMatch(rel, normalizedQuery)

        return {
          entry: file,
          relativePath: rel,
          directory: dir,
          score,
        }
      })
      .filter(item => item.score > 0)

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.relativePath.localeCompare(b.relativePath)
    })

    return scored.slice(0, 500)
  }, [indexedFiles, initialPath, trimmedQuery])

  const indexedTree = useMemo(
    () => buildIndexedTree(initialPath, indexedDirectories, indexedFiles),
    [initialPath, indexedDirectories, indexedFiles]
  )

  const treeItems = useMemo(
    () => flattenTree(indexedTree, expandedDirectories),
    [indexedTree, expandedDirectories]
  )

  useEffect(() => {
    if (hasQuery) return
    const selected = selectedTreePath
      ? treeItems.find(item => item.node.entry.path === selectedTreePath)
      : null
    if (!selected) {
      setSelectedTreePath(indexedTree.entry.path)
    }
  }, [hasQuery, indexedTree.entry.path, selectedTreePath, treeItems])

  useEffect(() => {
    if (!hasQuery) return
    setSelectedIndex(index => {
      if (results.length === 0) return 0
      return Math.max(0, Math.min(results.length - 1, index))
    })
  }, [hasQuery, results.length])

  const selectedResult = hasQuery ? (results[selectedIndex] ?? null) : null
  const selectedTreeItem = !hasQuery
    ? (selectedTreePath
        ? (treeItems.find(item => item.node.entry.path === selectedTreePath) ?? null)
        : null) ?? treeItems[0] ?? null
    : null
  const selectedFilePath =
    selectedResult?.entry.path ??
    (selectedTreeItem?.node.entry.type === "file" ? selectedTreeItem.node.entry.path : null)
  const selectedLabel =
    selectedResult?.relativePath ??
    (selectedTreeItem ? formatTreeSelection(initialPath, selectedTreeItem.node.entry) : "No file selected")

  useEffect(() => {
    let disposed = false

    const loadPreview = async () => {
      if (!selectedFilePath) {
        setPreviewPath(null)
        setPreviewText("")
        setPreviewLoading(false)
        return
      }

      setPreviewPath(selectedFilePath)
      setPreviewLoading(true)

      try {
        const content = await fileSystem.readFile(selectedFilePath)
        if (disposed) return

        if (content.includes("\u0000")) {
          setPreviewText("[Binary file preview unavailable]")
        } else {
          const clipped = content.slice(0, MAX_PREVIEW_CHARS)
          setPreviewText(clipped)
        }
      } catch {
        if (!disposed) {
          setPreviewText("[Unable to preview file]")
        }
      } finally {
        if (!disposed) {
          setPreviewLoading(false)
        }
      }
    }

    void loadPreview()

    return () => {
      disposed = true
    }
  }, [selectedFilePath])

  const moveTreeSelection = (delta: number) => {
    if (treeItems.length === 0) return
    const currentIndex = selectedTreePath
      ? treeItems.findIndex(item => item.node.entry.path === selectedTreePath)
      : -1
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = Math.max(0, Math.min(treeItems.length - 1, startIndex + delta))
    const next = treeItems[nextIndex]
    if (next) {
      setSelectedTreePath(next.node.entry.path)
    }
  }

  const toggleDirectory = (path: string) => {
    if (path === indexedTree.entry.path) return

    setExpandedDirectories(previous => {
      const next = new Set(previous)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleKeyDown = (key: KeyEvent) => {
    const keyName = normalizeKeyName(key.name)

    if (keyName === "escape") {
      onCancel()
      return
    }

    if (hasQuery) {
      if (keyName === "enter") {
        if (selectedResult) {
          onSelect(selectedResult.entry.path)
        }
        return
      }

      if (results.length === 0) return

      if (keyName === "up") {
        key.preventDefault?.()
        setSelectedIndex(i => Math.max(0, i - 1))
        return
      }

      if (keyName === "down") {
        key.preventDefault?.()
        setSelectedIndex(i => Math.min(results.length - 1, i + 1))
        return
      }

      if (keyName === "pageup") {
        key.preventDefault?.()
        setSelectedIndex(i => Math.max(0, i - 10))
        return
      }

      if (keyName === "pagedown") {
        key.preventDefault?.()
        setSelectedIndex(i => Math.min(results.length - 1, i + 10))
        return
      }

      if (keyName === "home") {
        key.preventDefault?.()
        setSelectedIndex(0)
        return
      }

      if (keyName === "end") {
        key.preventDefault?.()
        setSelectedIndex(Math.max(0, results.length - 1))
        return
      }
      return
    }

    if (!selectedTreeItem) return

    if (keyName === "enter") {
      key.preventDefault?.()
      if (selectedTreeItem.node.entry.type === "directory") {
        toggleDirectory(selectedTreeItem.node.entry.path)
      } else {
        onSelect(selectedTreeItem.node.entry.path)
      }
      return
    }

    if (keyName === "up") {
      key.preventDefault?.()
      moveTreeSelection(-1)
      return
    }

    if (keyName === "down") {
      key.preventDefault?.()
      moveTreeSelection(1)
      return
    }

    if (keyName === "pageup") {
      key.preventDefault?.()
      moveTreeSelection(-10)
      return
    }

    if (keyName === "pagedown") {
      key.preventDefault?.()
      moveTreeSelection(10)
      return
    }

    if (keyName === "home") {
      key.preventDefault?.()
      const first = treeItems[0]
      if (first) {
        setSelectedTreePath(first.node.entry.path)
      }
      return
    }

    if (keyName === "end") {
      key.preventDefault?.()
      const last = treeItems[treeItems.length - 1]
      if (last) {
        setSelectedTreePath(last.node.entry.path)
      }
      return
    }

    if (keyName === "right") {
      key.preventDefault?.()
      if (selectedTreeItem.node.entry.type === "file") {
        return
      }

      if (!expandedDirectories.has(selectedTreeItem.node.entry.path)) {
        toggleDirectory(selectedTreeItem.node.entry.path)
        return
      }

      const selectedTreeIndex = treeItems.findIndex(
        item => item.node.entry.path === selectedTreeItem.node.entry.path
      )
      const child = treeItems[selectedTreeIndex + 1]
      if (child && child.parentPath === selectedTreeItem.node.entry.path) {
        setSelectedTreePath(child.node.entry.path)
      }
      return
    }

    if (keyName === "left") {
      key.preventDefault?.()
      if (
        selectedTreeItem.node.entry.type === "directory" &&
        expandedDirectories.has(selectedTreeItem.node.entry.path) &&
        selectedTreeItem.node.entry.path !== indexedTree.entry.path
      ) {
        toggleDirectory(selectedTreeItem.node.entry.path)
        return
      }

      if (selectedTreeItem.parentPath) {
        setSelectedTreePath(selectedTreeItem.parentPath)
      }
    }
  }

  const leftOffset = Math.max(0, Math.floor((100 - width) / 2))
  const topOffset = 1
  const leftPaneWidth = Math.max(28, Math.floor((width - 3) * 0.45))
  const rightPaneWidth = Math.max(20, width - leftPaneWidth - 3)
  const previewFiletype = previewPath ? getFiletype(previewPath) : null

  return (
    <box
      position="absolute"
      top={topOffset}
      left={leftOffset}
      width={width}
      height={height}
      backgroundColor={colors.background}
      borderStyle="single"
      border={true}
      borderColor={colors.primary}
      flexDirection="column"
      zIndex={210}
    >
      <box height={1} paddingLeft={1} paddingRight={1}>
        <input
          flexGrow={1}
          value={query}
          focused={true}
          backgroundColor={colors.background}
          textColor={colors.foreground}
          placeholder="Search project files..."
          placeholderColor={colors.comment}
          onInput={(value: string) => {
            setQuery(value)
            setSelectedIndex(0)
          }}
          onKeyDown={handleKeyDown}
        />
      </box>

      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>

      <box flexGrow={1} flexDirection="row">
        <box width={leftPaneWidth} flexDirection="column">
          <scrollbox flexGrow={1}>
            {loadingIndex ? (
              <text fg={colors.comment} paddingLeft={1}>
                Indexing project files...
              </text>
            ) : hasQuery ? (
              results.length === 0 ? (
                <text fg={colors.comment} paddingLeft={1}>
                  No matching files
                </text>
              ) : (
                results.map((item, index) => (
                  <FinderRow
                    key={item.entry.path}
                    item={item}
                    isSelected={index === selectedIndex}
                    width={leftPaneWidth}
                    theme={theme}
                    onSelect={() => setSelectedIndex(index)}
                  />
                ))
              )
            ) : treeItems.length === 0 ? (
              <text fg={colors.comment} paddingLeft={1}>
                No files indexed
              </text>
            ) : (
              treeItems.map(item => (
                <FinderTreeRow
                  key={item.node.entry.path}
                  item={item}
                  width={leftPaneWidth}
                  isSelected={item.node.entry.path === selectedTreePath}
                  isExpanded={expandedDirectories.has(item.node.entry.path)}
                  theme={theme}
                  onSelect={(path: string) => setSelectedTreePath(path)}
                  onToggleDirectory={toggleDirectory}
                />
              ))
            )}
          </scrollbox>
        </box>

        <box width={1}>
          <text fg={colors.border}>│</text>
        </box>

        <box width={rightPaneWidth} flexDirection="column">
          <box height={1} paddingLeft={1} paddingRight={1}>
            <text fg={colors.primary}>{selectedLabel}</text>
          </box>

          <box height={1}>
            <text fg={colors.border}>{"─".repeat(Math.max(1, rightPaneWidth - 1))}</text>
          </box>

          <box flexGrow={1}>
            {previewLoading ? (
              <text fg={colors.comment} paddingLeft={1}>
                Loading preview...
              </text>
            ) : previewPath ? (
              <line-number
                flexGrow={1}
                fg={colors.comment}
                bg={colors.background}
                minWidth={4}
                paddingRight={1}
              >
                <code
                  content={previewText}
                  filetype={previewFiletype ?? undefined}
                  syntaxStyle={getSyntaxStyle(theme)}
                  treeSitterClient={treeSitterReady ? getTreeSitter() : undefined}
                  drawUnstyledText={true}
                  conceal={false}
                  wrapMode="none"
                  fg={colors.foreground}
                  bg={colors.background}
                />
              </line-number>
            ) : (
              <text fg={colors.comment} paddingLeft={1}>
                Select a file to preview
              </text>
            )}
          </box>
        </box>
      </box>

      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>
      <box height={1} paddingLeft={1}>
        <text fg={colors.comment}>
          {hasQuery
            ? "Enter: open | Esc: cancel | ↑↓: navigate results"
            : "Enter: open file / toggle folder | Esc: cancel | ↑↓←→: navigate tree"}
        </text>
      </box>
    </box>
  )
}

interface FinderRowProps {
  item: SearchResult
  isSelected: boolean
  width: number
  theme: Theme
  onSelect: () => void
}

function FinderRow({ item, isSelected, width, theme, onSelect }: FinderRowProps) {
  const { colors } = theme
  const bg = isSelected ? colors.selection : colors.background
  const icon = getFileIcon(item.entry.name)
  const maxPathWidth = Math.max(10, width - 6)
  const displayPath = truncateFromStart(item.relativePath, maxPathWidth)

  return (
    <box height={1} backgroundColor={bg} paddingLeft={1} paddingRight={1} onMouseDown={onSelect}>
      <text fg={icon.color} bg={bg}>
        {icon.icon}
      </text>
      <text fg={colors.foreground} bg={bg}>
        {" "}{displayPath}
      </text>
    </box>
  )
}

interface FinderTreeRowProps {
  item: TreeListItem
  width: number
  isSelected: boolean
  isExpanded: boolean
  theme: Theme
  onSelect: (path: string) => void
  onToggleDirectory: (path: string) => void
}

function FinderTreeRow({
  item,
  width,
  isSelected,
  isExpanded,
  theme,
  onSelect,
  onToggleDirectory,
}: FinderTreeRowProps) {
  const { colors } = theme
  const bg = isSelected ? colors.selection : colors.background
  const isDirectory = item.node.entry.type === "directory"
  const icon = isDirectory ? getFolderIcon(item.node.entry.name, isExpanded) : getFileIcon(item.node.entry.name).icon
  const iconColor = isDirectory ? folderColor : getFileIcon(item.node.entry.name).color
  const textColor = isDirectory ? folderColor : colors.foreground
  const prefix = item.isRoot ? "" : buildTreePrefix(item)
  const maxNameWidth = Math.max(8, width - prefix.length - 6)

  const handleMouseDown = () => {
    onSelect(item.node.entry.path)
    if (isDirectory) {
      onToggleDirectory(item.node.entry.path)
    }
  }

  return (
    <box height={1} backgroundColor={bg} paddingLeft={1} paddingRight={1} onMouseDown={handleMouseDown}>
      {!item.isRoot && (
        <text fg={colors.border} bg={bg}>
          {prefix}
        </text>
      )}
      <text fg={iconColor} bg={bg}>
        {icon}{" "}
      </text>
      <text fg={textColor} bg={bg}>
        {truncate(item.node.entry.name, maxNameWidth)}
      </text>
    </box>
  )
}

function buildIndexedTree(
  rootPath: string,
  directories: FileEntry[],
  files: FileEntry[]
): PickerTreeNode {
  const root: PickerTreeNode = {
    entry: {
      name: basename(rootPath) || rootPath,
      path: rootPath,
      type: "directory",
    },
    children: [],
  }

  const nodeByPath = new Map<string, PickerTreeNode>()
  nodeByPath.set(rootPath, root)

  const sortedDirectories = [...directories]
    .filter(entry => entry.path !== rootPath && entry.type === "directory")
    .sort((a, b) => {
      const depthDifference = pathDepth(a.path) - pathDepth(b.path)
      if (depthDifference !== 0) return depthDifference
      return a.path.localeCompare(b.path)
    })

  for (const directoryEntry of sortedDirectories) {
    const parentPath = dirname(directoryEntry.path)
    const parent = nodeByPath.get(parentPath)
    if (!parent) continue

    const node: PickerTreeNode = {
      entry: directoryEntry,
      children: [],
    }

    nodeByPath.set(directoryEntry.path, node)
    parent.children.push(node)
  }

  for (const fileEntry of files) {
    const parent = nodeByPath.get(dirname(fileEntry.path))
    if (!parent) continue

    parent.children.push({
      entry: fileEntry,
      children: [],
    })
  }

  sortTree(root)
  return root
}

function sortTree(node: PickerTreeNode): void {
  node.children.sort((a, b) => {
    if (a.entry.type !== b.entry.type) {
      return a.entry.type === "directory" ? -1 : 1
    }
    return a.entry.name.localeCompare(b.entry.name)
  })

  for (const child of node.children) {
    if (child.entry.type === "directory") {
      sortTree(child)
    }
  }
}

function flattenTree(
  tree: PickerTreeNode,
  expandedDirectories: Set<string>,
  depth = 0,
  isLast = true,
  parentPrefixes: boolean[] = [],
  parentPath: string | null = null
): TreeListItem[] {
  const items: TreeListItem[] = [
    {
      node: tree,
      depth,
      isLast,
      parentPrefixes,
      parentPath,
      isRoot: depth === 0,
    },
  ]

  const shouldExpand = depth === 0 || expandedDirectories.has(tree.entry.path)
  if (!shouldExpand || tree.entry.type !== "directory") {
    return items
  }

  tree.children.forEach((child, index) => {
    const childIsLast = index === tree.children.length - 1
    const nextParentPrefixes = depth === 0 ? [] : [...parentPrefixes, !isLast]
    items.push(
      ...flattenTree(
        child,
        expandedDirectories,
        depth + 1,
        childIsLast,
        nextParentPrefixes,
        tree.entry.path
      )
    )
  })

  return items
}

function buildTreePrefix(item: TreeListItem): string {
  let prefix = ""

  for (const hasMoreSiblings of item.parentPrefixes) {
    prefix += hasMoreSiblings ? "│   " : "    "
  }

  prefix += item.isLast ? "└── " : "├── "
  return prefix
}

function formatTreeSelection(rootPath: string, entry: FileEntry): string {
  const relativePath = relative(rootPath, entry.path)
  const displayPath = relativePath || basename(rootPath) || rootPath
  if (entry.type === "directory") {
    return `${displayPath}/`
  }
  return displayPath
}

function pathDepth(path: string): number {
  return path.split("/").filter(Boolean).length
}

function ProjectDirectoryPicker({ theme, width, height, initialPath, onSelect, onCancel }: FilePickerProps) {
  const { colors } = theme
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fileSystem
      .listDirectory(currentPath)
      .then(items => {
        const filtered = items.filter(i => i.type === "directory")
        const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name))
        setEntries(sorted)
        setSelectedIndex(0)
        setLoading(false)
      })
      .catch(() => {
        setEntries([])
        setLoading(false)
      })
  }, [currentPath])

  const filteredEntries = useMemo(() => {
    if (!filter) return entries
    const lowerFilter = filter.toLowerCase()
    return entries.filter(e => e.name.toLowerCase().includes(lowerFilter))
  }, [entries, filter])

  const handleKeyDown = (key: KeyEvent) => {
    const keyName = normalizeKeyName(key.name)

    if (keyName === "escape") {
      onCancel()
    } else if (keyName === "enter") {
      if (key.shift) {
        onSelect(currentPath)
        return
      }

      const selected = filteredEntries[selectedIndex]
      if (selected) {
        setCurrentPath(selected.path)
        setFilter("")
      }
    } else if (keyName === "up") {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (keyName === "down") {
      setSelectedIndex(i => Math.min(filteredEntries.length - 1, i + 1))
    } else if (keyName === "backspace" && !filter) {
      const parent = currentPath.split("/").slice(0, -1).join("/") || "/"
      setCurrentPath(parent)
    }
  }

  const leftOffset = Math.max(0, Math.floor((100 - width) / 2))
  const topOffset = 2

  return (
    <box
      position="absolute"
      top={topOffset}
      left={leftOffset}
      width={width}
      height={height}
      backgroundColor={colors.background}
      borderStyle="single"
      border={true}
      borderColor={colors.primary}
      flexDirection="column"
      zIndex={200}
    >
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.primary}>Open Project</text>
      </box>

      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.comment}>{currentPath}</text>
      </box>

      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg={colors.primary}>{">"}</text>
        <input
          flexGrow={1}
          value={filter}
          focused={true}
          backgroundColor={colors.background}
          textColor={colors.foreground}
          placeholder="Type to filter folders..."
          placeholderColor={colors.comment}
          onInput={(value: string) => {
            setFilter(value)
            setSelectedIndex(0)
          }}
          onKeyDown={handleKeyDown}
        />
      </box>

      <box height={1}>
        <text fg={colors.border}>{"─".repeat(width - 2)}</text>
      </box>

      <scrollbox flexGrow={1}>
        {loading ? (
          <text fg={colors.comment} paddingLeft={1}>
            Loading...
          </text>
        ) : filteredEntries.length === 0 ? (
          <text fg={colors.comment} paddingLeft={1}>
            No folders found
          </text>
        ) : (
          filteredEntries.slice(0, Math.max(1, height - 6)).map((entry, index) => (
            <FileEntryRow
              key={entry.path}
              entry={entry}
              isSelected={index === selectedIndex}
              theme={theme}
              onSelect={() => {
                setCurrentPath(entry.path)
                setFilter("")
              }}
            />
          ))
        )}
      </scrollbox>

      <box height={1} paddingLeft={1}>
        <text fg={colors.comment}>Enter: open folder | Shift+Enter: select | Backspace: parent</text>
      </box>
    </box>
  )
}

interface FileEntryRowProps {
  entry: FileEntry
  isSelected: boolean
  theme: Theme
  onSelect: () => void
}

function FileEntryRow({ entry, isSelected, theme, onSelect }: FileEntryRowProps) {
  const { colors } = theme
  const bg = isSelected ? colors.selection : colors.background
  const fg = entry.type === "directory" ? colors.keyword : colors.foreground
  const icon = entry.type === "directory" ? "📁 " : "📄 "

  return (
    <box height={1} backgroundColor={bg} paddingLeft={1} paddingRight={1} onMouseDown={onSelect}>
      <text fg={fg} bg={bg}>
        {icon}
        {entry.name}
      </text>
    </box>
  )
}

function normalizeKeyName(name: string): string {
  if (name === "return") return "enter"
  return name.toLowerCase()
}

function truncate(input: string, maxLen: number): string {
  if (maxLen <= 1) return ""
  if (input.length <= maxLen) return input
  return `${input.slice(0, Math.max(0, maxLen - 1))}…`
}

function truncateFromStart(input: string, maxLen: number): string {
  if (maxLen <= 1) return ""
  if (input.length <= maxLen) return input
  return `…${input.slice(-(maxLen - 1))}`
}

function scoreMatch(path: string, query: string): number {
  if (!query) return 1

  const lowerPath = path.toLowerCase()
  const name = basename(path).toLowerCase()

  let score = 0

  if (name === query) score += 1000
  if (name.startsWith(query)) score += 500
  if (name.includes(query)) score += 300
  if (lowerPath.includes(query)) score += 160

  const fuzzyNameScore = fuzzyScore(name, query)
  const fuzzyPathScore = fuzzyScore(lowerPath, query)

  if (score === 0 && fuzzyNameScore < 0 && fuzzyPathScore < 0) {
    return 0
  }

  score += Math.max(0, fuzzyNameScore) * 4
  score += Math.max(0, fuzzyPathScore) * 2

  return score
}

function fuzzyScore(text: string, query: string): number {
  if (!query) return 0

  let score = 0
  let textIndex = 0
  let streak = 0

  for (let i = 0; i < query.length; i++) {
    const ch = query[i]
    let foundAt = -1

    for (let j = textIndex; j < text.length; j++) {
      if (text[j] === ch) {
        foundAt = j
        break
      }
    }

    if (foundAt === -1) {
      return -1
    }

    if (foundAt === textIndex) {
      streak += 1
      score += 8 + streak * 2
    } else {
      streak = 0
      score += 5
    }

    textIndex = foundAt + 1
  }

  return score - Math.max(0, text.length - query.length)
}
