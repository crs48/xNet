#!/usr/bin/env node
/**
 * Render + capture the targets in capture-set.json.
 *
 *   node scripts/visuals/capture.mjs \
 *     --set capture-set.json \
 *     --out tmp/visuals \
 *     --storybook-static storybook-static \
 *     --web-url http://127.0.0.1:5173
 *
 * - Stories: served from the static Storybook build, screenshot per story.
 * - Routes:  the live web app via the test-bypass identity, screenshot per route.
 * - Flows:   a scripted interaction recorded to webm, then encoded to gif+mp4.
 *
 * Every target is isolated in try/catch: this job is informational, so one bad
 * target must never sink the rest. Produces <out>/manifest.json.
 */
import { chromium, _electron as electron } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { serveStatic } from './lib/static-server.mjs'
import { encodeClip, hasFfmpeg } from './lib/ffmpeg.mjs'
import { FLOWS } from './flows.mjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const setPath = arg('set', 'capture-set.json')
const outDir = arg('out', 'tmp/visuals')
const sbStatic = arg('storybook-static', 'storybook-static')
const webUrl = arg('web-url', process.env.WEB_BASE_URL || '')
// 0238 L5: the Electron binary to drive (the `electron` package's exe for the
// unpacked app, or a packaged binary), and the unpacked app dir to load.
const electronBinary = arg('electron-binary', process.env.XNET_ELECTRON_BINARY || '')
const electronApp = arg('electron-app', process.env.XNET_ELECTRON_APP || '')

const set = JSON.parse(readFileSync(setPath, 'utf8'))
const VIEWPORT = { width: 1280, height: 800 }

const NO_MOTION = `*,*::before,*::after{transition:none!important;animation:none!important;
  caret-color:transparent!important;scroll-behavior:auto!important}`

// Carry the coverage-gap signal (exploration 0200) from the capture set through
// to the diff/comment stages: if `home` is here only because nothing specific
// matched, the comment flags it instead of reporting "no visual differences".
const manifest = {
  stories: [],
  routes: [],
  flows: [],
  electron: [],
  fallbackUsed: set.fallbackUsed ?? false,
  unmappedFiles: set.unmappedFiles ?? []
}
mkdirSync(outDir, { recursive: true })

async function settle(page) {
  await page.addStyleTag({ content: NO_MOTION }).catch(() => {})
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
  await page.waitForTimeout(300)
}

