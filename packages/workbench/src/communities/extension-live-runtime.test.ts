// @vitest-environment node
import type { ChatPreviewNode } from './agent-extension'
import type { ExtensionDataset } from './extension-data'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { TaskSchema, PageSchema } from '@xnetjs/data'
import { build, transformSync } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extensionExamples } from './agent-extension'

let runtime = ''
const workers: Worker[] = []
beforeAll(async () => {
  const root = process.cwd()
  const result = await build({
    entryPoints: [resolve(root, 'packages/workbench/src/communities/extension-live.worker.tsx')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      '@xnetjs/react/queries': resolve(root, 'packages/react/src/queries.ts'),
      '@xnetjs/data-bridge': resolve(root, 'packages/data-bridge/src/query-descriptor.ts'),
      '@xnetjs/ui': resolve(root, 'packages/ui/src/primitives/Badge.tsx')
    }
  })
  runtime = result.outputFiles[0].text
})
afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.terminate()))
})
function start(source: string, initial?: ExtensionDataset) {
  const worker = new Worker(
    `const {parentPort} = require('node:worker_threads'); globalThis.self = globalThis; Object.defineProperty(crypto, 'randomUUID', {value: undefined}); self.postMessage = value => parentPort.postMessage(value); self.addEventListener = () => {}; parentPort.on('message', data => self.onmessage({data})); ${runtime}`,
    { eval: true }
  )
  workers.push(worker)
  const messages: Record<string, unknown>[] = []
  const errors: Error[] = []
  worker.on('message', (message) => messages.push(message))
  worker.on('error', (error) => errors.push(error))
  const dataset: ExtensionDataset = initial ?? {
    grant: {
      version: 1,
      owner: 'did:key:owner',
      hash: 'build',
      channelIds: [],
      records: [{ id: 'task', schemaId: TaskSchema._schemaId }]
    },
    nodes: [
      {
        id: 'task',
        schemaId: TaskSchema._schemaId,
        properties: { title: 'Actual task', status: 'todo' },
        timestamps: {},
        createdAt: 1,
        updatedAt: 1,
        createdBy: 'did:key:owner',
        updatedBy: 'did:key:owner',
        deleted: false
      }
    ]
  }
  worker.postMessage({
    type: 'start',
    code: transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code,
    dataset,
    channelId: 'chat'
  })
  const wait = async (predicate: (message: Record<string, unknown>) => boolean) => {
    await expect
      .poll(
        () => {
          if (errors.length) throw errors[0]
          const failure = messages.find((m) => m.type === 'error')
          if (failure) throw new Error(String(failure.message))
          return messages.some(predicate)
        },
        { timeout: 5000 }
      )
      .toBe(true)
    return messages.find(predicate)!
  }
  return { worker, messages, wait, dataset }
}
const find = (tree: ChatPreviewNode, type: string): ChatPreviewNode | undefined =>
  tree.type === type ? tree : tree.children?.map((node) => find(node, type)).find(Boolean)
