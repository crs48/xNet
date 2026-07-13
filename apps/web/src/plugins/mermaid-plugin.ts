/**
 * Mermaid Diagrams Plugin
 *
 * Adds a slash command for Mermaid diagrams. The mermaid block spec itself
 * is statically bundled in @xnetjs/editor's BlockNote schema (0312 —
 * schema-defining specs must ship on every peer to avoid schema skew), so
 * this plugin contributes behavior only and otherwise serves as the
 * discoverable metadata entry for the feature.
 */

import type { XNetExtension } from '@xnetjs/plugins'

export const MermaidPlugin: XNetExtension = {
  id: 'fyi.xnet.mermaid',
  name: 'Mermaid Diagrams',
  version: '1.0.0',
  description: 'Add flowcharts, sequence diagrams, class diagrams, and more using Mermaid syntax.',
  author: 'xNet',
  platforms: ['electron', 'web'],

  contributes: {
    slashCommands: [
      {
        id: 'mermaid',
        name: 'Mermaid Diagram',
        description: 'Insert a Mermaid diagram (flowchart, sequence, etc.)',
        aliases: ['diagram', 'flowchart', 'sequence', 'chart'],
        icon: 'git-branch',
        execute: ({ editor }: { editor: unknown; range: { from: number; to: number } }) => {
          // SlashCommandContext types the editor as unknown; narrow to the
          // minimal BlockNote surface we need (0312).
          const ed = editor as {
            getTextCursorPosition: () => { block: unknown }
            insertBlocks: (
              blocks: Array<{ type: string }>,
              referenceBlock: unknown,
              placement: 'before' | 'after'
            ) => void
          }
          ed.insertBlocks([{ type: 'mermaid' }], ed.getTextCursorPosition().block, 'after')
        }
      }
    ]
  }
}
