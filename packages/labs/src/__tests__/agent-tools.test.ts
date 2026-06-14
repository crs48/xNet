import { describe, expect, it } from 'vitest'
import { createLabAgentTools } from '../agent-tools'
import type { LabAgentBackend } from '../agent-tools'
import type { LabNode } from '../schema'
import { RuntimeLadder } from '../runtime/ladder'
import { sesRuntime } from '../runtime/runtimes'

function ladder(): RuntimeLadder {
  return new RuntimeLadder([sesRuntime])
}

describe('createLabAgentTools', () => {
  it('exposes lab_run with an MCP-shaped schema', () => {
    const tools = createLabAgentTools({ ladder: ladder() })
    const run = tools.find((t) => t.name === 'lab_run')!
    expect(run).toBeDefined()
    expect(run.inputSchema.type).toBe('object')
    expect(run.inputSchema.required).toContain('code')
    expect(run.inputSchema.properties.language.enum).toContain('rust')
  })

  it('runs code via lab_run and returns the output', async () => {
    const tools = createLabAgentTools({ ladder: ladder() })
    const run = tools.find((t) => t.name === 'lab_run')!
    const result = (await run.invoke({ code: 'console.log("hi"); return 2 + 3' })) as {
      ok: boolean
      value: unknown
    }
    expect(result.ok).toBe(true)
    expect(result.value).toBe(5)
  })

  it('omits persistence tools without a backend', () => {
    const names = createLabAgentTools({ ladder: ladder() }).map((t) => t.name)
    expect(names).toEqual(['lab_run'])
  })

  it('adds create/get/list/run_saved with a backend, and run_saved executes saved code', async () => {
    const labs = new Map<string, LabNode>()
    let counter = 0
    const backend: LabAgentBackend = {
      createLab: async ({ title, code, language, runtime }) => {
        const id = `lab-${++counter}`
        labs.set(id, { id, title, code, language, runtime })
        return { id }
      },
      getLab: async (id) => labs.get(id) ?? null,
      listLabs: async () =>
        [...labs.values()].map(({ id, title, language, runtime }) => ({
          id,
          title,
          language,
          runtime
        }))
    }
    const tools = createLabAgentTools({ ladder: ladder(), backend })
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['lab_create', 'lab_get', 'lab_list', 'lab_run', 'lab_run_saved'].sort()
    )

    const created = (await tools
      .find((t) => t.name === 'lab_create')!
      .invoke({ title: 'Doubler', code: 'return 21 * 2' })) as { id: string }
    const ran = (await tools
      .find((t) => t.name === 'lab_run_saved')!
      .invoke({ id: created.id })) as { ok: boolean; value: unknown }
    expect(ran.ok).toBe(true)
    expect(ran.value).toBe(42)

    const missing = (await tools
      .find((t) => t.name === 'lab_run_saved')!
      .invoke({ id: 'nope' })) as { ok: boolean; error: string }
    expect(missing.ok).toBe(false)
  })
})
