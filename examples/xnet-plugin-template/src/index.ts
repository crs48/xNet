/**
 * Hello Plugin — a minimal xNet plugin.
 *
 * `xnet plugin scaffold com.you.your-plugin` generates a project like this one.
 * Build it (e.g. with tsup/esbuild) into a single `plugin.js`, attach that and
 * `manifest.json` to a GitHub Release, then add your repo to
 * `registry/community.json` to list it on https://xnet.fyi/plugins.
 */

import { defineExtension, type ExtensionContext } from '@xnetjs/plugins'

export default defineExtension({
  id: 'com.example.hello',
  name: 'Hello Plugin',
  version: '1.0.0',
  description: 'A minimal xNet plugin — adds a slash command.',
  author: 'Your Name',
  license: 'MIT',
  platforms: ['web', 'electron'],

  contributes: {
    slashCommands: [
      {
        id: 'hello',
        name: 'Say hello',
        description: 'Inserts a greeting',
        execute: ({ editor, range }: { editor: unknown; range: { from: number; to: number } }) => {
          const ed = editor as { chain: () => any }
          ed.chain().focus().deleteRange(range).insertContent('👋 Hello from a plugin!').run()
        }
      }
    ]
  },

  activate(ctx: ExtensionContext) {
    ctx.log?.('Hello Plugin activated')
  }
})