describe('persistent React extension runtime', () => {
  it('preserves explicit grids, rows, and square cells across the worker boundary', async () => {
    const { wait } = start(
      `import {Grid, Row} from '@xnetjs/extensions/ui'; export default function Test(){return <section><Grid columns={3}>{Array.from({length:9}, (_,i)=><button key={i} className="aspect-square" aria-label={'Cell '+i}>·</button>)}</Grid><Row><button>Reset</button></Row></section>}`
    )
    const view = await wait((m) => m.type === 'view')
    const grid = find(view.tree as ChatPreviewNode, 'grid')!
    expect(grid.columns).toBe(3)
    expect(grid.children).toHaveLength(9)
    expect(grid.children?.every((child) => child.square && child.type === 'button')).toBe(true)
    expect(find(view.tree as ChatPreviewNode, 'row')).toBeDefined()
  })
  it('recognizes bounded legacy grid classes without passing arbitrary CSS to the host', async () => {
    const { wait } = start(
      `export default function Test(){return <div className="grid grid-cols-3 fixed z-50"><button className="aspect-square">X</button></div>}`
    )
    const view = await wait((m) => m.type === 'view')
    expect(find(view.tree as ChatPreviewNode, 'grid')?.columns).toBe(3)
    expect(JSON.stringify(view.tree)).not.toContain('fixed')
  })

  it('renders generated navigation layouts as inert host stacks', async () => {
    const { wait } = start(
      `export default function Test(){return <section><header><h2>Browser</h2></header><nav aria-label="Message pages"><button>Next page</button></nav><footer>Page 1</footer></section>}`
    )
    const view = await wait(
      (m) => m.type === 'view' && JSON.stringify(m.tree).includes('Next page')
    )
    expect(find(view.tree as ChatPreviewNode, 'button')).toBeDefined()
    expect(JSON.stringify(view.tree)).toContain('Page 1')
  })
  it.each([
    ['<iframe src="https://example.com" />', 'Unsupported element <iframe>'],
    ['<a href="https://example.com">External</a>', 'Unsupported element <a>'],
    ['<section title="Unsupported">Text</section>', 'Unsupported property "title" on <section>']
  ])(
    'identifies rejected generated markup without expanding host access: %s',
    async (markup, error) => {
      const { messages } = start(`export default function Test(){return ${markup}}`)
      await expect.poll(() => messages.find((m) => m.type === 'error')?.message).toContain(error)
      expect(messages.some((m) => m.type === 'view')).toBe(false)
    }
  )
  it('runs real state/effect lifecycles and sends clicks back to React without executing host functions', async () => {
    const { worker, wait } = start(
      `import {useState,useEffect} from 'react'; export default function Test(){const [n,set]=useState(0);useEffect(()=>set(1),[]);return <button onClick={()=>set(x=>x+1)}>Count {n}</button>}`
    )
    const first = await wait((m) => m.type === 'view' && JSON.stringify(m.tree).includes('"1"'))
    const button = find(first.tree as ChatPreviewNode, 'button')!
    worker.postMessage({ type: 'event', event: 'click', id: button.id, revision: first.revision })
    await wait((m) => m.type === 'view' && JSON.stringify(m.tree).includes('"2"'))
  })
  it('rejects new or host-only named exports instead of returning a silent stub', async () => {
    const { messages } = start(
      "import { useXNet } from '@xnetjs/react'; const context = useXNet(); export default function Test(){return <p>Must not render</p>}"
    )
    await expect
      .poll(() => messages.find((message) => message.type === 'error')?.message)
      .toContain('Export access denied: @xnetjs/react.useXNet')
    expect(messages.some((message) => message.type === 'view')).toBe(false)
  })
  it('keeps actual useQuery live and sends actual useMutate commands through the closed protocol', async () => {
    const { worker, wait, dataset } = start(
      extensionExamples.find((example) => example.title === 'Selected tasks')!.source
    )
    const first = await wait(
      (m) => m.type === 'view' && JSON.stringify(m.tree).includes('Actual task')
    )
    worker.postMessage({
      type: 'event',
      event: 'click',
      id: find(first.tree as ChatPreviewNode, 'button')!.id,
      revision: first.revision
    })
    const command = await wait((m) => m.type === 'request')
    expect(command.request).toMatchObject({
      operation: 'data.mutate',
      operations: [
        { type: 'update', nodeId: 'task', properties: { status: 'done', completed: true } }
      ]
    })
    const next = { ...dataset.nodes[0], properties: { title: 'Actual task', status: 'done' } }
    worker.postMessage({
      type: 'result',
      id: (command.request as { id: string }).id,
      result: { batchId: 'batch', receipt: 'receipt', tempIds: {}, results: [next] }
    })
    await wait((m) => m.type === 'view' && JSON.stringify(m.tree).includes('Reopen task'))
    worker.postMessage({
      type: 'update',
      dataset: {
        ...dataset,
        nodes: [{ ...next, properties: { title: 'Changed elsewhere', status: 'done' } }]
      }
    })
    await wait((m) => m.type === 'view' && JSON.stringify(m.tree).includes('Changed elsewhere'))
  })
})

it('keeps document projections live without exposing Yjs or host handles', async () => {
  const id = 'page',
    handle = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const dataset: ExtensionDataset = {
    grant: {
      version: 1,
      owner: 'did:key:owner',
      hash: 'build',
      channelIds: [],
      records: [],
      documents: { read: [id] }
    },
    nodes: [],
    documents: [{ nodeId: id, handle, text: 'Approved document', revision: 1, editable: false }]
  }
  const { worker, wait } = start(
    `import { useDocument } from '@xnetjs/extensions/react'; import { DocumentView } from '@xnetjs/extensions/ui'; export default function Test(){ const doc = useDocument('page'); return <section><p>{doc.text}</p><DocumentView handle={doc.handle} /></section> }`,
    dataset
  )
  const first = await wait(
    (m) => m.type === 'view' && JSON.stringify(m.tree).includes('Approved document')
  )
  expect(find(first.tree as ChatPreviewNode, 'document')?.handle).toBe(handle)
  worker.postMessage({
    type: 'update',
    dataset: {
      ...dataset,
      documents: [{ ...dataset.documents![0], text: 'Live document', revision: 2 }]
    }
  })
  await wait((m) => m.type === 'view' && JSON.stringify(m.tree).includes('Live document'))
})

