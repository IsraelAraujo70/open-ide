/**
 * TabBar Component - Horizontal tab strip for open files
 */

import type { Tab, Theme } from "../../domain/types.ts"
import { store } from "../../application/store.ts"

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  theme: Theme
  width: number
}

export function TabBar({ tabs, activeTabId, theme, width }: TabBarProps) {
  const { colors } = theme

  if (tabs.length === 0) {
    return (
      <box
        height={1}
        width={width}
        backgroundColor={colors.background}
        borderStyle="single"
        border={["bottom"]}
        borderColor={colors.border}
      >
        <text fg={colors.comment}>No files open</text>
      </box>
    )
  }

  return (
    <box
      height={1}
      width={width}
      backgroundColor={colors.background}
      flexDirection="row"
      borderStyle="single"
      border={["bottom"]}
      borderColor={colors.border}
    >
      {tabs.map(tab => (
        <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} theme={theme} />
      ))}
    </box>
  )
}

interface TabItemProps {
  tab: Tab
  isActive: boolean
  theme: Theme
}

function TabItem({ tab, isActive, theme }: TabItemProps) {
  const { colors } = theme
  const bg = isActive ? colors.primary : colors.background
  const fg = isActive ? colors.background : colors.foreground

  const label = tab.isPinned ? `📌 ${tab.label}` : tab.label

  const handleClick = () => {
    store.dispatch({ type: "SWITCH_TAB", tabId: tab.id })
  }

  const handleClose = () => {
    store.dispatch({ type: "CLOSE_TAB", tabId: tab.id })
  }

  return (
    <box backgroundColor={bg} paddingLeft={1} paddingRight={1} onMouseDown={handleClick}>
      <text fg={fg} bg={bg}>
        {` ${label} `}
      </text>
      <text
        fg={colors.error}
        bg={bg}
        onMouseDown={e => {
          e.stopPropagation()
          handleClose()
        }}
      >
        ×
      </text>
    </box>
  )
}
