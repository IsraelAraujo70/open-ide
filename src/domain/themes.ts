/**
 * Default themes for Open IDE
 */

import type { Theme, ThemeColors } from "./types.ts"

const tokyoNightColors: ThemeColors = {
  background: "#1a1b26",
  foreground: "#c0caf5",
  primary: "#7aa2f7",
  secondary: "#bb9af7",
  accent: "#7dcfff",
  error: "#f7768e",
  warning: "#e0af68",
  success: "#9ece6a",
  info: "#7dcfff",
  border: "#3b4261",
  selection: "#33467c",
  lineHighlight: "#292e42",
  comment: "#565f89",
  keyword: "#bb9af7",
  string: "#9ece6a",
  number: "#ff9e64",
  function: "#7aa2f7",
  variable: "#c0caf5",
  type: "#2ac3de",
  operator: "#89ddff",
}

export const tokyoNight: Theme = {
  id: "tokyo-night",
  name: "Tokyo Night",
  type: "dark",
  colors: tokyoNightColors,
}

const catppuccinMochaColors: ThemeColors = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  primary: "#89b4fa",
  secondary: "#cba6f7",
  accent: "#94e2d5",
  error: "#f38ba8",
  warning: "#fab387",
  success: "#a6e3a1",
  info: "#89dceb",
  border: "#45475a",
  selection: "#45475a",
  lineHighlight: "#313244",
  comment: "#6c7086",
  keyword: "#cba6f7",
  string: "#a6e3a1",
  number: "#fab387",
  function: "#89b4fa",
  variable: "#cdd6f4",
  type: "#94e2d5",
  operator: "#89dceb",
}

export const catppuccinMocha: Theme = {
  id: "catppuccin-mocha",
  name: "Catppuccin Mocha",
  type: "dark",
  colors: catppuccinMochaColors,
}

const draculaColors: ThemeColors = {
  background: "#282a36",
  foreground: "#f8f8f2",
  primary: "#bd93f9",
  secondary: "#ff79c6",
  accent: "#8be9fd",
  error: "#ff5555",
  warning: "#ffb86c",
  success: "#50fa7b",
  info: "#8be9fd",
  border: "#44475a",
  selection: "#44475a",
  lineHighlight: "#44475a",
  comment: "#6272a4",
  keyword: "#ff79c6",
  string: "#f1fa8c",
  number: "#bd93f9",
  function: "#50fa7b",
  variable: "#f8f8f2",
  type: "#8be9fd",
  operator: "#ff79c6",
}

export const dracula: Theme = {
  id: "dracula",
  name: "Dracula",
  type: "dark",
  colors: draculaColors,
}

const oneLightColors: ThemeColors = {
  background: "#fafafa",
  foreground: "#383a42",
  primary: "#4078f2",
  secondary: "#a626a4",
  accent: "#0184bc",
  error: "#e45649",
  warning: "#c18401",
  success: "#50a14f",
  info: "#0184bc",
  border: "#d3d3d3",
  selection: "#e5e5e6",
  lineHighlight: "#f0f0f0",
  comment: "#a0a1a7",
  keyword: "#a626a4",
  string: "#50a14f",
  number: "#986801",
  function: "#4078f2",
  variable: "#383a42",
  type: "#0184bc",
  operator: "#383a42",
}

export const oneLight: Theme = {
  id: "one-light",
  name: "One Light",
  type: "light",
  colors: oneLightColors,
}

export const defaultThemes: Theme[] = [tokyoNight, catppuccinMocha, dracula, oneLight]

export const defaultTheme = tokyoNight
