/**
 * CommandLine Component - Vim-style : command input
 */

import type { Theme } from "../../domain/types.ts"

interface CommandLineProps {
  value: string
  theme: Theme
  width: number
  onSubmit: (command: string) => void
  onCancel: () => void
  onChange: (value: string) => void
}

export function CommandLine({
  value,
  theme,
  width,
  onSubmit,
  onCancel,
  onChange,
}: CommandLineProps) {
  const { colors } = theme

  return (
    <box
      position="absolute"
      bottom={1}
      left={0}
      width={width}
      height={1}
      backgroundColor={colors.background}
      borderStyle="single"
      border={["top"]}
      borderColor={colors.primary}
      zIndex={100}
    >
      <text fg={colors.primary}>:</text>
      <input
        flexGrow={1}
        value={value}
        focused={true}
        backgroundColor={colors.background}
        textColor={colors.foreground}
        focusedBackgroundColor={colors.background}
        focusedTextColor={colors.foreground}
        cursorColor={colors.primary}
        onInput={onChange}
        onSubmit={() => onSubmit(value)}
        onKeyDown={key => {
          if (key.name === "escape") {
            onCancel()
          }
        }}
      />
    </box>
  )
}
