/**
 * CI guard (exploration 0393): the skill bundled in the first-party Claude Code
 * plugin must stay byte-identical to the canonical `XNET_AGENT_SKILL_MD` that
 * `xnet skill` prints and `xnet connect` installs. A drifted copy would teach
 * an agent stale conventions — worse than none.
 *
 * If this fails, regenerate the packaged copy:
 *   node --import tsx -e "import('../../plugins/src/ai-surface/skill.ts').then(m=>\
 *     import('node:fs/promises')).then(...)"  // or re-run scripts/agent-skill/sync
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { XNET_AGENT_SKILL_MD } from '@xnetjs/plugins/node'
import { describe, expect, it } from 'vitest'

const packagedSkillPath = fileURLToPath(
  new URL('../../plugin/skills/xnet/SKILL.md', import.meta.url)
)

describe('claude code plugin skill parity', () => {
  it('the packaged plugin SKILL.md equals the canonical skill', async () => {
    const packaged = await readFile(packagedSkillPath, 'utf8')
    expect(packaged).toBe(XNET_AGENT_SKILL_MD)
  })
})
