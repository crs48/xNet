// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import init, { parseSync } from '@swc/wasm-web'
import { TaskSchema } from '@xnetjs/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { extensionExamples } from './agent-extension'
import {
  containsExtensionAccess,
  requestedExtensionAccess,
  suggestedExtensionAccess
} from './extension-access'
import { inspectExtensionAccess } from './extension-access-intent'
import { readExtensionGrant } from './extension-data'

beforeAll(async () => {
  const require = createRequire(import.meta.url)
  await init({ module_or_path: await readFile(require.resolve('@swc/wasm-web/wasm_bg.wasm')) })
})
const inspect = (source: string) =>
  inspectExtensionAccess(parseSync(source, { syntax: 'typescript', tsx: true }))
const grant = () =>
  readExtensionGrant(
    JSON.stringify({
      version: 1,
      owner: 'owner',
      hash: 'build',
      channelIds: [],
      records: [{ id: 'selected', schemaId: TaskSchema._schemaId }]
    }),
    'owner',
    'build'
  )
describe('host-owned extension access suggestions', () => {
  it('requests creation and editing for the task example without asking for conversations or all existing tasks', () => {
    const intent = inspect(
      extensionExamples.find((example) => example.title === 'Selected tasks')!.source
    )
    expect(intent).toMatchObject({
      tasks: true,
      createTasks: true,
      editTasks: true,
      conversations: false,
      removeTasks: false
    })
    expect(suggestedExtensionAccess(intent, 'private-chat')).toMatchObject({
      channelIds: [],
      records: [],
      taskWrites: { ids: [], create: true, remove: false }
    })
  })
  it('recognizes renamed and namespace imports, ignores comments, strings and type-only imports', () => {
    expect(
      inspect(
        "import {useMutate as mutate} from '@xnetjs/react'; const {create: add} = mutate(); add();"
      )
    ).toMatchObject({ createTasks: true })
    expect(
      inspect(
        "import * as api from '@xnetjs/react'; const edits = api.useMutate(); edits.remove('id');"
      )
    ).toMatchObject({ removeTasks: true, createTasks: false })
    expect(
      inspect(
        "import type {TaskSchema} from '@xnetjs/data'; const message = 'useMutate create TaskSchema'; // import {useMutate} from '@xnetjs/react'\nexport default () => null;"
      )
    ).toMatchObject({ tasks: false, createTasks: false })
  })
  it('keeps documents and conversation scope explicit', () => {
    expect(
      inspect(extensionExamples.find((example) => example.title === 'Edit selected pages')!.source)
    ).toMatchObject({ readDocuments: true, editDocuments: true, conversations: false })
    const intent = inspect(
      extensionExamples.find((example) => example.title === 'Our watchlist')!.source
    )
    expect(suggestedExtensionAccess(intent, 'this-chat')).toEqual({
      channelIds: ['this-chat'],
      records: [],
      containers: undefined
    })
  })
  it('prompts only for supported operations and known record IDs, never guessed or mixed scopes', () => {
    const current = grant()
    const command = (nodeId: string) => ({
      version: 1 as const,
      id: 'request',
      operation: 'data.mutate' as const,
      operations: [{ type: 'update' as const, nodeId, properties: { completed: true } }]
    })
    expect(
      requestedExtensionAccess(command('selected'), current, [], 'chat')?.taskWrites?.ids
    ).toEqual(['selected'])
    expect(
      requestedExtensionAccess(command('created'), current, ['created'], 'chat')?.taskWrites?.ids
    ).toEqual([])
    expect(requestedExtensionAccess(command('secret'), current, [], 'chat')).toBeNull()
    expect(
      requestedExtensionAccess(
        {
          ...command('selected'),
          operations: [...command('selected').operations, ...command('secret').operations]
        },
        current,
        [],
        'chat'
      )
    ).toBeNull()
    expect(
      requestedExtensionAccess(
        {
          version: 1,
          id: 'q',
          operation: 'data.query',
          schemaId: TaskSchema._schemaId,
          options: { nodeId: 'secret' }
        },
        current,
        [],
        'chat'
      )
    ).toBeNull()
    expect(
      requestedExtensionAccess(
        {
          version: 1,
          id: 'c',
          operation: 'data.mutate',
          operations: [{ type: 'create', schemaId: 'secret', properties: { title: 'No' } }]
        },
        current,
        [],
        'chat'
      )
    ).toBeNull()
  })
  it('requires separate deletion approval and refuses permission reductions', () => {
    const current = { ...grant(), taskWrites: { ids: ['selected'], create: true, remove: false } }
    const next = requestedExtensionAccess(
      {
        version: 1,
        id: 'delete',
        operation: 'data.mutate',
        operations: [{ type: 'delete', nodeId: 'selected' }]
      },
      current,
      [],
      'chat'
    )!
    expect(next.taskWrites?.remove).toBe(true)
    expect(containsExtensionAccess(next, current)).toBe(true)
    expect(containsExtensionAccess(current, next)).toBe(false)
    expect(containsExtensionAccess({ ...next, records: [] }, current)).toBe(false)
  })
  it('offers a data choice for an unscoped query without granting a schema or guessed record', () => {
    const current = { ...grant(), records: [] }
    const request = {
      version: 1 as const,
      id: 'query',
      operation: 'data.query' as const,
      schemaId: TaskSchema._schemaId,
      options: {}
    }
    expect(requestedExtensionAccess(request, current, [], 'chat')).toEqual(current)
    expect(
      requestedExtensionAccess({ ...request, options: { nodeId: 'guessed' } }, current, [], 'chat')
    ).toBeNull()
    expect(
      requestedExtensionAccess(
        request,
        { ...current, taskWrites: { ids: [], create: true, remove: false } },
        [],
        'chat'
      )
    ).toBeNull()
  })
})

it('requests document read and write approval for a custom browser editor', () => {
  const intent = inspect(
    "import {saveDocument} from '@xnetjs/extensions/react'; export default function Editor() { return null }"
  )
  expect(intent.editDocuments).toBe(true)
  expect(intent.readDocuments).toBe(true)
})
