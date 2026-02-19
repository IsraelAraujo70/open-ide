/**
 * TabBar Component - Horizontal tab strip for open files
 */

import type { Tab, Theme, Diagnostic } from "../../domain/types.ts"
import { store } from "../../application/store.ts"

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  diagnostics: Map<string, Diagnostic[]>
  theme: Theme
  width: number
}

export function TabBar({ tabs, activeTabId, diagnostics, theme, width }: TabBarProps) {
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
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          diagnostics={diagnostics.get(tab.bufferId) ?? []}
          theme={theme}
        />
      ))}
    </box>
  )
}

interface TabItemProps {
  tab: Tab
  isActive: boolean
  diagnostics: Diagnostic[]
  theme: Theme
}

function TabItem({ tab, isActive, diagnostics, theme }: TabItemProps) {
  const { colors } = theme
  const bg = isActive ? colors.primary : colors.background
  const fg = isActive ? colors.background : colors.foreground
  const severity = getHighestSeverity(diagnostics)
  const severityColor = getSeverityColor(theme, severity)

  const label = tab.isPinned ? `📌 ${tab.label}` : tab.label

  const handleClick = () => {
    store.dispatch({ type: "SWITCH_TAB", tabId: tab.id })
  }

  const handleClose = () => {
    store.dispatch({ type: "CLOSE_TAB", tabId: tab.id })
  }

  return (
    <box backgroundColor={bg} flexDirection="row">
      <box backgroundColor={bg} paddingLeft={1} paddingRight={1} onMouseDown={handleClick}>
        <text fg={fg} bg={bg}>
          {` ${label}`}
        </text>
        {severity && (
          <text fg={severityColor} bg={bg}>
            {" ● "}
          </text>
        )}
        {!severity && (
          <text fg={fg} bg={bg}>
            {" "}
          </text>
        )}
        <text fg={fg} bg={bg}>
          {" "}
        </text>
      </box>

      <box
        backgroundColor={bg}
        paddingLeft={1}
        paddingRight={1}
        onMouseDown={e => {
          e.stopPropagation()
          e.preventDefault()
          handleClose()
        }}
      >
        <text fg={colors.error} bg={bg}>
          ×
        </text>
      </box>
    </box>
  )
}

function getHighestSeverity(diagnostics: Diagnostic[]): Diagnostic["severity"] | null {
  let severity: Diagnostic["severity"] | null = null

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") {
      return "error"
    }
    if (diagnostic.severity === "warning") {
      severity = severity === "error" ? "error" : "warning"
      continue
    }
    if (diagnostic.severity === "info" && severity !== "warning") {
      severity = severity === "error" ? "error" : "info"
      continue
    }
    if (diagnostic.severity === "hint" && !severity) {
      severity = "hint"
    }
  }

  return severity
}

function getSeverityColor(theme: Theme, severity: Diagnostic["severity"] | null): string {
  const { colors } = theme
  switch (severity) {
    case "error":
      return colors.error
    case "warning":
      return colors.warning
    case "info":
      return colors.info
    case "hint":
      return colors.accent
    default:
      return colors.foreground
  }
}
