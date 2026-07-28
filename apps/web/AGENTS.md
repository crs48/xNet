# apps/web — browser surface

Loaded on demand when an agent reads files here. Root `AGENTS.md` still applies.

## Browser automation

Two Playwright MCP servers, and picking the wrong one wastes a session:

- **playwright-web** — auto-launches a browser. Use for this app. Do NOT pass
  `--cdp-endpoint`.
- **playwright-electron** — attaches to a running Electron over CDP. See
  `apps/electron/AGENTS.md`; never point it at the web app.

Workflow: navigate → snapshot (accessibility tree) → interact → screenshot →
check console. Key tools: `browser_navigate`, `browser_snapshot`,
`browser_click`, `browser_type`, `browser_take_screenshot`,
`browser_console_messages` (JS errors, React warnings, unhandled rejections).

Save screenshots to `tmp/playwright/`. Enable sync debug logs with
`localStorage.setItem('xnet:sync:debug', 'true')`.

### Codex + Playwright in OpenCode

Codex agents reach the same servers as `playwright_browser_*` /
`playwright-web_*`. If the MCP bridge is flaky mid-session, fall back to the
CLI:

```bash
pnpm --filter xnet-web dev
pnpm --filter @xnetjs/e2e-tests exec playwright test src/pages-crud.spec.ts
```

## Test auth bypass — required before any assertion

The app requires WebAuthn/passkey auth, which automated browsers cannot
complete. **Every Playwright test must opt into bypass first**, or the run
asserts against a login screen.

```typescript
import { setupTestAuth } from '../helpers/test-auth'

test('my test', async ({ page }) => {
  await setupTestAuth(page) // enables bypass and waits for auth
})
```

For MCP or manual runs, set the flag before the app initialises:

```javascript
localStorage.setItem('xnet:test:bypass', 'true')
location.reload()
```

How it works: the flag makes the identity manager create a deterministic test
identity, so there is no WebAuthn prompt.

**Then advance onboarding** if it appears (`Get started with Touch ID` →
`Create your first page`). An assertion made before bypass *and* onboarding
complete is invalid for any auth-sensitive flow.

## Viewport

The app renders `MobileShell` at narrow widths — including a **0×0 viewport**,
which some automation surfaces report. If desktop chrome (the bottom bar, its
islands) is missing, check the viewport before hunting for a bug.

## Kill dev servers when done

Never leave background processes running between tasks.

```bash
lsof -ti:5177,4444,3000,8080 2>/dev/null | xargs kill -9 2>/dev/null
pkill -f "vite" 2>/dev/null; pkill -f "electron" 2>/dev/null; pkill -f "signaling" 2>/dev/null
lsof -ti:5177,4444,3000,8080 2>/dev/null || echo "All ports clear"
```
