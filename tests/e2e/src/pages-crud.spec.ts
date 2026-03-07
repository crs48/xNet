import { test, expect } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

test.describe('Pages CRUD with SQLite', () => {
  test('verify OPFS and SQLite work without foreign key errors', async ({ page }) => {
    const sqliteErrors: string[] = []

    const advanceOnboarding = async () => {
      for (let i = 0; i < 4; i++) {
        const start = page.getByRole('button', { name: /Get started with/i })
        if ((await start.count()) > 0 && (await start.first().isVisible())) {
          await start.first().click()
          await page.waitForTimeout(1000)
          continue
        }

        const ready = page.getByRole('button', { name: /create your first page/i })
        if ((await ready.count()) > 0 && (await ready.first().isVisible())) {
          await ready.first().click()
          await page.waitForTimeout(1000)
          continue
        }

        break
      }
    }

    page.on('console', (msg) => {
      if (msg.type() !== 'error') {
        return
      }

      const text = msg.text()
      const lower = text.toLowerCase()
      if (text.includes('FOREIGN_KEY') || lower.includes('sqlite') || lower.includes('opfs')) {
        sqliteErrors.push(text)
      }
    })

    await setupTestAuth(page)
    await advanceOnboarding()

    await expect(page.locator('#root')).not.toContainText('Welcome to xNet', {
      timeout: 30_000
    })

    await page.screenshot({ path: 'tmp/playwright/after-auth.png', fullPage: true })

    const rootContent = await page.locator('#root').textContent()
    console.log('Root content:', rootContent)

    const errorMessages = await page.locator('[role="alert"]').allTextContents()
    if (errorMessages.length > 0) {
      console.log('Alert messages:', errorMessages)
    }

    await expect(page.locator('#root')).not.toContainText('Initializing')
    await expect(page.locator('#root')).not.toContainText('Browser not supported')
    await expect(page.locator('#root')).not.toContainText("isn't available in this browser")
    await expect(page.locator('#root')).not.toContainText('Welcome to xNet')

    await expect(page.getByRole('heading', { name: /all documents/i })).toBeVisible({
      timeout: 30_000
    })

    const main = page.getByRole('main')
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /^Page$/ }).click()

    await page.waitForURL(/\/doc\//, { timeout: 30_000 })

    const titleInput = page.locator('input[placeholder="Untitled"]').first()
    await expect(titleInput).toBeVisible()
    await titleInput.fill('SQLite E2E Page')

    await page.waitForFunction(() => document.querySelector('[contenteditable="true"]') !== null, {
      timeout: 60_000
    })
    await page.evaluate(() => {
      const el = document.querySelector('[contenteditable="true"]') as HTMLElement | null
      el?.focus()
    })
    await page.keyboard.type('This page was created and edited in e2e.', { delay: 10 })

    await expect(page.locator('[contenteditable="true"]')).toContainText(
      'This page was created and edited in e2e.'
    )

    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    expect(sqliteErrors, `SQLite/OPFS errors found:\n${sqliteErrors.join('\n')}`).toEqual([])
  })
})
