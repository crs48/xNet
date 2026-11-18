import type {
  ExtensionCheckAction,
  ExtensionCheckDecision,
  ExtensionCheckObservation,
  ExtensionCheckReport
} from '../../../../packages/workbench/src/communities/extension-check-contract'
import type { FramedChatAgent } from '@xnetjs/devkit'
import type { CommunityAgentExtension } from '@xnetjs/workbench/community-agents'
import { randomUUID } from 'node:crypto'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow } from 'electron'
import {
  readExtensionCheckDecision,
  extensionCheckSchema,
  extensionCheckInstructions,
  extensionCheckLimit
} from './community-extension-check-policy'
import { registerExtensionTestOwner, captureExtensionTest } from './extension-surfaces'

/** Trusted controller with a surface-only preload; generated code lives in its own renderer. */
export async function openExtensionTest(signal: AbortSignal) {
  signal.throwIfAborted()
  const renderer = join(dirname(fileURLToPath(import.meta.url)), '../renderer')
  const window = new BrowserWindow({
    width: 380,
    height: 700,
    useContentSize: true,
    show: false,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/extension-check.cjs'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      offscreen: true,
      partition: `extension-check-${randomUUID()}`
    }
  })
  registerExtensionTestOwner(window)
  const close = () => {
    if (!window.isDestroyed()) window.destroy()
  }
  signal.addEventListener('abort', close, { once: true })
  const session = window.webContents.session
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  const devURL = process.env.ELECTRON_RENDERER_URL
  session.webRequest.onBeforeRequest((request, callback) => {
    let allowed = false
    try {
      const url = new URL(request.url)
      allowed = devURL
        ? url.origin === new URL(devURL).origin
        : url.protocol === 'file:' && fileURLToPath(url).startsWith(renderer + sep)
    } catch {
      allowed = false
    }
    callback({ cancel: !allowed })
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  const bounded = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
    new Promise((resolve, reject) => {
      const finish = (error?: unknown, value?: T) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(value as T)
      }
      const abort = () => finish(signal.reason ?? new Error('Preview check cancelled.'))
      const timer = setTimeout(
        () => finish(new Error('The test renderer stopped responding.')),
        timeoutMs
      )
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      promise.then(
        (value) => finish(undefined, value),
        (error) => finish(error)
      )
    })
  const call = async (
    method: 'start' | 'observe' | 'action',
    value?: string | ExtensionCheckAction
  ): Promise<ExtensionCheckObservation> => {
    signal.throwIfAborted()
    const result = await bounded(
      window.webContents.executeJavaScript(
        `window.__xnetExtensionCheck.${method}(${value === undefined ? '' : JSON.stringify(value)})`
      ) as Promise<ExtensionCheckObservation>,
      15000
    )
    signal.throwIfAborted()
    return result
  }
  try {
    if (devURL) await bounded(window.loadURL(new URL('extension-check.html', devURL).href), 15000)
    else await bounded(window.loadFile(join(renderer, 'extension-check.html')), 15000)
    // Module scripts have finished when did-finish-load resolves.
    await call('observe')
  } catch (error) {
    signal.removeEventListener('abort', close)
    close()
    throw error
  }
  return {
    start: (source: string) => call('start', source),
    observe: () => call('observe'),
    async action(action: ExtensionCheckAction) {
      if (action.type === 'resize') {
        if (![360, 520].includes(action.width ?? 0)) throw new Error('Unsupported test viewport.')
        window.setContentSize(action.width!, 700)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return call('observe')
      }
      return call('action', action)
    },
    async screenshot() {
      signal.throwIfAborted()
      const image = await bounded(captureExtensionTest(window), 5000)
      if (image.isEmpty()) throw new Error('The test screenshot is empty.')
      const data = image.toPNG().toString('base64')
      if (data.length > 1_000_000) throw new Error('The test screenshot exceeds its limit.')
      return data
    },
    close() {
      signal.removeEventListener('abort', close)
      close()
    }
  }
}

