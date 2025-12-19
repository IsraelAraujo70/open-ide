# OpenCode IDE - Agent Instructions

## Commands
- **Run**: `bun run index.tsx` or `bun run start`
- **Dev mode**: `bun --watch index.tsx` or `bun run dev`
- **Install deps**: `bun install`
- **Run tests**: `bun test` (single: `bun test path/to/file.test.ts`)

## Tech Stack
- **Runtime**: Bun (not Node.js) - uses `bun:test`, `Bun.file`, etc.
- **UI**: OpenTUI (`@opentui/core`, `@opentui/react`) - terminal UI framework
- **Framework**: React 19 with JSX (`jsxImportSource: @opentui/react`)

## Code Style
- **TypeScript**: Strict mode, no semicolons, 2-space indent
- **Imports**: Use `.ts` extensions, `type` imports for types only
- **Types**: Prefer interfaces, use discriminated unions for actions
- **Naming**: PascalCase components, camelCase functions, UPPER_SNAKE actions
- **Files**: kebab-case filenames, barrel exports via `index.ts`

## Architecture (Hexagonal)
- `src/domain/` - Pure types and business logic (no deps)
- `src/application/` - State store, commands, reducers
- `src/adapters/` - External integrations (filesystem, clipboard)
- `src/ui/` - React components and hooks
- `src/shared/` - Shared utilities (Tree-sitter, syntax styles)

## Error Handling
- Use try/catch with `.catch()` for async, log errors to console
- Return early for invalid state, use `| null` for optional values
