/**
 * Shared utilities and services
 */

export {
  getTreeSitter,
  initTreeSitter,
  setTreeSitterWorkspaceRoot,
  isTreeSitterReady,
  getFiletype,
  destroyTreeSitter,
} from "./treeSitter.ts"

export { createSyntaxStyleFromTheme, getSyntaxStyle, clearStyleCache } from "./syntaxStyle.ts"
