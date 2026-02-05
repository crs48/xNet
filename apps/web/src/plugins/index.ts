/**
 * Bundled plugins for xNet Web
 *
 * These plugins are installed automatically on first run.
 * They serve as examples of how the plugin system works.
 */

import type { XNetExtension } from '@xnet/plugins'
import { MermaidPlugin } from './mermaid-plugin'

/**
 * List of bundled plugins to auto-install
 */
export const BUNDLED_PLUGINS: XNetExtension[] = [MermaidPlugin]
