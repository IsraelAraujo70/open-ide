/**
 * Explorer Component - File tree sidebar
 *
 * Features:
 * - Tree lines (├──, └──) for hierarchy visualization
 * - Color coding by file type
 * - Click to expand/collapse folders
 * - Click to open files
 * - Lazy loading of directory contents
 */

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

// Flat item for rendering
interface FlatItem {
  tree: DirectoryTree
  depth: number
  isLast: boolean
  parentPrefixes: boolean[] // true = has more siblings, false = last child
}

// Flatten the tree for easier rendering
function flattenTree(
  tree: DirectoryTree,
  depth = 0,
  isLast = true,
  parentPrefixes: boolean[] = []
): FlatItem[] {
  const items: FlatItem[] = []

  // Add current item (skip root at depth 0)
  if (depth > 0) {
    items.push({ tree, depth, isLast, parentPrefixes })
  }

  // Add children if expanded
  if (tree.entry.type === "directory" && tree.isExpanded) {
    const children = tree.children
    children.forEach((child, index) => {
      const childIsLast = index === children.length - 1
      const newPrefixes = depth === 0 ? [] : [...parentPrefixes, !isLast]
      items.push(...flattenTree(child, depth + 1, childIsLast, newPrefixes))
    })
  }

  return items
}

// Build prefix string for tree lines
function buildPrefix(item: FlatItem): string {
  let prefix = ""

  // Add continuation lines for ancestors
  for (const hasMoreSiblings of item.parentPrefixes) {
    prefix += hasMoreSiblings ? "│   " : "    "
  }

  // Add branch for current item
  prefix += item.isLast ? "└── " : "├── "

  return prefix
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

  // Flatten tree for rendering
  const flatItems = directoryTree ? flattenTree(directoryTree) : []

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
      <scrollbox flexGrow={1} focused={focused}>
        {directoryTree ? (
          <box flexDirection="column">
            {/* Root folder */}
            <TreeItem
              path={directoryTree.entry.path}
              name={directoryTree.entry.name}
              isDirectory={true}
              isExpanded={directoryTree.isExpanded}
              hasChildren={directoryTree.children.length > 0}
              prefix=""
              isRoot={true}
              theme={theme}
            />

            {/* Flat items */}
            {flatItems.map(item => (
              <TreeItem
                key={item.tree.entry.path}
                path={item.tree.entry.path}
                name={item.tree.entry.name}
                isDirectory={item.tree.entry.type === "directory"}
                isExpanded={item.tree.isExpanded}
                hasChildren={item.tree.children.length > 0}
                prefix={buildPrefix(item)}
                isRoot={false}
                theme={theme}
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
  path: string
  name: string
  isDirectory: boolean
  isExpanded: boolean
  hasChildren: boolean
  prefix: string
  isRoot: boolean
  theme: Theme
}

function TreeItem({
  path,
  name,
  isDirectory,
  isExpanded,
  hasChildren,
  prefix,
  isRoot,
  theme,
}: TreeItemProps) {
  const { colors } = theme

  // Get icon and color
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

  // IMPORTANT: Capture path in closure for click handler
  const itemPath = path

  const handleClick = async () => {
    if (isDirectory) {
      // Toggle directory expansion
      store.dispatch({ type: "TOGGLE_DIRECTORY", path: itemPath })

      // If expanding and no children loaded, load them
      if (!isExpanded && !hasChildren) {
        try {
          const children = await fileSystem.listDirectory(itemPath)
          store.dispatch({
            type: "LOAD_DIRECTORY_CHILDREN",
            path: itemPath,
            children: children.map(entry => ({
              entry,
              children: [],
              isExpanded: false,
            })),
          } as any)
        } catch (error) {
          // Silently fail - directory might not be readable
        }
      }
    } else {
      // Open file using command registry
      await commandRegistry.execute("file.open", { args: [itemPath] })
    }
  }

  if (isRoot) {
    // Root folder - special rendering
    return (
      <box flexDirection="row" onMouseDown={handleClick}>
        <text fg={iconColor}>{icon} </text>
        <text fg={textColor}>{name}</text>
      </box>
    )
  }

  return (
    <box flexDirection="row" onMouseDown={handleClick}>
      <text fg={colors.border}>{prefix}</text>
      <text fg={iconColor}>{icon} </text>
      <text fg={textColor}>{name}</text>
    </box>
  )
}
