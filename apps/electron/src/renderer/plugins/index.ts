/**
 * Bundled plugins for xNet Electron
 *
 * These plugins are installed automatically on first run.
 * They serve as examples of how the plugin system works.
 */

import type { XNetExtension } from '@xnetjs/plugins'
import { ChartsExtraPlugin } from './charts-extra-plugin'
import { MermaidPlugin } from './mermaid-plugin'

/**
 * List of bundled plugins to auto-install
 */
export const BUNDLED_PLUGINS: XNetExtension[] = [MermaidPlugin, ChartsExtraPlugin]
