/**
 * Mermaid Diagrams Plugin
 *
 * Adds support for Mermaid diagrams in the editor.
 * This is an example of a bundled plugin that demonstrates
 * how the xNet plugin system works.
 */

import type { XNetExtension } from '@xnet/plugins'
import { MermaidExtension } from '@xnet/editor/extensions'

export const MermaidPlugin: XNetExtension = {
  id: 'fyi.xnet.mermaid',
  name: 'Mermaid Diagrams',
  version: '1.0.0',
  description: 'Add flowcharts, sequence diagrams, class diagrams, and more using Mermaid syntax.',
  author: 'xNet',
  platforms: ['electron', 'web'],

  contributes: {
    editorExtensions: [
      {
        id: 'mermaid',
        // Cast to any to avoid TipTap version conflicts between packages
        extension: MermaidExtension as any,
        priority: 100
      }
    ],
    slashCommands: [
      {
        id: 'mermaid',
        name: 'Mermaid Diagram',
        description: 'Insert a Mermaid diagram (flowchart, sequence, etc.)',
        aliases: ['diagram', 'flowchart', 'sequence', 'chart'],
        icon: 'git-branch',
        execute: ({ editor, range }: { editor: unknown; range: { from: number; to: number } }) => {
          // editor is typed as unknown in SlashCommandContext, cast to any for .chain()
          ;(editor as any).chain().focus().deleteRange(range).setMermaid().run()
        }
      }
    ]
  }
}
