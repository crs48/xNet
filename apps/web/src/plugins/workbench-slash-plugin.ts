/**
 * Workbench slash verbs (exploration 0280 phase 4).
 *
 * The customization slope's editor road: slash commands in any page that
 * run the SAME registered workbench commands the palette and chords run —
 * "Pin to Desk" (0273's queueDeskPin) and "Save workspace as…". No new
 * verbs, just a third road to the existing ones.
 */
import type { XNetExtension } from '@xnetjs/plugins'
import { getCommandRegistry } from '@xnetjs/plugins'

interface SlashRange {
  from: number
  to: number
}

function runAppCommand(commandId: string) {
  return ({ editor, range }: { editor: unknown; range: SlashRange }) => {
    // Remove the typed slash trigger, then hand off to the shared verb.
    const ed = editor as {
      chain: () => { focus: () => { deleteRange: (r: SlashRange) => { run: () => void } } }
    }
    ed.chain().focus().deleteRange(range).run()
    void getCommandRegistry().runCommand(commandId)
  }
}

export const WorkbenchSlashPlugin: XNetExtension = {
  id: 'fyi.xnet.workbench-verbs',
  name: 'Workbench verbs',
  version: '1.0.0',
  description: 'Slash-command road to Pin to Desk and workspace saving (0280)',
  contributes: {
    slashCommands: [
      {
        id: 'pin-to-desk',
        name: 'Pin to Desk',
        description: 'Pin this document to your Desk canvas',
        aliases: ['desk', 'pin'],
        icon: 'pin',
        execute: runAppCommand('workbench.pinToDesk')
      },
      {
        id: 'save-workspace',
        name: 'Save workspace as…',
        description: 'Keep the current shell layout as a named workspace',
        aliases: ['workspace', 'layout'],
        icon: 'layers',
        execute: runAppCommand('workspace.saveAs')
      }
    ]
  }
}
