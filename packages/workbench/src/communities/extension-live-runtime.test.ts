// @vitest-environment node
import type { ChatPreviewNode } from './agent-extension'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { TaskSchema } from '@xnetjs/data'
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
function start(source: string) {
  const worker = new Worker(
    `const {parentPort} = require('node:worker_threads'); globalThis.self = globalThis; self.postMessage = value => parentPort.postMessage(value); self.addEventListener = () => {}; parentPort.on('message', data => self.onmessage({data})); ${runtime}`,
    { eval: true }
  )
  workers.push(worker)
  const messages: Record<string, unknown>[] = []
  const errors: Error[] = []
  worker.on('message', (message) => messages.push(message))
  worker.on('error', (error) => errors.push(error))
  const dataset = {
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
    const { worker, wait, dataset } = start(extensionExamples[2].source)
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
