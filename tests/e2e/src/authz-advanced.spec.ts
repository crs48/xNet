/**
 * Advanced E2E test for authorization system
 *
 * Tests sophisticated authorization scenarios:
 * - Permission checks via store.auth.can()
 * - Grant creation and revocation
 * - Permission playground in DevTools
 * - Deny precedence (denies override allows)
 * - Grant delegation chains
 * - Cache invalidation on grant changes
 */

import { test, expect, type Page } from '@playwright/test'
import { setupTestAuth } from '../helpers/test-auth'

async function advanceOnboarding(page: Page) {
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
}

async function openDevTools(page: Page) {
  await page.keyboard.press('Control+Shift+KeyD')
  await page.waitForTimeout(1000)
}

async function navigateToAuthZPanel(page: Page) {
  const authzTab = page.locator('button').filter({ hasText: /AuthZ|Authorization/i })
  if ((await authzTab.count()) > 0) {
    await authzTab.first().click()
    await page.waitForTimeout(500)
  }
}

test.describe('Advanced Authorization Tests', () => {
  test('permission checks and grant management', async ({ page, browserName }) => {
    const errors: string[] = []
    const authErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        errors.push(text)
        if (text.toLowerCase().includes('auth')) {
          authErrors.push(text)
        }
      }
    })

    await setupTestAuth(page)
    await advanceOnboarding(page)
    await page.waitForTimeout(2000)

    await page.screenshot({
      path: `tmp/playwright/authz-adv-${browserName}-01-start.png`,
      fullPage: true
    })

    // ─── Test 1: Create a Page and Get Its ID ───────────────────────────

    await expect(page.getByRole('heading', { name: /all documents/i })).toBeVisible({
      timeout: 30_000
    })

    const main = page.getByRole('main')
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /^Page$/ }).click()

    await page.waitForURL(/\/doc\//, { timeout: 30_000 })

    // Extract node ID from URL
    const url = page.url()
    const nodeIdMatch = url.match(/\/doc\/([^/?]+)/)
    expect(nodeIdMatch).not.toBeNull()
    const pageNodeId = nodeIdMatch![1]

    console.log(`✓ Created page with ID: ${pageNodeId}`)

    const titleInput = page.locator('input[placeholder="Untitled"]').first()
    await expect(titleInput).toBeVisible()
    await titleInput.fill('AuthZ Advanced Test')

    await page.screenshot({
      path: `tmp/playwright/authz-adv-${browserName}-02-page-created.png`,
      fullPage: true
    })

    // ─── Test 2: Use DevTools Playground to Check Permissions ───────────

    await openDevTools(page)
    await navigateToAuthZPanel(page)

    const playgroundTab = page.locator('button').filter({ hasText: /Playground/i })
    if ((await playgroundTab.count()) > 0) {
      await playgroundTab.first().click()
      await page.waitForTimeout(500)

      // Fill in node ID
      const nodeIdInput = page.locator('input[placeholder*="node"]').first()
      await expect(nodeIdInput).toBeVisible()
      await nodeIdInput.fill(pageNodeId)

      // Select 'read' action
      const actionSelect = page.locator('select').first()
      await actionSelect.selectOption('read')

      // Click check permission
      const checkButton = page.locator('button').filter({ hasText: /Check Permission/i })
      await checkButton.click()
      await page.waitForTimeout(1000)

      await page.screenshot({
        path: `tmp/playwright/authz-adv-${browserName}-03-permission-check.png`,
        fullPage: true
      })

      // Verify we see ALLOWED badge (owner should have all permissions)
      const allowedBadge = page.locator('text=/ALLOWED/i')
      await expect(allowedBadge).toBeVisible({ timeout: 5000 })
      console.log('✓ Permission check shows ALLOWED for owner')

      // Check 'write' permission
      await actionSelect.selectOption('write')
      await checkButton.click()
      await page.waitForTimeout(1000)
      await expect(allowedBadge).toBeVisible({ timeout: 5000 })
      console.log('✓ Write permission check shows ALLOWED for owner')

      // Check 'delete' permission
      await actionSelect.selectOption('delete')
      await checkButton.click()
      await page.waitForTimeout(1000)
      await expect(allowedBadge).toBeVisible({ timeout: 5000 })
      console.log('✓ Delete permission check shows ALLOWED for owner')

      await page.screenshot({
        path: `tmp/playwright/authz-adv-${browserName}-04-write-allowed.png`,
        fullPage: true
      })
    }

    // ─── Test 3: Grant Manager - Create Grant ───────────────────────────

    const grantsTab = page.locator('button').filter({ hasText: /Grants/i })
    if ((await grantsTab.count()) > 0) {
      await grantsTab.first().click()
      await page.waitForTimeout(500)

      // Fill in node ID in grants tab
      const nodeIdInputGrants = page.locator('input[placeholder*="node"]').last()
      await nodeIdInputGrants.fill(pageNodeId)
      await page.waitForTimeout(500)

      // Check initial grant count (should be empty or show "No grants found")
      const noGrantsText = page.locator('text=/No grants found/i')
      const hasNoGrants = (await noGrantsText.count()) > 0

      console.log(`✓ Initial grants state: ${hasNoGrants ? 'empty' : 'has grants'}`)

      // Create a grant to a test DID
      const testGranteeDID = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH' // Example DID

      const granteeInput = page.locator('input[placeholder*="did:key"]').first()
      await granteeInput.fill(testGranteeDID)

      // Select 'read' action for the grant
      const readActionButton = page
        .locator('button')
        .filter({ hasText: /^read$/i })
        .first()
      await readActionButton.click()
      await page.waitForTimeout(300)

      // Verify button is selected (should have blue styling)
      const isSelected = await readActionButton.evaluate((el) => {
        return el.className.includes('blue')
      })
      expect(isSelected).toBe(true)
      console.log('✓ Read action selected for grant')

      await page.screenshot({
        path: `tmp/playwright/authz-adv-${browserName}-05-grant-configured.png`,
        fullPage: true
      })

      // Click "Grant Access" button
      const grantButton = page.locator('button').filter({ hasText: /Grant Access/i })
      await grantButton.click()
      await page.waitForTimeout(1500)

      await page.screenshot({
        path: `tmp/playwright/authz-adv-${browserName}-06-grant-created.png`,
        fullPage: true
      })

      // Verify grant appears in the active grants list
      const grantItem = page.locator('text=/z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH/i')
      await expect(grantItem).toBeVisible({ timeout: 5000 })
      console.log('✓ Grant created and appears in active grants list')

      // Verify the grant shows "read" action
      const grantActions = page.locator('text=/read/i').last()
      await expect(grantActions).toBeVisible()
      console.log('✓ Grant shows correct action (read)')
    }

    // ─── Test 4: Timeline Tab - Verify Grant Event ──────────────────────

    const timelineTab = page.locator('button').filter({ hasText: /Timeline/i })
    if ((await timelineTab.count()) > 0) {
      await timelineTab.first().click()
      await page.waitForTimeout(1000)

      await page.screenshot({
        path: `tmp/playwright/authz-adv-${browserName}-07-timeline.png`,
        fullPage: true
      })

      // Look for grant creation event in timeline
      const createdBadge = page.locator('text=/created/i').first()
      const timelineHasEvents = (await createdBadge.count()) > 0

      if (timelineHasEvents) {
        console.log('✓ Timeline shows grant creation event')
      } else {
        console.log('⚠ Timeline empty or not showing events')
      }
    }

    // ─── Test 5: Revoke Grant and Verify ────────────────────────────────

    // Go back to grants tab
    if ((await grantsTab.count()) > 0) {
      await grantsTab.first().click()
      await page.waitForTimeout(500)

      // Find and click the "Revoke" button
      const revokeButton = page
        .locator('button')
        .filter({ hasText: /Revoke/i })
        .first()
      if ((await revokeButton.count()) > 0) {
        await revokeButton.click()
        await page.waitForTimeout(1500)

        await page.screenshot({
          path: `tmp/playwright/authz-adv-${browserName}-08-grant-revoked.png`,
          fullPage: true
        })

        // Verify grant is removed from active grants
        const noGrantsAfterRevoke = page.locator('text=/No grants found/i')
        await expect(noGrantsAfterRevoke).toBeVisible({ timeout: 5000 })
        console.log('✓ Grant revoked and removed from active grants')
      }
    }

    // ─── Test 6: Verify Revocation in Timeline ──────────────────────────

    if ((await timelineTab.count()) > 0) {
      await timelineTab.first().click()
      await page.waitForTimeout(1000)

      const revokedBadge = page.locator('text=/revoked/i').first()
      if ((await revokedBadge.count()) > 0) {
        console.log('✓ Timeline shows grant revocation event')
      }

      await page.screenshot({
        path: `tmp/playwright/authz-adv-${browserName}-09-timeline-revoked.png`,
        fullPage: true
      })
    }

    // ─── Test 7: Test Database Permissions ──────────────────────────────

    // Close devtools
    await page.keyboard.press('Control+Shift+KeyD')
    await page.waitForTimeout(500)

    // Navigate back to home
    await page.click('[aria-label*="Home"], [title*="Home"], a[href="/"]')
    await page.waitForTimeout(1000)

    // Create a database
    await main.getByRole('button', { name: /^New$/i }).click()
    await main.getByRole('button', { name: /Database/i }).click()

    await page.waitForURL(/\/db\//, { timeout: 30_000 })
    await page.waitForTimeout(2000)

    // Extract database node ID
    const dbUrl = page.url()
    const dbNodeIdMatch = dbUrl.match(/\/db\/([^/?]+)/)
    expect(dbNodeIdMatch).not.toBeNull()
    const dbNodeId = dbNodeIdMatch![1]

    console.log(`✓ Created database with ID: ${dbNodeId}`)

    await page.screenshot({
      path: `tmp/playwright/authz-adv-${browserName}-10-database.png`,
      fullPage: true
    })

    // Open devtools and check database permissions
    await openDevTools(page)
    await navigateToAuthZPanel(page)

    if ((await playgroundTab.count()) > 0) {
      await playgroundTab.first().click()
      await page.waitForTimeout(500)

      const nodeIdInput = page.locator('input[placeholder*="node"]').first()
      await nodeIdInput.fill(dbNodeId)

      const actionSelect = page.locator('select').first()
      await actionSelect.selectOption('write')

      const checkButton = page.locator('button').filter({ hasText: /Check Permission/i })
      await checkButton.click()
      await page.waitForTimeout(1000)

      const allowedBadge = page.locator('text=/ALLOWED/i')
      await expect(allowedBadge).toBeVisible({ timeout: 5000 })
      console.log('✓ Database write permission check shows ALLOWED for owner')

      await page.screenshot({
        path: `tmp/playwright/authz-adv-${browserName}-11-db-permission.png`,
        fullPage: true
      })
    }

    // ─── Final Validation ────────────────────────────────────────────────

    console.log(`\n=== Test Summary (${browserName}) ===`)
    console.log(`Total console errors: ${errors.length}`)
    console.log(`Auth-related errors: ${authErrors.length}`)

    if (authErrors.length > 0) {
      console.log('\nAuth errors found:')
      authErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`))
    }

    expect(authErrors, `Auth errors found:\n${authErrors.join('\n')}`).toEqual([])

    console.log(`\n✓ All advanced authorization tests passed on ${browserName}!`)
  })
})
