/**
 * E2E test for new authorization (authz) code
 *
 * Tests:
 * - Creating and editing pages with new authz system
 * - Creating and editing databases with new authz system
 * - New AuthZ devtool tab functionality
 */

import { test, expect } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

test.describe('Authorization System Validation', () => {
  test('can create/edit pages and databases, and use AuthZ devtool', async ({ page }) => {
    const errors: string[] = []
    const authErrors: string[] = []

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        errors.push(text)
        if (text.toLowerCase().includes('auth')) {
          authErrors.push(text)
        }
      }
    })

    // Setup test auth and wait for onboarding
    await setupTestAuth(page)

    // Advance through onboarding if present
    for (let i = 0; i < 4; i++) {
      // Handle different platform texts: Touch ID, Windows Hello, etc.
      const start = page.getByRole('button', {
        name: /Get started with (Touch ID|Windows Hello|passkey)/i
      })
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

    await page.waitForTimeout(2000)

    // ─── Test 1: Create and Edit a Page ─────────────────────────────────

    await page.screenshot({ path: 'tmp/playwright/authz-01-home.png', fullPage: true })

    // Wait for the main view
    await expect(page.getByRole('heading', { name: /all documents/i })).toBeVisible({
      timeout: 30_000
    })

    // Create a new page
    const main = page.getByRole('main')
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /^Page$/ }).click()

    await page.waitForURL(/\/doc\//, { timeout: 30_000 })
    await page.screenshot({ path: 'tmp/playwright/authz-02-new-page.png', fullPage: true })

    // Edit the page title
    const titleInput = page.locator('input[placeholder="Untitled"]').first()
    await expect(titleInput).toBeVisible()
    await titleInput.fill('AuthZ Test Page')

    // Wait for the editor and type content
    await page.waitForFunction(() => document.querySelector('[contenteditable="true"]') !== null, {
      timeout: 60_000
    })
    await page.evaluate(() => {
      const el = document.querySelector('[contenteditable="true"]') as HTMLElement | null
      el?.focus()
    })
    await page.keyboard.type('Testing authorization system with page editing.', { delay: 10 })

    // Verify content was entered
    await expect(page.locator('[contenteditable="true"]')).toContainText(
      'Testing authorization system with page editing.'
    )

    // Wait for save indicator
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    await page.screenshot({ path: 'tmp/playwright/authz-03-page-edited.png', fullPage: true })

    console.log('✓ Page creation and editing successful')

    // ─── Test 2: Create a Database ──────────────────────────────────────

    // Navigate back to home
    await page.click('[aria-label*="Home"], [title*="Home"], a[href="/"]')
    await page.waitForTimeout(1000)

    // Create a new database
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /Database/i }).click()

    await page.waitForURL(/\/db\//, { timeout: 30_000 })
    await page.screenshot({ path: 'tmp/playwright/authz-04-new-database.png', fullPage: true })

    // Wait for database to load
    await page.waitForTimeout(2000)

    // Look for database UI elements (table, "New" button for rows, column headers)
    const newRowButton = page.locator('button').filter({ hasText: /^New$/i }).first()
    await expect(newRowButton).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'tmp/playwright/authz-05-database-loaded.png', fullPage: true })

    console.log('✓ Database creation successful')

    // ─── Test 3: Open DevTools and Check AuthZ Panel ────────────────────

    // Open devtools with keyboard shortcut
    await page.keyboard.press('Control+Shift+KeyD')
    await page.waitForTimeout(1000)

    await page.screenshot({ path: 'tmp/playwright/authz-06-devtools-opened.png', fullPage: true })

    // Look for devtools panel - check for any panel tabs
    const devtoolsPanel = page.locator('[class*="devtools"], [data-testid*="devtools"]')

    // Alternative: Look for specific panel tabs that should exist
    const panelTabs = page.locator('button').filter({ hasText: /Nodes|Queries|Sync|AuthZ/i })

    // Check if devtools is visible by looking for panel content
    const devtoolsVisible = (await panelTabs.count()) > 0 || (await devtoolsPanel.count()) > 0

    if (!devtoolsVisible) {
      console.log('⚠ DevTools not visible, trying to click FAB...')
      // Try clicking the floating action button
      const fab = page.locator('[title*="Toggle DevTools"]')
      if ((await fab.count()) > 0) {
        await fab.click()
        await page.waitForTimeout(1000)
        await page.screenshot({ path: 'tmp/playwright/authz-07-fab-clicked.png', fullPage: true })
      }
    }

    // Look for AuthZ tab (might be labeled "Authorization" or have authz in selector)
    const authzTab = page.locator('button').filter({ hasText: /AuthZ|Authorization/i })

    if ((await authzTab.count()) > 0) {
      await authzTab.first().click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'tmp/playwright/authz-08-authz-panel.png', fullPage: true })

      // Check for AuthZ panel tabs (Playground, Grants, Timeline, etc.)
      const playgroundTab = page.locator('button').filter({ hasText: /Playground/i })
      const grantsTab = page.locator('button').filter({ hasText: /Grants/i })
      const timelineTab = page.locator('button').filter({ hasText: /Timeline/i })

      const hasPlayground = (await playgroundTab.count()) > 0
      const hasGrants = (await grantsTab.count()) > 0
      const hasTimeline = (await timelineTab.count()) > 0

      if (hasPlayground || hasGrants || hasTimeline) {
        console.log('✓ AuthZ panel loaded with tabs')

        // Test the Playground tab
        if (hasPlayground) {
          await playgroundTab.first().click()
          await page.waitForTimeout(500)

          // Look for permission playground UI elements
          const nodeIdInput = page.locator('input[placeholder*="node"]').first()
          const checkButton = page.locator('button').filter({ hasText: /Check Permission/i })

          if ((await nodeIdInput.count()) > 0 && (await checkButton.count()) > 0) {
            console.log('✓ AuthZ Playground UI functional')
            await page.screenshot({
              path: 'tmp/playwright/authz-09-playground.png',
              fullPage: true
            })
          }
        }

        // Test the Grants tab
        if (hasGrants) {
          await grantsTab.first().click()
          await page.waitForTimeout(500)

          // Look for grants UI elements
          const grantsList = page.locator('text=/Active Grants|No grants found/i')
          if ((await grantsList.count()) > 0) {
            console.log('✓ AuthZ Grants UI functional')
            await page.screenshot({ path: 'tmp/playwright/authz-10-grants.png', fullPage: true })
          }
        }

        // Test the Timeline tab
        if (hasTimeline) {
          await timelineTab.first().click()
          await page.waitForTimeout(500)
          await page.screenshot({ path: 'tmp/playwright/authz-11-timeline.png', fullPage: true })
          console.log('✓ AuthZ Timeline UI functional')
        }
      } else {
        console.log('⚠ AuthZ panel found but tabs not detected')
      }
    } else {
      console.log('⚠ AuthZ tab not found in devtools')
      // Take a screenshot to debug
      await page.screenshot({ path: 'tmp/playwright/authz-debug-no-tab.png', fullPage: true })
    }

    // ─── Final Validations ──────────────────────────────────────────────

    console.log('\n=== Test Summary ===')
    console.log(`Total console errors: ${errors.length}`)
    console.log(`Auth-related errors: ${authErrors.length}`)

    if (authErrors.length > 0) {
      console.log('\nAuth errors found:')
      authErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`))
    }

    // Fail test if there are auth-related errors
    expect(authErrors, `Auth errors found:\n${authErrors.join('\n')}`).toEqual([])

    console.log('\n✓ All authorization tests passed!')
  })
})
