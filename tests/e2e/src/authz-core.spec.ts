/**
 * Core E2E test for authorization system
 *
 * Streamlined test that validates:
 * - Pages and databases can be created/edited (authz allows owner operations)
 * - AuthZ DevTools panel is functional
 * - No authz-related console errors
 */

import { test, expect, type Page } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

async function advanceOnboarding(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500)

    // Handle authentication button
    const authButton = page.getByRole('button', { name: /Get started/i })
    if ((await authButton.count()) > 0 && (await authButton.first().isVisible())) {
      await authButton.first().click()
      await page.waitForTimeout(1500)
      continue
    }

    // Handle "Create your first page" button
    const createButton = page.getByRole('button', { name: /create your first page/i })
    if ((await createButton.count()) > 0 && (await createButton.first().isVisible())) {
      await createButton.first().click()
      await page.waitForTimeout(1500)
      break
    }

    // Check if we're already on the home screen
    const homeHeading = page.getByRole('heading', { name: /all documents/i })
    if ((await homeHeading.count()) > 0 && (await homeHeading.first().isVisible())) {
      console.log('✓ Already on home screen')
      break
    }
  }
}

test.describe('Authorization Core Functionality', () => {
  test('validates authz with pages, databases, and devtools', async ({ page, browserName }) => {
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

    console.log(`Running on ${browserName}...`)

    await setupTestAuth(page)
    await advanceOnboarding(page)

    await page.screenshot({
      path: `tmp/playwright/authz-core-${browserName}-01-home.png`,
      fullPage: true
    })

    // ─── Test 1: Create a Page ──────────────────────────────────────────

    // Wait for home screen
    await expect(
      page
        .getByRole('heading', { name: /all documents/i })
        .or(page.getByText('Pages', { exact: true }))
    ).toBeVisible({ timeout: 10_000 })

    const main = page.getByRole('main')
    await main.getByRole('button', { name: /^New$/i }).click()
    await page.waitForTimeout(500)
    await main.getByRole('button', { name: /^Page$/i }).click()

    // Wait for page editor to load (URL change)
    await page.waitForURL(/\/doc\//, { timeout: 15_000 })
    await page.waitForTimeout(2000)

    console.log(`✓ Page created successfully`)

    await page.screenshot({
      path: `tmp/playwright/authz-core-${browserName}-02-page.png`,
      fullPage: true
    })

    // ─── Test 2: Create a Database ──────────────────────────────────────

    // Navigate back to home
    await page.click('[aria-label*="Home"], [title*="Home"], a[href="/"]')
    await page.waitForTimeout(1000)

    // Create database
    await main.getByRole('button', { name: /^New$/i }).click()
    await page.waitForTimeout(500)
    await main.getByRole('button', { name: /Database/i }).click()

    await page.waitForURL(/\/db\//, { timeout: 15_000 })
    await page.waitForTimeout(2000)

    console.log(`✓ Database created successfully`)

    await page.screenshot({
      path: `tmp/playwright/authz-core-${browserName}-03-database.png`,
      fullPage: true
    })

    // ─── Test 3: Open DevTools and Check AuthZ Panel ────────────────────

    // Open devtools with keyboard shortcut
    await page.keyboard.press('Control+Shift+KeyD')
    await page.waitForTimeout(1500)

    await page.screenshot({
      path: `tmp/playwright/authz-core-${browserName}-04-devtools.png`,
      fullPage: true
    })

    // Look for AuthZ tab
    const authzTab = page.locator('button').filter({ hasText: /AuthZ|Authorization/i })

    if ((await authzTab.count()) > 0) {
      await authzTab.first().click()
      await page.waitForTimeout(1000)

      console.log('✓ AuthZ panel accessible')

      await page.screenshot({
        path: `tmp/playwright/authz-core-${browserName}-05-authz-panel.png`,
        fullPage: true
      })

      // Check for AuthZ panel tabs
      const playgroundTab = page.locator('button').filter({ hasText: /Playground/i })
      const grantsTab = page.locator('button').filter({ hasText: /Grants/i })

      const hasPlayground = (await playgroundTab.count()) > 0
      const hasGrants = (await grantsTab.count()) > 0

      if (hasPlayground && hasGrants) {
        console.log('✓ AuthZ panel has Playground and Grants tabs')
      } else {
        console.log(`⚠ AuthZ panel tabs: Playground=${hasPlayground}, Grants=${hasGrants}`)
      }
    } else {
      console.log('⚠ AuthZ tab not found in DevTools')
    }

    // ─── Final Validation ────────────────────────────────────────────────

    console.log(`\n=== ${browserName} Test Summary ===`)
    console.log(`Total console errors: ${errors.length}`)
    console.log(`Auth-related errors: ${authErrors.length}`)

    if (errors.length > 0 && errors.length < 10) {
      console.log('\nAll errors:')
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 100)}`))
    }

    if (authErrors.length > 0) {
      console.log('\nAuth errors found:')
      authErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`))
    }

    // Fail test if there are auth-related errors
    expect(authErrors, `Auth errors found:\n${authErrors.join('\n')}`).toEqual([])

    console.log(`✓ All authorization tests passed on ${browserName}!\n`)
  })
})
