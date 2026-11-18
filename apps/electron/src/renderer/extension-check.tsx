import type {
  ExtensionCheckAction,
  ExtensionCheckDriver,
  ExtensionCheckObservation
} from '../../../../packages/workbench/src/communities/extension-check-contract'
import type { ExtensionSession } from '../../../../packages/workbench/src/communities/extension-sandbox'
import {
  compileChatExtension,
  startChatExtension
} from '../../../../packages/workbench/src/communities/extension-sandbox'

// Trusted test controller; generated code runs in a separate WebContentsView.
const container = document.getElementById('root')!
Object.assign(document.body.style, { margin: '0' })
Object.assign(container.style, { width: '100vw', height: '100vh' })
let session: ExtensionSession | null = null,
  source = '',
  generation = 0,
  rendered = false,
  requiresData = false
let errors: string[] = []
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 180))
const observe = async (): Promise<ExtensionCheckObservation> => {
  const observation = await session?.observe?.()
  return observation
    ? {
        ...observation,
        requiresData: requiresData || observation.requiresData,
        errors: [...errors, ...observation.errors]
      }
    : {
        tree: null,
        rendered: false,
        text: '',
        controls: [],
        errors,
        width: innerWidth,
        height: innerHeight,
        overflow: false,
        requiresData
      }
}
async function start(nextSource: string) {
  const current = ++generation
  session?.stop()
  session = null
  source = nextSource
  errors = []
  rendered = false
  requiresData = false
  try {
    const build = await compileChatExtension(source)
    requiresData = Object.values(build.access).some(Boolean)
    if (current !== generation) throw new Error('The test copy changed during compilation.')
    session = startChatExtension(
      build.code,
      {
        nodes: [],
        documents: [],
        hostQueries: true,
        grant: { version: 1, owner: 'preview-test', hash: build.hash, channelIds: [], records: [] }
      },
      'preview-test',
      {
        view: () => {
          rendered = true
        },
        error: (error) => errors.push(error.message),
        request: async () => {
          requiresData = true
          throw new Error(
            'Personal data is unavailable in this test copy. Verify after granting access.'
          )
        }
      }
    )
    session.mount?.(container)
    const deadline = Date.now() + 5000
    while (!rendered && !errors.length && Date.now() < deadline) await settle()
    if (!rendered && !errors.length)
      errors.push('The extension did not render within five seconds.')
    await settle()
  } catch (error) {
    errors.push(String(error))
  }
  return observe()
}
async function action(action: ExtensionCheckAction) {
  if (action.type === 'reset') return start(source)
  if (!session?.act || errors.length) throw new Error('The test copy is unavailable.')
  await session.act(action)
  await settle()
  const result = await observe()
  if (action.expectText && !result.text.includes(action.expectText))
    throw new Error(`Expected visible text: ${action.expectText}`)
  return result
}
Object.defineProperty(window, '__xnetExtensionCheck', {
  value: { start, observe, action } satisfies ExtensionCheckDriver
})
