/**
 * Explorer Component - File tree sidebar
 *
 * Features:
 * - Tree lines (├──, └──) for hierarchy visualization
 * - Color coding by file type
 * - Click to expand/collapse folders
 * - Click to open files
 * - Lazy loading of directory contents
 * - Keyboard navigation with arrows and Enter
 */

import { useEffect, useMemo, useState } from "react"
import type { KeyEvent } from "@opentui/core"
import type { DirectoryTree, Theme } from "../../domain/types.ts"
import { store } from "../../application/store.ts"
import { commandRegistry } from "../../application/commands.ts"
import { fileSystem } from "../../adapters/index.ts"
import { getFileIcon, getFolderIcon, folderColor } from "../../domain/fileIcons.ts"

interface ExplorerProps {
  width: number
  height: number
  directoryTree: DirectoryTree | null
  rootPath: string | null
  theme: Theme
  focused: boolean
}

interface FlatItem {
  tree: DirectoryTree
  depth: number
  isLast: boolean
  parentPrefixes: boolean[] // true = has more siblings, false = last child
  parentPath: string | null
}

interface VisibleItem extends FlatItem {
  isRoot: boolean
}

function flattenTree(
  tree: DirectoryTree,
  depth = 0,
  isLast = true,
  parentPrefixes: boolean[] = [],
  parentPath: string | null = null
): FlatItem[] {
  const items: FlatItem[] = []

  if (depth > 0) {
    items.push({ tree, depth, isLast, parentPrefixes, parentPath })
  }

  if (tree.entry.type === "directory" && tree.isExpanded) {
    const children = tree.children
    children.forEach((child, index) => {
      const childIsLast = index === children.length - 1
      const newPrefixes = depth === 0 ? [] : [...parentPrefixes, !isLast]
      items.push(...flattenTree(child, depth + 1, childIsLast, newPrefixes, tree.entry.path))
    })
  }

  return items
}

function buildPrefix(item: FlatItem): string {
  let prefix = ""

  for (const hasMoreSiblings of item.parentPrefixes) {
    prefix += hasMoreSiblings ? "│   " : "    "
  }

  prefix += item.isLast ? "└── " : "├── "

  return prefix
}

function normalizeKeyName(name: string): string {
  if (name === "return") return "enter"
  return name.toLowerCase()
}

