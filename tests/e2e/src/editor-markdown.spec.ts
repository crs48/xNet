import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

async function advanceOnboarding(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500)

    const start = page.getByRole('button', { name: /Get started/i })
    if ((await start.count()) > 0 && (await start.first().isVisible())) {
      await start.first().click()
      await page.waitForTimeout(1500)
      continue
    }

    const createPage = page.getByRole('button', { name: /create your first page/i })
    if ((await createPage.count()) > 0 && (await createPage.first().isVisible())) {
      await createPage.first().click()
      await page.waitForTimeout(1500)
      break
    }

    const homeHeading = page.getByRole('heading', { name: /all documents/i })
    const pagesText = page.getByText('Pages', { exact: true })
    if (
      ((await homeHeading.count()) > 0 && (await homeHeading.first().isVisible())) ||
      ((await pagesText.count()) > 0 && (await pagesText.first().isVisible()))
    ) {
      break
    }

    break
  }
}

async function createBlankPage(page: Page) {
  await setupTestAuth(page)
  await advanceOnboarding(page)
  await expect(
    page
      .getByRole('heading', { name: /all documents/i })
      .or(page.getByText('Pages', { exact: true }))
  ).toBeVisible({ timeout: 30_000 })

  const main = page.getByRole('main')
  await main.getByRole('button', { name: /^New$/i }).click()
  await main.getByRole('button', { name: /^Page$/ }).click()
  await page.waitForURL(/\/doc\//, { timeout: 30_000 })

  const editor = page.locator('[contenteditable="true"]').first()
  await expect(editor).toBeVisible()
  return editor
}

async function selectEditorText(
  page: Page,
  text: string,
  range: { start: number; end: number }
): Promise<void> {
  await page.evaluate(
    ({ text: targetText, range: targetRange }) => {
      const editor = document.querySelector<HTMLElement>('.ProseMirror')
      if (!editor) {
        throw new Error('Could not find ProseMirror editor')
      }

      editor.focus()

      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let textNode: Node | null = null
      let textIndex = -1

      while (walker.nextNode()) {
        const current = walker.currentNode
        const content = current.textContent ?? ''
        const index = content.indexOf(targetText)
        if (index >= 0) {
          textNode = current
          textIndex = index
          break
        }
      }

      if (!textNode || textIndex < 0) {
        throw new Error(`Could not find text node containing "${targetText}"`)
      }

      const documentRange = document.createRange()
      documentRange.setStart(textNode, textIndex + targetRange.start)
      documentRange.setEnd(textNode, textIndex + targetRange.end)

      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(documentRange)
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
    },
    { text, range }
  )

  await page.waitForTimeout(100)
}

async function moveCaretToBlockStart(page: Page, text: string): Promise<void> {
  await selectEditorText(page, text, { start: 0, end: 0 })
}

test.describe('Editor Markdown live editing', () => {
  test.skip(({ browserName, isMobile }) => browserName === 'webkit' || isMobile)

  test('heading syntax stays visible and backspaces one marker at a time', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('### Roadmap')

    await expect(page.locator('h3', { hasText: 'Roadmap' })).toBeVisible()
    await expect(page.locator('.heading-syntax').filter({ hasText: '###' }).first()).toBeVisible()

    await moveCaretToBlockStart(page, 'Roadmap')
    await page.keyboard.press('Backspace')
    await expect(page.locator('h2', { hasText: 'Roadmap' })).toBeVisible()
    await expect(page.locator('.heading-syntax').filter({ hasText: '##' }).first()).toBeVisible()

    await page.keyboard.press('Backspace')
    await expect(page.locator('h1', { hasText: 'Roadmap' })).toBeVisible()
    await expect(page.locator('.heading-syntax').filter({ hasText: '#' }).first()).toBeVisible()

    await page.keyboard.press('Backspace')
    await expect(page.locator('p', { hasText: 'Roadmap' })).toBeVisible()
    await expect(page.locator('h1, h2, h3').filter({ hasText: 'Roadmap' })).toHaveCount(0)

    await page.screenshot({
      path: 'tmp/playwright/editor-markdown-heading-backspace.png',
      fullPage: true
    })
  })

  test('arrow keys move inline mark typing context in and out', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('bold')
    await selectEditorText(page, 'bold', { start: 0, end: 'bold'.length })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+B' : 'Control+B')

    await expect(page.locator('strong', { hasText: 'bold' })).toBeVisible()

    await selectEditorText(page, 'bold', { start: 'bold'.length, end: 'bold'.length })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type(' plain')

    await expect(page.locator('strong').first()).toHaveText('bold')
    await expect(editor).toContainText('bold plain')

    await selectEditorText(page, 'bold', { start: 'bold'.length, end: 'bold'.length })
    await page.keyboard.press('Delete')

    await expect(page.locator('strong', { hasText: 'bold' })).toHaveCount(0)
    await expect(editor).toContainText('bold plain')
  })

  test('Backspace and Delete unwrap inline marks at visible delimiter boundaries', async ({
    page
  }) => {
    const editor = await createBlankPage(page)
    const modKey = process.platform === 'darwin' ? 'Meta' : 'Control'

    await editor.click()
    await page.keyboard.type('bold')
    await selectEditorText(page, 'bold', { start: 0, end: 'bold'.length })
    await page.keyboard.press(`${modKey}+B`)
    await expect(page.locator('strong', { hasText: 'bold' })).toBeVisible()

    await selectEditorText(page, 'bold', { start: 'bold'.length, end: 'bold'.length })
    await page.keyboard.press('Backspace')
    await expect(page.locator('strong', { hasText: 'bold' })).toHaveCount(0)
    await expect(editor).toContainText('bold')

    await editor.click()
    await page.keyboard.press(`${modKey}+A`)
    await page.keyboard.press('Backspace')
    await page.keyboard.type('strike')
    await selectEditorText(page, 'strike', { start: 0, end: 'strike'.length })
    await page.keyboard.press(`${modKey}+Shift+S`)
    await expect(page.locator('s', { hasText: 'strike' })).toBeVisible()

    await selectEditorText(page, 'strike', { start: 0, end: 0 })
    await page.keyboard.press('Delete')
    await expect(page.locator('s', { hasText: 'strike' })).toHaveCount(0)
    await expect(editor).toContainText('strike')
  })

  test('slash command menu teaches common block commands before inserting them', async ({
    page
  }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('/task')

    const menu = page.getByTestId('slash-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('option', { name: 'Task List' })).toBeVisible()
    await expect(menu.getByText('Checklist with checkboxes')).toBeVisible()

    await page.screenshot({ path: 'tmp/playwright/editor-markdown-slash-task.png', fullPage: true })

    await menu.getByRole('option', { name: 'Task List' }).click()
    await page.keyboard.type('Write acceptance checks')

    await expect(page.getByText('Write acceptance checks').first()).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: /Task item checkbox for Write acceptance checks/i })
    ).toBeVisible()
  })

  test('slash command menu closes with Escape without running a command', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('/task')

    const menu = page.getByTestId('slash-menu')
    await expect(menu).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(menu).not.toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(editor).toContainText('/task')
  })

  test('slash page setup avoids prompt dialogs and creates a page embed', async ({ page }) => {
    const editor = await createBlankPage(page)
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type())
      await dialog.dismiss()
    })

    await editor.click()
    await page.keyboard.type('/page')

    const menu = page.getByTestId('slash-menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('option', { name: 'Page' }).click()

    const setupCard = page.getByTestId('page-embed-setup')
    await expect(setupCard).toBeVisible()
    await expect.poll(() => dialogs).toEqual([])

    await setupCard.getByRole('textbox', { name: 'Page title or ID' }).fill('Project Brief')
    await setupCard.getByRole('button', { name: 'Create' }).click()

    await expect(
      page.locator('[data-page-embed-card][data-page-id="default/project-brief"]', {
        hasText: 'Project Brief'
      })
    ).toBeVisible()
  })

  test('slash database setup avoids prompt dialogs and creates a selected view', async ({
    page
  }) => {
    const editor = await createBlankPage(page)
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type())
      await dialog.dismiss()
    })

    await editor.click()
    await page.keyboard.type('/database')

    const menu = page.getByTestId('slash-menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('option', { name: 'Database' }).click()

    const setupCard = page.getByTestId('database-embed-setup')
    await expect(setupCard).toBeVisible()
    await expect.poll(() => dialogs).toEqual([])

    await setupCard.getByRole('textbox', { name: 'Database ID' }).fill('db-planning')
    await setupCard.getByRole('radio', { name: 'Calendar view' }).click()
    await setupCard.getByRole('button', { name: 'Insert' }).click()

    const databaseEmbed = page.locator('[data-database-embed]', { hasText: 'db-planning' })
    await expect(databaseEmbed).toBeVisible()
    await expect(databaseEmbed.getByText('Calendar View')).toBeVisible()
  })

  test('selection toolbar exposes minimalist buttons with shortcut hints', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('toolbar hints')
    await selectEditorText(page, 'toolbar hints', {
      start: 'toolbar '.length,
      end: 'toolbar '.length
    })
    await page.keyboard.down('Shift')
    for (let i = 0; i < 'hints'.length; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.up('Shift')
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toBe('hints')

    const toolbar = page.getByTestId('editor-desktop-toolbar')
    await expect(toolbar).toBeVisible()

    const boldButton = toolbar.getByRole('button', { name: 'Bold' })
    await expect(boldButton).toHaveAttribute('title', /^Bold \((⌘B|Ctrl\+B)\)$/)
    await expect(boldButton).toHaveAttribute('data-shortcut', /^(⌘B|Ctrl\+B)$/)

    const linkButton = toolbar.getByRole('button', { name: 'Link' })
    await expect(linkButton).toHaveAttribute('title', /^Link \((⌘K|Ctrl\+K)\)$/)
    await expect(linkButton).toHaveAttribute('data-shortcut', /^(⌘K|Ctrl\+K)$/)

    await boldButton.hover()
    await expect(
      page.getByTestId('editor-toolbar-tooltip').filter({ hasText: 'Bold' })
    ).toBeVisible()

    await linkButton.click()
    const linkPopover = page.getByTestId('editor-link-popover')
    await expect(linkPopover).toBeVisible()
    await expect(linkPopover).toHaveAttribute('role', 'dialog')
    await expect(linkPopover).toHaveAttribute('aria-label', 'Edit link')
    await linkPopover.getByRole('textbox', { name: 'Link URL' }).fill('https://xnet.fyi/docs')
    await linkPopover.getByRole('button', { name: 'Apply link' }).click()
    await expect(
      page.locator('a[href="https://xnet.fyi/docs"]', { hasText: 'hints' })
    ).toBeVisible()

    await page.screenshot({
      path: 'tmp/playwright/editor-markdown-toolbar-hints.png',
      fullPage: true
    })
  })

  test('link keyboard shortcut opens the toolbar popover without a prompt', async ({ page }) => {
    const editor = await createBlankPage(page)
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type())
      await dialog.dismiss()
    })

    await editor.click()
    await page.keyboard.type('keyboard link target')
    await selectEditorText(page, 'keyboard link target', {
      start: 'keyboard '.length,
      end: 'keyboard link'.length
    })
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toBe('link')

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')

    const linkPopover = page.getByTestId('editor-link-popover')
    await expect(linkPopover).toBeVisible()
    await expect.poll(() => dialogs).toEqual([])

    await linkPopover.getByRole('textbox', { name: 'Link URL' }).fill('https://xnet.fyi/keyboard')
    await linkPopover.getByRole('button', { name: 'Apply link' }).click()

    await expect(
      page.locator('a[href="https://xnet.fyi/keyboard"]', { hasText: 'link' })
    ).toBeVisible()
  })

  test('reference popover inserts page wikilinks from selected text', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('reference target')
    await selectEditorText(page, 'reference target', {
      start: 'reference '.length,
      end: 'reference target'.length
    })
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toBe('target')

    const toolbar = page.getByTestId('editor-desktop-toolbar')
    await expect(toolbar).toBeVisible()

    await toolbar.getByRole('button', { name: 'Reference' }).click()
    const referencePopover = page.getByTestId('editor-reference-popover')
    await expect(referencePopover).toBeVisible()
    await expect(referencePopover).toHaveAttribute('role', 'dialog')
    await expect(referencePopover).toHaveAttribute('aria-label', 'Insert reference')
    await referencePopover.getByRole('textbox', { name: 'Page reference' }).fill('Launch Plan')
    await referencePopover.getByRole('button', { name: 'Insert page reference' }).click()

    await expect(
      page.locator('a[data-wikilink][href="default/launch-plan"]', { hasText: 'Launch Plan' })
    ).toBeVisible()
  })

  test('reference popover inserts database reference chips', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('database reference target')
    await selectEditorText(page, 'database reference target', {
      start: 'database '.length,
      end: 'database reference'.length
    })
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toBe('reference')

    const toolbar = page.getByTestId('editor-desktop-toolbar')
    await expect(toolbar).toBeVisible()

    await toolbar.getByRole('button', { name: 'Reference' }).click()
    const referencePopover = page.getByTestId('editor-reference-popover')
    await expect(referencePopover).toBeVisible()
    await referencePopover.getByRole('tab', { name: 'Database' }).click()
    await referencePopover.getByRole('textbox', { name: 'Database ID' }).fill('db-roadmap')
    await referencePopover.getByRole('textbox', { name: 'Database label' }).fill('Roadmap Database')
    await referencePopover.getByRole('button', { name: 'Insert database reference' }).click()

    await expect(
      page.locator('a[data-database-reference][data-database-id="db-roadmap"]', {
        hasText: 'Roadmap Database'
      })
    ).toBeVisible()
  })

  test('database popover inserts database embeds with a selected view', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('database embed target')
    await selectEditorText(page, 'database embed target', {
      start: 'database '.length,
      end: 'database embed'.length
    })
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toBe('embed')

    const toolbar = page.getByTestId('editor-desktop-toolbar')
    await expect(toolbar).toBeVisible()

    await toolbar.getByRole('button', { name: 'Database' }).click()
    const databasePopover = page.getByTestId('editor-database-popover')
    await expect(databasePopover).toBeVisible()
    await expect(databasePopover).toHaveAttribute('role', 'dialog')
    await expect(databasePopover).toHaveAttribute('aria-label', 'Insert database embed')
    await databasePopover.getByRole('textbox', { name: 'Database ID' }).fill('db-roadmap')
    await databasePopover.getByRole('radio', { name: 'Board view' }).click()
    await databasePopover.getByRole('button', { name: 'Insert database embed' }).click()

    const databaseEmbed = page.locator('[data-database-embed]', { hasText: 'db-roadmap' })
    await expect(databaseEmbed).toBeVisible()
    await expect(databaseEmbed.getByText('Board View')).toBeVisible()

    await page.screenshot({
      path: 'tmp/playwright/editor-markdown-database-popover.png',
      fullPage: true
    })
  })

  test('media popover inserts supported rich media embeds', async ({ page }) => {
    const editor = await createBlankPage(page)

    await editor.click()
    await page.keyboard.type('media embed target')
    await selectEditorText(page, 'media embed target', {
      start: 'media '.length,
      end: 'media embed'.length
    })
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toBe('embed')

    const toolbar = page.getByTestId('editor-desktop-toolbar')
    await expect(toolbar).toBeVisible()

    await toolbar.getByRole('button', { name: 'Media' }).click()
    const mediaPopover = page.getByTestId('editor-media-popover')
    await expect(mediaPopover).toBeVisible()
    await expect(mediaPopover).toHaveAttribute('role', 'dialog')
    await expect(mediaPopover).toHaveAttribute('aria-label', 'Insert media embed')
    await mediaPopover
      .getByRole('textbox', { name: 'Media URL' })
      .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await mediaPopover.getByRole('button', { name: 'Insert media embed' }).click()

    const mediaEmbed = page.locator('[data-embed-iframe-mounted]')
    await expect(mediaEmbed).toHaveCount(1)
    await expect(mediaEmbed).toBeVisible()
    const embedFrame = page.locator('iframe[data-embed-iframe="true"]')
    await expect(embedFrame).toHaveCount(1)
    await expect(embedFrame).toBeVisible()

    await page.screenshot({
      path: 'tmp/playwright/editor-markdown-media-popover.png',
      fullPage: true
    })
  })
})