// --- Stories -------------------------------------------------------------
async function captureStories(browser) {
  if (!set.stories?.length) return
  if (!existsSync(join(sbStatic, 'iframe.html'))) {
    console.error(
      `[capture] no Storybook build at ${sbStatic}; skipping ${set.stories.length} stories`
    )
    return
  }
  const server = await serveStatic(sbStatic)
  const dir = join(outDir, 'stories')
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  try {
    for (const story of set.stories) {
      const page = await ctx.newPage()
      try {
        await page.goto(`${server.url}/iframe.html?id=${story.id}&viewMode=story`, {
          waitUntil: 'load',
          timeout: 30_000
        })
        const root = page.locator('#storybook-root')
        await root.waitFor({ state: 'visible', timeout: 15_000 })
        await page.waitForFunction(
          () => {
            const el = document.querySelector('#storybook-root')
            return el && el.children.length > 0
          },
          { timeout: 15_000 }
        )
        await settle(page)
        const file = join(dir, `${story.id}.png`)
        await root.screenshot({ path: file })
        manifest.stories.push({
          id: story.id,
          title: story.title,
          name: story.name,
          file: relative(outDir, file)
        })
        console.error(`[capture] story ${story.id}`)
      } catch (err) {
        console.error(`[capture] story ${story.id} FAILED: ${err.message}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await ctx.close()
    await server.close()
  }
}

// --- App preparation (shared by routes + flows) --------------------------
async function newAppContext(browser, recordVideoDir) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    ...(recordVideoDir ? { recordVideo: { dir: recordVideoDir, size: VIEWPORT } } : {})
  })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('xnet:test:bypass', 'true')
    } catch {}
  })
  return ctx
}

async function gotoHome(page) {
  await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#root')
      return root && !root.textContent?.includes('Initializing')
    },
    { timeout: 30_000 }
  )
  // Advance any onboarding to reach the workbench home.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400)
    const start = page.getByRole('button', { name: /Get started/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      continue
    }
    const create = page.getByRole('button', { name: /create your first page/i })
    if ((await create.count()) > 0 && (await create.first().isVisible())) {
      await create.first().click()
      break
    }
    break
  }
}

// --- Routes --------------------------------------------------------------
async function captureRoutes(browser) {
  if (!set.routes?.length || !webUrl) return
  const dir = join(outDir, 'routes')
  mkdirSync(dir, { recursive: true })
  const ctx = await newAppContext(browser)
  try {
    const page = await ctx.newPage()
    await gotoHome(page)
    for (const route of set.routes) {
      try {
        const target = new URL(route.path, webUrl).toString()
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await settle(page)
        await page.waitForTimeout(600)
        const file = join(dir, `${route.id}.png`)
        await page.screenshot({ path: file, fullPage: true })
        manifest.routes.push({ id: route.id, label: route.label, file: relative(outDir, file) })
        console.error(`[capture] route ${route.id} (${route.path})`)
      } catch (err) {
        console.error(`[capture] route ${route.id} FAILED: ${err.message}`)
      }
    }
  } finally {
    await ctx.close()
  }
}

// --- Flows ---------------------------------------------------------------
async function captureFlows(browser) {
  if (!set.flows?.length || !webUrl) return
  if (!hasFfmpeg()) {
    console.error('[capture] ffmpeg not found; skipping flow encoding')
    return
  }
  const dir = join(outDir, 'flows')
  const rawDir = join(dir, 'raw')
  mkdirSync(rawDir, { recursive: true })
  for (const flowRef of set.flows) {
    const flow = FLOWS[flowRef.id]
    if (!flow) {
      console.error(`[capture] flow ${flowRef.id} has no runner; skipping`)
      continue
    }
    const ctx = await newAppContext(browser, rawDir)
    const page = await ctx.newPage()
    let webm = null
    try {
      await gotoHome(page)
      await flow.run(page)
      webm = await page.video()?.path()
    } catch (err) {
      console.error(`[capture] flow ${flowRef.id} FAILED: ${err.message}`)
    } finally {
      await ctx.close() // finalizes the webm
    }
    if (!webm || !existsSync(webm)) continue
    try {
      const outBase = join(dir, flowRef.id)
      const { gif, mp4, poster } = encodeClip(webm, outBase)
      manifest.flows.push({
        id: flowRef.id,
        label: flow.label,
        gif: relative(outDir, gif),
        mp4: relative(outDir, mp4),
        poster: relative(outDir, poster)
      })
      console.error(`[capture] flow ${flowRef.id} -> gif+mp4`)
    } catch (err) {
      console.error(`[capture] flow ${flowRef.id} encode FAILED: ${err.message}`)
    }
  }
  // Drop the raw webms from the published tree.
  for (const f of readdirSync(rawDir)) {
    if (f.endsWith('.webm')) {
      try {
        rmSync(join(rawDir, f))
      } catch {}
    }
  }
}

// --- Electron desktop screens (0238 L5) -----------------------------------
// Launch the real desktop app via _electron.launch() and screenshot the core
// canvas surfaces, so desktop UI flows through the same SSIM diff + comment as
// web routes/stories. Like every other target, fully isolated in try/catch:
// one bad screen never sinks the rest of this informational job.
async function captureElectron() {
  if (!set.electron?.length || !electronBinary) return
  const sandboxArgs = process.env.XNET_ELECTRON_NO_SANDBOX === '1' ? ['--no-sandbox'] : []
  const dir = join(outDir, 'electron')
  mkdirSync(dir, { recursive: true })

  const app = await electron.launch({
    executablePath: electronBinary,
    args: electronApp ? [electronApp, ...sandboxArgs] : sandboxArgs,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      XNET_TEST_BYPASS: 'true',
      XNET_PROFILE: 'visuals-electron'
    }
  })

  try {
    const win = await app.firstWindow()
    await win.waitForFunction(() => Boolean(document.querySelector('#root')), undefined, {
      timeout: 60_000
    })
    // Advance any first-run onboarding to reach the canvas shell.
    for (let i = 0; i < 4; i++) {
      const getStarted = win.getByRole('button', { name: /Get started with/i })
      const createFirst = win.getByRole('button', { name: /Create your first page/i })
      if ((await getStarted.count()) > 0 && (await getStarted.first().isVisible())) {
        await getStarted.first().click()
        await win.waitForTimeout(700)
        continue
      }
      if ((await createFirst.count()) > 0 && (await createFirst.first().isVisible())) {
        await createFirst.first().click()
        await win.waitForTimeout(700)
        continue
      }
      break
    }
    await win
      .locator('[data-action-dock="canvas-home"] [data-action-dock-button="page"]')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => {})

    const dockButton = (kind) =>
      win.locator(`[data-action-dock="canvas-home"] [data-action-dock-button="${kind}"]`)

    for (const target of set.electron) {
      try {
        if (target.screen === 'canvas-objects') {
          for (const kind of ['page', 'database', 'note']) {
            await dockButton(kind).click({ force: true }).catch(() => {})
            await win.waitForTimeout(300)
          }
        }
        await settle(win)
        await win.waitForTimeout(400)
        const file = join(dir, `${target.id}.png`)
        await win.screenshot({ path: file })
        manifest.electron.push({ id: target.id, label: target.label, file: relative(outDir, file) })
        console.error(`[capture] electron ${target.id} (${target.screen})`)
      } catch (err) {
        console.error(`[capture] electron ${target.id} FAILED: ${err.message}`)
      }
    }
  } finally {
    await app.close()
  }
}

const browser = await chromium.launch()
try {
  await captureStories(browser)
  await captureRoutes(browser)
  await captureFlows(browser)
} finally {
  await browser.close()
}
try {
  await captureElectron()
} catch (err) {
  console.error(`[capture] electron capture FAILED: ${err.message}`)
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.error(
  `[capture] done: ${manifest.stories.length} stories, ${manifest.routes.length} routes, ` +
    `${manifest.flows.length} flows, ${manifest.electron.length} electron`
)
