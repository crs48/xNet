# @xnetjs/e2e-tests

Browser-based end-to-end tests for xNet, driven by [Playwright](https://playwright.dev/).

These exercise full collaborative-sync, editor, canvas, database, and authorization flows in a real browser against a Vite-served harness. They are **not** part of the normal unit-test suite — they run separately in CI and on demand.

## Running

```bash
pnpm --filter @xnetjs/e2e-tests test          # run the Playwright suite
pnpm --filter @xnetjs/e2e-tests test:debug     # run with E2E_DEBUG=1 (headed/inspector)
pnpm --filter @xnetjs/e2e-tests dev:harness    # serve the harness app for local poking
```

## Layout

| Path                   | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `src/*.spec.ts`        | The Playwright specs (auth, editor, canvas, database, …) |
| `harness/`             | Vite-served React harness the specs drive                |
| `helpers/`             | Shared test helpers (`harness.ts`, `test-auth.ts`)       |
| `playwright.config.ts` | Playwright configuration                                 |

## Notes

- The harness mounts `@xnetjs/data`, `@xnetjs/editor`, `@xnetjs/react`, and `@xnetjs/identity` so specs run against the real packages.
- `helpers/test-auth.ts` provides the identity/auth bypass used to get specs past login.
