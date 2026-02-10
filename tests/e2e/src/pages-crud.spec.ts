import { test, expect } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

test.describe('Pages CRUD with SQLite', () => {
  test('verify OPFS and SQLite work without foreign key errors', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('FOREIGN_KEY')) {
        throw new Error(`Foreign key error detected: ${msg.text()}`)
      }
    })

    await setupTestAuth(page)

    await page.waitForTimeout(3000)

    await page.screenshot({ path: 'tmp/playwright/after-auth.png', fullPage: true })

    const rootContent = await page.locator('#root').textContent()
    console.log('Root content:', rootContent)

    const errorMessages = await page.locator('[role="alert"]').allTextContents()
    if (errorMessages.length > 0) {
      console.log('Alert messages:', errorMessages)
    }

    await expect(page.locator('#root')).not.toContainText('Initializing')
  })
})