export function Explorer({
  width,
  height,
  directoryTree,
  rootPath,
  theme,
  focused,
}: ExplorerProps) {
  const { colors } = theme
  const borderColor = focused ? colors.primary : colors.border
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const flatItems = useMemo(() => (directoryTree ? flattenTree(directoryTree) : []), [directoryTree])

  const visibleItems = useMemo((): VisibleItem[] => {
    if (!directoryTree) return []

    const rootItem: VisibleItem = {
      tree: directoryTree,
      depth: 0,
      isLast: true,
      parentPrefixes: [],
      parentPath: null,
      isRoot: true,
    }

    return [
      rootItem,
      ...flatItems.map(item => ({
        ...item,
        isRoot: false,
      })),
    ]
  }, [directoryTree, flatItems])

  useEffect(() => {
    if (!directoryTree) {
      setSelectedPath(null)
      return
    }

    const hasSelection = selectedPath
      ? visibleItems.some(item => item.tree.entry.path === selectedPath)
      : false

    if (!hasSelection) {
      setSelectedPath(directoryTree.entry.path)
    }
  }, [directoryTree, selectedPath, visibleItems])

  const openFile = async (path: string) => {
    await commandRegistry.execute("file.open", { args: [path] })
  }

  const loadDirectoryChildren = async (path: string): Promise<DirectoryTree[]> => {
    const children = await fileSystem.listDirectory(path)
    const mapped = children.map(entry => ({
      entry,
      children: [],
      isExpanded: false,
    }))

    store.dispatch({
      type: "LOAD_DIRECTORY_CHILDREN",
      path,
      children: mapped,
    })

    return mapped
  }

  const toggleDirectory = async (item: VisibleItem, selectFirstChild = false) => {
    if (item.tree.entry.type !== "directory") return

    const path = item.tree.entry.path
    const wasExpanded = item.tree.isExpanded

    store.dispatch({ type: "TOGGLE_DIRECTORY", path })

    if (!wasExpanded) {
      let children = item.tree.children

      if (children.length === 0) {
        try {
          children = await loadDirectoryChildren(path)
        } catch {
          children = []
        }
      }

      if (selectFirstChild && children.length > 0) {
        setSelectedPath(children[0]!.entry.path)
      }
    }
  }

  const activateItem = async (item: VisibleItem) => {
    if (item.tree.entry.type === "directory") {
      await toggleDirectory(item)
      return
    }

    await openFile(item.tree.entry.path)
  }

  const moveSelection = (delta: number) => {
    if (visibleItems.length === 0) return

    const currentIndex = selectedPath
      ? visibleItems.findIndex(item => item.tree.entry.path === selectedPath)
      : -1

    const startIndex = currentIndex === -1 ? 0 : currentIndex
    const nextIndex = Math.max(0, Math.min(visibleItems.length - 1, startIndex + delta))
    const next = visibleItems[nextIndex]

    if (next) {
      setSelectedPath(next.tree.entry.path)
    }
  }

  const handleKeyDown = (key: KeyEvent) => {
    if (!focused || visibleItems.length === 0) return

    const selected = selectedPath
      ? visibleItems.find(item => item.tree.entry.path === selectedPath) ?? null
      : null

    if (!selected) return

    const selectedIndex = visibleItems.findIndex(item => item.tree.entry.path === selected.tree.entry.path)
    const keyName = normalizeKeyName(key.name)

    switch (keyName) {
      case "down":
        key.preventDefault?.()
        moveSelection(1)
        return

      case "up":
        key.preventDefault?.()
        moveSelection(-1)
        return

      case "pageup":
        key.preventDefault?.()
        moveSelection(-10)
        return

      case "pagedown":
        key.preventDefault?.()
        moveSelection(10)
        return

      case "home": {
        key.preventDefault?.()
        const first = visibleItems[0]
        if (first) {
          setSelectedPath(first.tree.entry.path)
        }
        return
      }

      case "end": {
        key.preventDefault?.()
        const last = visibleItems[visibleItems.length - 1]
        if (last) {
          setSelectedPath(last.tree.entry.path)
        }
        return
      }

      case "right":
        key.preventDefault?.()
        if (selected.tree.entry.type === "directory") {
          if (!selected.tree.isExpanded) {
            void toggleDirectory(selected)
          } else {
            const child = visibleItems[selectedIndex + 1]
            if (child && child.parentPath === selected.tree.entry.path) {
              setSelectedPath(child.tree.entry.path)
            }
          }
        } else {
          void openFile(selected.tree.entry.path)
        }
        return

      case "left":
        key.preventDefault?.()
        if (selected.tree.entry.type === "directory" && selected.tree.isExpanded) {
          void toggleDirectory(selected)
        } else if (selected.parentPath) {
          setSelectedPath(selected.parentPath)
        }
        return

      case "enter":
        key.preventDefault?.()
        void activateItem(selected)
        return

      default:
        return
    }
  }

  return (
    <box
      width={width}
      height={height}
      backgroundColor={colors.background}
      borderStyle="single"
      border={["right"]}
      borderColor={borderColor}
      flexDirection="column"
    >
      {/* Header */}
      <box height={1} backgroundColor={colors.lineHighlight} paddingLeft={1}>
        <text fg={colors.foreground}>
          <b>EXPLORER</b>
        </text>
      </box>

      {/* File Tree */}
      <scrollbox flexGrow={1} focused={focused} onKeyDown={handleKeyDown}>
        {directoryTree ? (
          <box flexDirection="column">
            {visibleItems.map(item => (
              <TreeItem
                key={item.tree.entry.path}
                name={item.tree.entry.name}
                isDirectory={item.tree.entry.type === "directory"}
                isExpanded={item.tree.isExpanded}
                prefix={item.isRoot ? "" : buildPrefix(item)}
                isRoot={item.isRoot}
                isSelected={item.tree.entry.path === selectedPath}
                theme={theme}
                onSelect={() => setSelectedPath(item.tree.entry.path)}
                onActivate={() => {
                  void activateItem(item)
                }}
              />
            ))}
          </box>
        ) : rootPath ? (
          <text fg={colors.comment} paddingLeft={1}>
            {" "}
            Loading...
          </text>
        ) : (
          <text fg={colors.comment} paddingLeft={1}>
            {" "}
            No folder open
          </text>
        )}
      </scrollbox>
    </box>
  )
}

interface TreeItemProps {
  name: string
  isDirectory: boolean
  isExpanded: boolean
  prefix: string
  isRoot: boolean
  isSelected: boolean
  theme: Theme
  onSelect: () => void
  onActivate: () => void
}

function TreeItem({
  name,
  isDirectory,
  isExpanded,
  prefix,
  isRoot,
  isSelected,
  theme,
  onSelect,
  onActivate,
}: TreeItemProps) {
  const { colors } = theme

  let icon: string
  let iconColor: string

  if (isDirectory) {
    icon = getFolderIcon(name, isExpanded)
    iconColor = folderColor
  } else {
    const fileIcon = getFileIcon(name)
    icon = fileIcon.icon
    iconColor = fileIcon.color
  }

  const textColor = isDirectory ? folderColor : colors.foreground
  const bg = isSelected ? colors.selection : colors.background

  const handleMouseDown = () => {
    onSelect()
    onActivate()
  }

  if (isRoot) {
    return (
      <box flexDirection="row" backgroundColor={bg} onMouseDown={handleMouseDown}>
        <text fg={iconColor} bg={bg}>
          {icon}{" "}
        </text>
        <text fg={textColor} bg={bg}>
          {name}
        </text>
      </box>
    )
  }

  return (
    <box flexDirection="row" backgroundColor={bg} onMouseDown={handleMouseDown}>
      <text fg={colors.border} bg={bg}>
        {prefix}
      </text>
      <text fg={iconColor} bg={bg}>
        {icon}{" "}
      </text>
      <text fg={textColor} bg={bg}>
        {name}
      </text>
    </box>
  )
}
