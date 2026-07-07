/**
 * Bundled plugins for xNet Web
 *
 * These plugins are installed automatically on first run.
 * They serve as examples of how the plugin system works.
 */

import type { XNetExtension } from '@xnetjs/plugins'
import { ChartsExtraPlugin } from './charts-extra-plugin'
import { MermaidPlugin } from './mermaid-plugin'
import { WorkbenchSlashPlugin } from './workbench-slash-plugin'
import { registerWorkspaceCommands, WorkspaceAgentModule } from './workspace-agent-module'

/**
 * List of bundled plugins to auto-install
 */
export const BUNDLED_PLUGINS: XNetExtension[] = [
  MermaidPlugin,
  ChartsExtraPlugin,
  WorkbenchSlashPlugin,
  WorkspaceAgentModule
]

// The workspace verbs that need no React state (undo + preset switches)
// register at module load, so agent tools work headless too (0280).
registerWorkspaceCommands()
