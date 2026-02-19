# Code Rendering Refactor Plan (OpenTUI)

## Goal

Fix preview rendering issues and move to OpenTUI-native code rendering:

- line numbers overlapping content in file preview
- missing syntax colors in read-only preview
- duplicated custom rendering logic across components

## Current Problems

1. `src/ui/components/FilePicker.tsx` used manual line rendering (`map` line by line).
2. Long lines can visually collide with the gutter in terminal layout.
3. Preview was plain text (no Tree-sitter syntax style).
4. Editor and preview follow different rendering strategies.

## OpenTUI Capabilities We Can Reuse

From OpenTUI core/react:

- `code` (`CodeRenderable`) supports:
  - `content`
  - `filetype`
  - `syntaxStyle`
  - `treeSitterClient`
  - `drawUnstyledText`
- `line-number` (`LineNumberRenderable`) provides a proper gutter wrapper.

This is the direction used in this spike branch for preview.

## Spike Implemented In This Branch

Branch: `spike/opentui-code-refactor-plan`

Changes:

1. File preview now uses `line-number` + `code` in `src/ui/components/FilePicker.tsx`.
2. Tree-sitter initialization was added to preview path (`initTreeSitter` / readiness state).
3. Filetype detection now drives syntax colorization (`getFiletype` + `getSyntaxStyle`).

Expected result:

- gutter no longer corrupts long lines
- syntax colors appear for supported languages (ts/js/md/zig)

## Next Refactor Steps

1. Extract reusable read-only component:
   - `src/ui/components/CodePreview.tsx`
   - API: `content`, `path`, `theme`, `showLineNumbers`, `wrapMode`.
2. Reuse this component in:
   - FilePicker preview
   - future read-only panes (diff/output/help).
3. Keep `Editor.tsx` as `textarea` for editing behavior (undo/redo/selection).
4. Re-evaluate line-number integration for editor separately (current known instability with textarea wrapper).
5. Optional future step:
   - semantic/LSP overlays on top of syntax colors.

## Risks / Notes

1. Tree-sitter worker startup may add first-open latency in preview.
2. Unsupported filetypes render sem highlight (no syntax fallback).
3. Very large files should stay clipped (`MAX_PREVIEW_CHARS`) to preserve performance.