it('preserves structured broker failures through the actual React mutation hook', async () => {
  const { worker, wait } = start(
    `import {useState} from 'react'; import {useMutate} from '@xnetjs/extensions/react'; import {TaskSchema} from '@xnetjs/data'; export default function Test(){const [failure,setFailure]=useState(''); const {update}=useMutate(); return <section><button onClick={()=>update(TaskSchema,'task',{status:'done'}).catch(error=>setFailure(error._tag+':'+error.code))}>Try edit</button><p>{failure}</p></section>}`
  )
  const first = await wait((m) => m.type === 'view' && JSON.stringify(m.tree).includes('Try edit'))
  worker.postMessage({
    type: 'event',
    event: 'click',
    id: find(first.tree as ChatPreviewNode, 'button')!.id,
    revision: first.revision
  })
  const message = await wait((m) => m.type === 'request')
  worker.postMessage({
    type: 'result',
    id: (message.request as { id: string }).id,
    error: {
      version: 1,
      _tag: 'ExtensionAccessError',
      code: 'denied',
      message: 'No editing permission.'
    }
  })
  await wait(
    (m) => m.type === 'view' && JSON.stringify(m.tree).includes('ExtensionAccessError:denied')
  )
})

it('requests bounded host pages through real useQuery and follows opaque continuation cursors', async () => {
  const dataset: ExtensionDataset = {
    hostQueries: true,
    grant: { version: 1, owner: 'did:key:owner', hash: 'pages', channelIds: ['chat'], records: [] },
    nodes: []
  }
  const { worker, wait } = start(
    extensionExamples.find((example) => example.title === 'Conversation pages')!.source,
    dataset
  )
  const first = await wait((message) => message.type === 'request')
  expect(first.request).toMatchObject({
    operation: 'data.query',
    options: { where: { channel: 'chat' }, page: { first: 20, count: 'none' } }
  })
  const cursor = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  worker.postMessage({
    type: 'result',
    id: (first.request as { id: string }).id,
    result: {
      nodes: [],
      metadata: {
        source: 'local',
        updatedAt: 1,
        pageInfo: {
          totalCount: null,
          countMode: 'none',
          hasMore: true,
          hasNextPage: true,
          hasPreviousPage: false,
          loadedCount: 0,
          endCursor: cursor
        }
      }
    }
  })
  const view = await wait(
    (message) =>
      message.type === 'view' && find(message.tree as ChatPreviewNode, 'button')?.disabled === false
  )
  worker.postMessage({
    type: 'event',
    event: 'click',
    id: find(view.tree as ChatPreviewNode, 'button')!.id,
    revision: view.revision
  })
  await wait(
    (message) =>
      message.type === 'request' &&
      (message.request as { options?: { page?: { after?: string } } }).options?.page?.after ===
        cursor
  )
})

it('renders the editor example using only separately approved document IDs and opaque handles', async () => {
  const handle = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const dataset: ExtensionDataset = {
    grant: {
      version: 1,
      owner: 'did:key:owner',
      hash: 'editor',
      channelIds: [],
      records: [{ id: 'page', schemaId: PageSchema._schemaId }],
      containers: [{ kind: 'folder', id: 'folder', descendants: true }],
      documents: { read: ['page'], write: ['page'] }
    },
    nodes: [
      {
        id: 'page',
        schemaId: PageSchema._schemaId,
        properties: { title: 'Actual notes' },
        createdBy: 'did:key:owner',
        updatedBy: 'did:key:owner',
        createdAt: 1,
        updatedAt: 1,
        timestamps: {},
        deleted: false
      }
    ],
    documents: [
      { nodeId: 'page', handle, text: 'Notes', editorText: 'Notes', revision: 1, editable: true }
    ]
  }
  const example = extensionExamples.find((item) => item.title === 'Edit selected pages')!
  const { wait, messages } = start(example.source, dataset)
  const result = await wait(
    (message) => message.type === 'view' && JSON.stringify(message.tree).includes('Actual notes')
  )
  expect(find(result.tree as ChatPreviewNode, 'document-editor')?.handle).toBe(handle)
  expect(messages.some((message) => message.type === 'request')).toBe(false)
})
