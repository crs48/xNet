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
})