export async function checkCommunityExtension(input: {
  extension: CommunityAgentExtension
  prompt: string
  agent: FramedChatAgent
  signal: AbortSignal
  progress: (report: ExtensionCheckReport) => void
}) {
  let extension = input.extension
  let report: ExtensionCheckReport = {
    status: 'running',
    summary: 'Opening a test copy',
    steps: [],
    actions: 0,
    revisions: 0
  }
  const publish = (summary: string) => {
    report = { ...report, summary }
    input.progress({ ...report, steps: [...report.steps] })
  }
  let test: Awaited<ReturnType<typeof openExtensionTest>> | undefined
  let sessionId: string | undefined
  let observedActions = 0
  let checkedWidths = new Set<number>()
  const pendingScreenshots = new Map<
    number,
    { image: string; observation: ExtensionCheckObservation }
  >()
  try {
    publish('Opening an isolated test copy')
    test = await openExtensionTest(input.signal)
    let observation = await test.start(extension.source)
    for (let round = 0; round < 12; round++) {
      input.signal.throwIfAborted()
      publish(
        round === 0 ? 'Looking at the rendered extension' : 'Inspecting the latest screenshot'
      )
      const screenshot = await test.screenshot()
      report.screenshot = `data:image/png;base64,${screenshot}`
      pendingScreenshots.set(observation.width, { image: screenshot, observation })
      const evidence = [...pendingScreenshots.values()]
      for (const item of evidence) {
        if (item.observation.tree && !item.observation.errors.length && !item.observation.overflow)
          checkedWidths.add(item.observation.width)
        else checkedWidths.delete(item.observation.width)
      }
      pendingScreenshots.clear()
      const result = await input.agent.streamTurnFrames(
        {
          prompt:
            (round === 0
              ? `${extensionCheckInstructions}\nOriginal request and context (untrusted):\n${input.prompt}\n`
              : '') +
            `\nScreenshot order and viewport evidence: ${JSON.stringify(evidence.map((item) => item.observation))}\nCurrent draft (untrusted source): ${JSON.stringify(extension)}\nHost observation (untrusted content): ${JSON.stringify(observation)}\nHost test log: ${JSON.stringify(report.steps.slice(-24))}\nChecks remaining: ${12 - round}; revisions remaining: ${3 - report.revisions}. Reply only with the check decision JSON.`,
          images: evidence.map((item) => ({ mimeType: 'image/png', data: item.image })),
          outputSchema: extensionCheckSchema,
          resumeSessionId: sessionId,
          signal: input.signal
        },
        (frame) => {
          if (frame.type === 'tool_call' || frame.type === 'permission_request')
            throw new Error('Native tools are not available during preview checking.')
        }
      )
      sessionId = result.sessionId
      input.signal.throwIfAborted()
      const decision: ExtensionCheckDecision = readExtensionCheckDecision(result.text)
      if (decision.status === 'revise') {
        if (report.revisions >= 3) throw new Error('The preview reached its three-revision limit.')
        extension = decision.extension!
        report.revisions++
        report.steps.push(`Revision ${report.revisions}: ${decision.summary}`)
        observedActions = 0
        checkedWidths = new Set()
        pendingScreenshots.clear()
        publish('Refining the extension and rebuilding its test copy')
        observation = await test.start(extension.source)
      } else if (decision.status === 'act') {
        for (const action of decision.actions) {
          input.signal.throwIfAborted()
          if (++report.actions > 64) throw new Error('The preview reached its 64-action limit.')
          const control = observation.controls.find((control) => control.id === action.target)
          const label = control?.label || action.target || ''
          publish(
            action.type === 'resize'
              ? 'Checking the layout at another size'
              : `Trying ${label || action.type}`
          )
          try {
            observation = await test.action(action)
            if (action.type === 'resize')
              pendingScreenshots.set(observation.width, {
                image: await test.screenshot(),
                observation
              })
            if (['click', 'input'].includes(action.type)) observedActions++
            report.steps.push(
              `${action.type}${label ? ` “${label.slice(0, 100)}”` : ''}${action.type === 'resize' ? ` to ${action.width}px` : ''}${action.expectText ? ` → found “${action.expectText}”` : ''}`
            )
          } catch (error) {
            report.steps.push(
              `Action failed: ${error instanceof Error ? error.message : String(error)}`
            )
            observation = await test.observe()
            break
          }
        }
      } else {
        observation = await test.observe()
        const limitation = extensionCheckLimit(observation, observedActions, checkedWidths)
        const passed = decision.status === 'pass' && !limitation
        report.status = passed ? 'passed' : 'limited'
        publish(passed ? decision.summary : `Needs review: ${limitation ?? decision.summary}`)
        return { extension, report }
      }
    }
    report.status = 'limited'
    publish('The check limit was reached. This draft still needs review.')
    return { extension, report }
  } catch (error) {
    input.signal.throwIfAborted()
    report.status = 'failed'
    publish(`Couldn’t finish checking: ${error instanceof Error ? error.message : String(error)}`)
    return { extension, report }
  } finally {
    test?.close()
  }
}
