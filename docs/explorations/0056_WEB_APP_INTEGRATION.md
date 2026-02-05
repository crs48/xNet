# Exploration 0056: Web App Integration & Onboarding

**Status:** Proposed
**Created:** 2026-02-05
**Depends on:** 0050 (Web App on GitHub Pages), 0051 (Demo Hub on Railway)
**Plan reference:** `docs/planStep03_9_1OnboardingAndPolish/`

## Problem

The web app (`apps/web/`) exists as a functional Vite + React SPA with page CRUD, a rich text editor, and local IndexedDB storage — but it is completely disconnected from the live site. Visiting `xnet.fyi/app` returns a 404. The landing page has no CTA linking to a live demo. The download page has a dead "Use in browser" link.

Meanwhile, the infrastructure to support a live web app already exists:

- **`@xnet/identity`** — passkey creation, unlock, PRF-based key derivation, fallback, discovery — all fully implemented.
- **`@xnet/react` onboarding** — state machine, provider, 8 screens, templates — all fully implemented.
- **Demo Hub** — `hub.xnet.fyi` is live on Railway with eviction and demo config.
- **`@xnet/react` sync** — `InitialSyncManager`, `SyncProgressOverlay`, hub status hooks — all ready.

The gap is integration. The web app uses a hardcoded DID/signing key, has no onboarding flow, no hub connection, and is not served from the site.

## Current State Audit

```mermaid
block-beta
  columns 4

  block:identity["@xnet/identity"]:1
    id_passkey["Passkey Auth"]
    id_manager["Identity Manager"]
    id_sharing["Share Tokens"]
  end

  block:react["@xnet/react"]:1
    r_onboarding["Onboarding Flow"]
    r_hooks["18+ Hooks"]
    r_components["ErrorBoundary\nSkeleton\nOfflineIndicator"]
  end

  block:hub["Demo Hub"]:1
    h_live["hub.xnet.fyi"]
    h_eviction["Eviction Service"]
    h_config["Demo Config"]
  end

  block:missing["Missing"]:1
    m_integration["Web App Integration"]
    m_site["Site /app Route"]
    m_demo_ui["Demo UI Components"]
  end

  style identity fill:#10b981,color:#fff
  style react fill:#10b981,color:#fff
  style hub fill:#10b981,color:#fff
  style missing fill:#ef4444,color:#fff
```

### What's Built

| Component                                  | Package          | Status |
| ------------------------------------------ | ---------------- | ------ |
| Passkey create/unlock/fallback/discovery   | `@xnet/identity` | Done   |
| Identity manager factory                   | `@xnet/identity` | Done   |
| Share token create/parse/verify            | `@xnet/identity` | Done   |
| Onboarding state machine + reducer         | `@xnet/react`    | Done   |
| OnboardingProvider + useOnboarding         | `@xnet/react`    | Done   |
| 8 onboarding screens                       | `@xnet/react`    | Done   |
| Quick-start templates                      | `@xnet/react`    | Done   |
| InitialSyncManager (client-side)           | `@xnet/react`    | Done   |
| SyncProgressOverlay                        | `@xnet/react`    | Done   |
| ErrorBoundary, Skeleton, OfflineIndicator  | `@xnet/react`    | Done   |
| HubStatusIndicator                         | `@xnet/react`    | Done   |
| 18+ React hooks                            | `@xnet/react`    | Done   |
| Demo hub live on Railway                   | `@xnet/hub`      | Done   |
| Eviction service                           | `@xnet/hub`      | Done   |
| Demo config + overrides                    | `@xnet/hub`      | Done   |
| Web app routes (/, /settings, /doc/$docId) | `apps/web`       | Done   |
| Editor, sidebar, global search, backlinks  | `apps/web`       | Done   |

### What's Missing

| Component                      | Package       | Gap                                |
| ------------------------------ | ------------- | ---------------------------------- |
| Passkey auth in web app        | `apps/web`    | Hardcoded DID/key, no passkey flow |
| Onboarding flow in web app     | `apps/web`    | OnboardingProvider not wired in    |
| Hub connection in web app      | `apps/web`    | No WebSocket sync, purely local    |
| `@astrojs/react` integration   | `site/`       | Not installed, not configured      |
| `/app` route in site           | `site/`       | No page exists                     |
| SPA fallback for `/app/*`      | `site/`       | No client-side routing support     |
| DemoBanner component           | `@xnet/react` | Not implemented                    |
| DemoQuotaIndicator component   | `@xnet/react` | Not implemented                    |
| Hub quota enforcement service  | `@xnet/hub`   | Quota types exist, no enforcement  |
| Hub initial-sync service       | `@xnet/hub`   | Client-side only, no server push   |
| Demo-specific rate limit tiers | `@xnet/hub`   | Generic rate limiter, no demo tier |
| ShareDialog React component    | `@xnet/react` | Logic in identity pkg, no UI       |
| Landing page "Try it" CTA      | `site/`       | No link to /app                    |
| CI trigger for web app changes | `.github/`    | deploy-site.yml only watches site/ |

## Architecture Decision: How to Serve `/app`

### Option A: Astro React Island (Planned)

Embed the web app as a React island inside the Astro site using `@astrojs/react`. Create `site/src/pages/app.astro` that renders a full-page React component.

```
site/src/pages/app.astro  →  <WebApp client:only="react" />
```

**Pros:** Single deployment, shared domain and passkey rpId, simple CI.
**Cons:** Requires moving or duplicating web app source into the site package. Astro's React island model is designed for components, not full SPAs with client-side routing. TanStack Router's file-based routing conflicts with Astro's file-based routing. The site is not in the pnpm workspace — it runs `pnpm install --ignore-workspace`.

### Option B: Pre-built SPA Copied Into Site Dist (Recommended)

Build the web app with Vite as a standalone SPA (rooted at `/app/`), then copy the output into the Astro site's dist directory before the GitHub Pages upload. The Astro site and web app remain completely separate build steps.

```
1. pnpm --filter xnet-web build     →  apps/web/dist/
2. cd site && pnpm build             →  site/dist/
3. cp -r apps/web/dist/* site/dist/app/
4. Upload site/dist/ to GitHub Pages
```

SPA fallback is handled by a `404.html` that redirects `/app/*` back to `/app/index.html` (GitHub Pages serves `404.html` for missing paths). Alternatively, duplicate `index.html` as `404.html` within the `/app/` subdirectory.

**Pros:** No coupling between Astro and the web app. Web app keeps its own Vite config, TanStack Router, and PWA service worker. Clean separation of concerns. Works with GitHub Pages.
**Cons:** Slightly more complex CI (two build steps). Need to configure Vite's `base` to `/app/`.

### Option C: Separate Deployment (Subdomain)

Deploy the web app to a separate host (Cloudflare Pages, Vercel, etc.) at `app.xnet.fyi`.

**Pros:** Fully independent deployment lifecycle.
**Cons:** Different origin breaks passkey rpId sharing (passkeys created on `xnet.fyi` won't work on `app.xnet.fyi`). Adds infrastructure complexity. Planning docs explicitly rejected this approach (exploration 0051).

### Recommendation: Option B

Option B gives the cleanest architecture — the web app stays a normal Vite SPA, the site stays a normal Astro site, and they're stitched together at the CI level. No framework coupling, no routing conflicts.

## Integration Plan

### Phase 1: Wire Up the Web App (apps/web)

Connect the existing onboarding and identity infrastructure to the web app.

```mermaid
sequenceDiagram
    participant User
    participant App as Web App (/app)
    participant Onboarding as OnboardingProvider
    participant Identity as @xnet/identity
    participant Hub as hub.xnet.fyi

    User->>App: Visit xnet.fyi/app
    App->>Onboarding: Mount OnboardingFlow
    Onboarding->>User: WelcomeScreen<br/>"Create with Touch ID"

    User->>Identity: Tap Touch ID / Passkey
    Identity->>Identity: WebAuthn PRF → HKDF → Ed25519 seed
    Identity-->>Onboarding: PasskeyIdentity { did, signingKey }

    Onboarding->>Hub: Connect WSS
    Hub-->>Onboarding: Handshake { isDemo, demoLimits }
    Onboarding->>User: ReadyScreen + template picker

    User->>App: Select "Blank Page"
    App->>App: Create page, mount editor
    App->>Hub: Begin Yjs sync
```

#### 1.1 Replace Hardcoded Identity with Passkey Auth

**File: `apps/web/src/main.tsx`**

Remove the hardcoded `AUTHOR_DID` and `SIGNING_KEY`. Instead:

1. On app load, check if a passkey identity exists in IndexedDB via `identityManager.hasIdentity()`.
2. If yes, render the app with an unlock gate (Touch ID prompt).
3. If no, render the onboarding flow.

The `XNetProvider` config receives `authorDID` and `signingKey` from the passkey identity once authenticated.

```typescript
// Pseudocode for new main.tsx flow
const identityManager = createIdentityManager()

function App() {
  const [identity, setIdentity] = useState<PasskeyIdentity | null>(null)

  if (!identity) {
    return (
      <OnboardingProvider
        hubUrl="wss://hub.xnet.fyi"
        onComplete={(id) => setIdentity(id)}
      >
        <OnboardingFlow />
      </OnboardingProvider>
    )
  }

  return (
    <XNetProvider config={{
      nodeStorage,
      authorDID: identity.did,
      signingKey: identity.signingKey,
      blobStore,
      signalingUrl: 'wss://hub.xnet.fyi'
    }}>
      <BlobProvider blobService={blobService}>
        <RouterProvider router={router} />
      </BlobProvider>
    </XNetProvider>
  )
}
```

#### 1.2 Add Hub Connection (Sync)

**File: `apps/web/src/main.tsx`**

Pass `signalingUrl: 'wss://hub.xnet.fyi'` to `XNetProvider`. This enables the existing `SyncManager` to establish a WebSocket connection for Yjs CRDT sync.

The demo hub URL should be configurable via environment variable:

```typescript
const HUB_URL = import.meta.env.VITE_HUB_URL || 'wss://hub.xnet.fyi'
```

#### 1.3 Add Demo UI Components

**New files in `packages/react/src/components/`:**

- **`DemoBanner.tsx`** — Fixed top banner: "You're using the demo. Data expires after 24h of inactivity." with dismiss and "Download desktop app" CTA.
- **`DemoQuotaIndicator.tsx`** — Shows storage used / quota limit with a progress bar. Warns at 80%+ usage.

These render conditionally based on the hub handshake response (`isDemo: true`).

#### 1.4 Wire Onboarding Into Root Layout

**File: `apps/web/src/routes/__root.tsx`**

After onboarding completes and the app renders, add:

- `<OfflineIndicator />` — already built, just needs mounting
- `<DemoBanner />` — new, shows in demo mode
- `<HubStatusIndicator />` — already built, shows sync status

### Phase 2: Serve from the Site (CI Pipeline)

Get the web app building and deploying at `xnet.fyi/app`.

```mermaid
flowchart TD
    A[Push to main] --> B{Changed files?}
    B -->|site/** OR apps/web/** OR packages/**| C[Build Job]
    C --> D["pnpm install<br/>(root workspace)"]
    D --> E["pnpm --filter xnet-web build<br/>(Vite SPA → apps/web/dist/)"]
    E --> F["cd site && pnpm install --ignore-workspace"]
    F --> G["cd site && pnpm build<br/>(Astro → site/dist/)"]
    G --> H["cp -r apps/web/dist/* site/dist/app/"]
    H --> I["Add SPA fallback<br/>cp site/dist/app/index.html site/dist/app/404.html"]
    I --> J[Upload site/dist/ to GitHub Pages]
    J --> K[Deploy]

    style E fill:#6366f1,color:#fff
    style G fill:#6366f1,color:#fff
    style H fill:#f59e0b,color:#000
```

#### 2.1 Configure Vite Base Path

**File: `apps/web/vite.config.ts`**

Set `base: '/app/'` so all asset paths are relative to `/app/`:

```typescript
export default defineConfig({
  base: '/app/'
  // ... rest of config
})
```

This ensures `<script>`, `<link>`, and asset URLs all prefix with `/app/`.

#### 2.2 Configure TanStack Router Base Path

TanStack Router needs to know it's mounted at `/app`:

```typescript
const router = createRouter({
  routeTree,
  basepath: '/app'
})
```

Routes will then be:

- `/app/` — page list
- `/app/settings` — settings
- `/app/doc/:docId` — document editor

#### 2.3 Update PWA Manifest

**File: `apps/web/vite.config.ts`**

Update the PWA manifest `start_url` and `scope`:

```typescript
manifest: {
  start_url: '/app/',
  scope: '/app/',
  // ... rest of manifest
}
```

#### 2.4 SPA Fallback on GitHub Pages

GitHub Pages doesn't support server-side rewrites. The standard workaround: place a copy of `index.html` at `404.html` within the `/app/` directory. When GitHub Pages can't find `/app/doc/abc123`, it serves `404.html` (which is the SPA shell), and TanStack Router handles the route client-side.

Add this to the CI build step:

```bash
cp site/dist/app/index.html site/dist/app/404.html
```

Note: This only works for paths under `/app/`. The site's own `404.html` (if any) is separate.

#### 2.5 Update deploy-site.yml

**File: `.github/workflows/deploy-site.yml`**

The workflow currently only triggers on `site/**` changes and only builds the Astro site. It needs to:

1. **Trigger on** `site/**`, `apps/web/**`, and `packages/**` changes (since the web app depends on workspace packages).
2. **Install the full workspace** (not just site/) to build the web app.
3. **Build the web app** before the site.
4. **Copy the web app** into the site dist.

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'site/**'
      - 'apps/web/**'
      - 'packages/**'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      # Build web app (needs workspace packages)
      - name: Install workspace dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm build --filter xnet-web...

      - name: Build web app
        run: pnpm --filter xnet-web build

      # Build Astro site (independent)
      - name: Install site dependencies
        run: pnpm install --ignore-workspace
        working-directory: site

      - name: Build site
        run: pnpm build
        working-directory: site

      # Stitch together
      - name: Copy web app into site
        run: |
          mkdir -p site/dist/app
          cp -r apps/web/dist/* site/dist/app/
          cp site/dist/app/index.html site/dist/app/404.html

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist
```

### Phase 3: Landing Page Integration

Connect the dots in the marketing site.

#### 3.1 Hero CTA

**File: `site/src/components/sections/Hero.astro`**

Add a prominent "Try it now" button alongside "Get Started":

```html
<a href="/app" class="primary-cta">
  Try it now
  <span class="badge">No signup</span>
</a>
```

#### 3.2 Nav Link

**File: `site/src/components/sections/Nav.astro`**

Add "Try it" as a top-level nav item linking to `/app`.

#### 3.3 Fix Download Page Dead Link

**File: `site/src/pages/download.astro`**

The "Use in browser" link at line 125 already points to `/app`. Once the app is deployed, this link will work. No change needed.

#### 3.4 GetStarted Section

**File: `site/src/components/sections/GetStarted.astro`**

Add a "Try in browser" option alongside the existing "Read the Docs" and "View on GitHub" CTAs.

### Phase 4: Demo UI Polish

#### 4.1 DemoBanner Component

```mermaid
stateDiagram-v2
    [*] --> Visible: isDemo && !dismissed
    Visible --> Dismissed: User clicks X
    Dismissed --> [*]: sessionStorage flag
    Visible --> [*]: !isDemo

    state Visible {
        [*] --> Normal
        Normal --> Expiring: < 2h remaining
    }
```

A fixed-position banner at the top of the app when connected to a demo hub:

> **Demo mode** — Your data is stored temporarily and expires after 24 hours of inactivity. [Download the desktop app](/download) to keep your data permanently.

Dismissible per session (uses `sessionStorage`). Re-appears if the user's data is close to eviction.

#### 4.2 DemoQuotaIndicator Component

Shows in the sidebar footer when in demo mode:

```
Storage: ████████░░ 7.2 MB / 10 MB
```

Warns at 80% with yellow, errors at 95% with red. Links to download page when full.

Requires the hub to report usage in the handshake or via a periodic quota check endpoint.

#### 4.3 Demo Data Expired Screen

When a user returns after eviction, their IndexedDB still has a passkey identity but the hub has purged their data. The app should detect this (empty initial sync) and show:

> **Your demo data has expired.** Demo data is removed after 24 hours of inactivity. You can start fresh or download the desktop app to keep your data permanently.
>
> [Start Fresh] [Download Desktop App]

### Phase 5: Hub Hardening (Lower Priority)

These are server-side improvements that make the demo more robust but aren't blocking the initial launch.

#### 5.1 Quota Enforcement Service

**File: `packages/hub/src/services/quota.ts`**

Enforce per-DID storage limits. Check on every Yjs update and blob upload:

- Total storage per DID (default 10 MB for demo)
- Max document count (default 50 for demo)
- Max single blob size (default 2 MB for demo)

Reject operations that exceed limits with a structured error the client can display.

#### 5.2 Demo Rate Limit Tier

**File: `packages/hub/src/middleware/rate-limit.ts`**

Add demo-specific limits that are tighter than the default:

- 100 WebSocket messages per minute (vs 1000 default)
- 10 connections per IP (vs 100 default)

#### 5.3 Hub Initial Sync Service

**File: `packages/hub/src/services/initial-sync.ts`**

When a new device connects with an existing DID, the hub should push all stored Y.Doc state and node changes. Currently the client-side `InitialSyncManager` handles tracking, but the hub needs to actively send the data.

## Full User Journey

```mermaid
flowchart TD
    A["User visits xnet.fyi"] --> B["Landing Page"]
    B --> C{"Clicks CTA"}
    C -->|"Try it now"| D["xnet.fyi/app"]
    C -->|"Download"| E["xnet.fyi/download"]
    C -->|"Read Docs"| F["xnet.fyi/docs"]

    D --> G{"Has passkey<br/>identity?"}
    G -->|No| H["WelcomeScreen"]
    G -->|Yes| I["Touch ID Unlock"]

    H --> J["Create Passkey<br/>(Touch ID / Security Key)"]
    J --> K["PRF → HKDF → Ed25519 seed"]
    K --> L["Connect to hub.xnet.fyi"]

    I --> L

    L --> M{"Hub handshake"}
    M -->|isDemo: true| N["Show DemoBanner"]
    M -->|Connected| O["ReadyScreen<br/>Pick a template"]

    N --> O
    O --> P["App loaded<br/>Editor ready"]
    P --> Q["Create pages, edit, sync"]

    Q --> R{"Return later"}
    R -->|"Within 24h"| S["Touch ID → Resume"]
    R -->|"After 24h"| T["Data expired screen"]

    T --> U{"User choice"}
    U -->|"Start fresh"| H
    U -->|"Download app"| E

    style D fill:#6366f1,color:#fff
    style H fill:#10b981,color:#fff
    style J fill:#10b981,color:#fff
    style P fill:#10b981,color:#fff
    style T fill:#ef4444,color:#fff
```

## Implementation Order & Dependencies

```mermaid
gantt
    title Web App Integration — Implementation Phases
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Phase 1: Web App
    Replace hardcoded identity with passkey  :p1a, 2026-02-06, 2d
    Add hub connection (signalingUrl)         :p1b, 2026-02-06, 1d
    Wire OnboardingFlow into app              :p1c, after p1a, 1d
    Add OfflineIndicator + HubStatus          :p1d, after p1c, 1d
    Test onboarding end-to-end locally        :p1e, after p1d, 1d

    section Phase 2: CI & Deploy
    Configure Vite base=/app/                 :p2a, after p1b, 1d
    Configure TanStack Router basepath        :p2b, after p2a, 1d
    Update PWA manifest scope                 :p2c, after p2a, 1d
    Update deploy-site.yml                    :p2d, after p2b, 1d
    Add SPA fallback (404.html)               :p2e, after p2d, 1d
    Verify deployment on GitHub Pages         :p2f, after p2e, 1d

    section Phase 3: Landing Page
    Add "Try it" CTA to Hero                  :p3a, after p2f, 1d
    Add "Try it" to Nav                       :p3b, after p2f, 1d
    Add "Try in browser" to GetStarted        :p3c, after p2f, 1d

    section Phase 4: Demo Polish
    DemoBanner component                      :p4a, after p1e, 2d
    DemoQuotaIndicator component              :p4b, after p4a, 1d
    DemoDataExpiredScreen                     :p4c, after p4a, 1d

    section Phase 5: Hub Hardening
    Quota enforcement service                 :p5a, after p4a, 2d
    Demo rate limit tier                      :p5b, after p5a, 1d
    Hub initial-sync service                  :p5c, after p5a, 2d
```

## File Change Summary

### Must Change (Phase 1 + 2)

| File                                | Change                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| `apps/web/src/main.tsx`             | Replace hardcoded identity with passkey auth + onboarding + hub URL |
| `apps/web/src/routes/__root.tsx`    | Add OfflineIndicator, HubStatusIndicator, DemoBanner                |
| `apps/web/vite.config.ts`           | Set `base: '/app/'`, update PWA manifest scope                      |
| `apps/web/package.json`             | Add `@xnet/identity` dependency                                     |
| `.github/workflows/deploy-site.yml` | Full workspace build + web app copy step                            |

### Must Create (Phase 1 + 2)

| File                   | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `apps/web/src/App.tsx` | Top-level component with auth gate + onboarding |

### Should Change (Phase 3)

| File                                            | Change                   |
| ----------------------------------------------- | ------------------------ |
| `site/src/components/sections/Hero.astro`       | Add "Try it now" CTA     |
| `site/src/components/sections/Nav.astro`        | Add "Try it" nav link    |
| `site/src/components/sections/GetStarted.astro` | Add "Try in browser" CTA |

### Should Create (Phase 4)

| File                                                      | Purpose                 |
| --------------------------------------------------------- | ----------------------- |
| `packages/react/src/components/DemoBanner.tsx`            | Demo mode banner        |
| `packages/react/src/components/DemoQuotaIndicator.tsx`    | Storage quota indicator |
| `packages/react/src/components/DemoDataExpiredScreen.tsx` | Post-eviction screen    |

### Could Create (Phase 5)

| File                                        | Purpose                               |
| ------------------------------------------- | ------------------------------------- |
| `packages/hub/src/services/quota.ts`        | Per-DID quota enforcement             |
| `packages/hub/src/services/initial-sync.ts` | Server-push full state to new devices |

## Risks & Mitigations

| Risk                                              | Impact                                              | Mitigation                                                                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub Pages 404.html SPA fallback is a hack      | Incorrect status codes (404 not 200), poor SEO      | Acceptable for an SPA — search engines don't need to index `/app/doc/xyz`. Can migrate to Cloudflare Pages later for proper `_redirects`.                                                                          |
| Passkey PRF not supported on all browsers         | Users on Firefox/older Chrome can't create identity | `@xnet/identity` already has a fallback path (`createFallbackIdentity`) that encrypts a generated key in IndexedDB. `detectPasskeySupport()` handles detection. Show appropriate UI on `UnsupportedBrowserScreen`. |
| Demo hub eviction confuses returning users        | User returns, data is gone, they're confused        | `DemoDataExpiredScreen` explains what happened and offers clear next steps. The `DemoBanner` warns upfront.                                                                                                        |
| Large packages/\*\* trigger deploys unnecessarily | CI cost increases                                   | Use path filtering in the workflow — only trigger on changes to packages the web app actually depends on, or use turbo's `--filter` to detect affected packages.                                                   |
| PWA service worker caches stale assets at /app/   | Users see old version after deploy                  | `registerType: 'autoUpdate'` in VitePWA already handles this — the service worker auto-updates in the background.                                                                                                  |

## Open Questions

1. **Should the web app share styles/components with the Astro site?** Currently they're completely separate. The site uses Astro components with Tailwind; the web app uses React with Tailwind. They have different Tailwind configs. Keeping them separate is simpler but means visual inconsistency is possible.

2. **Should we add a `/app` page to Astro that redirects to the SPA?** If someone visits `/app` and the SPA's `index.html` is at `/app/index.html`, GitHub Pages should serve it automatically for the directory. But if we want a loading screen or meta tags, an Astro page could render minimal HTML that bootstraps the SPA.

3. **How should the hub report quota usage?** Options: (a) include usage in the WebSocket handshake response, (b) expose a REST endpoint (`GET /quota/:did`), (c) include usage in periodic heartbeats. Option (a) is simplest for initial load; (b) is needed for real-time updates.

4. **Should the web app be a separate PWA or share the site's service worker?** Currently it has its own VitePWA service worker with `scope: '/app/'`. This is correct — the Astro site doesn't need a service worker, and the web app's offline capabilities are independent.

## Cross-Platform Convergence: Write Once, Run Everywhere

The web app integration is part of a larger question: how much UI code should be shared across Electron, Web, and Mobile? Today the answer is "almost none." This section analyzes the current state, proposes a convergence strategy, and outlines how to get there.

### Current Platform Architecture

```mermaid
block-beta
  columns 3

  block:electron["Electron App\napps/electron/"]:1
    e_sidebar["Sidebar (314 lines)"]
    e_page["PageView (907 lines)"]
    e_db["DatabaseView (1300 lines)"]
    e_canvas["CanvasView (183 lines)"]
    e_settings["SettingsView (295 lines)"]
    e_plugins["PluginManager"]
    e_share["ShareButton"]
    e_presence["PresenceAvatars"]
    e_sync["IPC SyncManager"]
  end

  block:web["Web App\napps/web/"]:1
    w_sidebar["Sidebar (65 lines)"]
    w_editor["Editor (31 lines)"]
    w_search["GlobalSearch (240 lines)"]
    w_settings["Settings (42 lines)"]
    w_backlinks["BacklinksPanel (80 lines)"]
  end

  block:expo["Expo App\napps/expo/"]:1
    x_home["HomeScreen (228 lines)"]
    x_doc["DocumentScreen (146 lines)"]
    x_settings["SettingsScreen (126 lines)"]
    x_webview["WebViewEditor (343 lines)"]
    x_storage["ExpoStorageAdapter (185 lines)"]
  end

  style electron fill:#6366f1,color:#fff
  style web fill:#3b82f6,color:#fff
  style expo fill:#f59e0b,color:#000
```

### Code Sharing Audit

| Component          | Electron                                                        | Web                              | Expo                                                 | Shared?                                    |
| ------------------ | --------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| **Sidebar**        | 314 lines, 3 doc types, plugins, collapse                       | 65 lines, pages only             | N/A (FlatList on HomeScreen)                         | No                                         |
| **Editor**         | `@xnet/editor` + 907-line wrapper (comments, plugins, presence) | `@xnet/editor` + 31-line wrapper | CDN TipTap in WebView (no Yjs, no custom extensions) | Partially (Electron+Web share core editor) |
| **Database views** | Full TableView, BoardView from `@xnet/views`                    | None                             | None                                                 | No                                         |
| **Canvas**         | `@xnet/canvas`                                                  | None                             | None                                                 | No                                         |
| **Settings**       | 295 lines, 5 tabs                                               | 42 lines, 2 sections             | 126 lines, RN StyleSheet                             | No                                         |
| **Identity**       | `identityFromPrivateKey()` with profile seed                    | Hardcoded DID + key              | Auto-generated via SDK                               | No                                         |
| **Sync**           | IPC through main process BSM                                    | Disabled                         | Disabled                                             | No                                         |
| **Onboarding**     | None                                                            | None                             | None                                                 | N/A (exists in @xnet/react but unused)     |
| **Search**         | None                                                            | GlobalSearch (240 lines)         | None                                                 | No                                         |
| **Presence**       | DIDAvatar from @xnet/ui                                         | Inline colored spans             | None                                                 | No                                         |
| **Provider stack** | XNet + Blob + Theme + Telemetry + DevTools                      | XNet + Blob + Theme              | React Navigation only                                | Minimal                                    |

### Package Usage Per Platform

```mermaid
graph LR
    subgraph "Shared Packages"
        react["@xnet/react"]
        data["@xnet/data"]
        editor["@xnet/editor"]
        canvas["@xnet/canvas"]
        ui["@xnet/ui"]
        identity["@xnet/identity"]
        sync["@xnet/sync"]
        storage["@xnet/storage"]
        sdk["@xnet/sdk"]
        views["@xnet/views"]
        devtools["@xnet/devtools"]
        plugins["@xnet/plugins"]
        telemetry["@xnet/telemetry"]
    end

    subgraph "Electron"
        E["apps/electron"]
    end

    subgraph "Web"
        W["apps/web"]
    end

    subgraph "Expo"
        X["apps/expo"]
    end

    E --> react
    E --> data
    E --> editor
    E --> canvas
    E --> ui
    E --> identity
    E --> sync
    E --> storage
    E --> sdk
    E --> views
    E --> devtools
    E --> plugins
    E --> telemetry

    W --> react
    W --> data
    W --> editor
    W --> ui
    W --> storage
    W --> sdk

    X --> react
    X --> sdk

    style E fill:#6366f1,color:#fff
    style W fill:#3b82f6,color:#fff
    style X fill:#f59e0b,color:#000
```

Electron uses 13/13 packages. Web uses 6/13. Expo uses 2/13 and barely touches them.

### The Key Insight: Electron's Renderer IS a Web App

The Electron renderer is a Vite-bundled React SPA loaded in a `BrowserWindow`. It uses standard DOM APIs, React, Tailwind, and shared packages. The only Electron coupling is the preload bridge (`window.xnet*` APIs for IPC-based sync, storage, and services).

This means the Electron renderer could run in any browser if the platform bridges were abstracted. And inversely, `apps/web` should converge toward the Electron renderer's feature set rather than duplicating it from scratch.

### The Expo Problem

Expo is the most disconnected platform:

- Does **not** use `XNetProvider`, `BlobProvider`, or `ThemeProvider`
- Does **not** use `@xnet/data`, `@xnet/editor`, `@xnet/ui`, `@xnet/views`, `@xnet/storage`, `@xnet/identity`, `@xnet/sync`, `@xnet/devtools`, or `@xnet/plugins`
- Has its own `useXNet` and `useNode` hooks that wrap `@xnet/sdk`
- Has its own `ExpoStorageAdapter` using `expo-sqlite`
- Loads TipTap from **CDN** in a WebView — no Yjs, no custom extensions, no collaboration
- Uses React Native `StyleSheet` instead of Tailwind
- Networking is disabled

The Expo app is effectively a separate product that happens to share a repo. Getting it to feature parity with Electron by reimplementing everything in React Native would be enormous effort and would create a permanent maintenance burden (every new feature ships twice).

### Proposed Architecture: WebView-First Mobile

The `@xnet/editor` and `@xnet/views` packages are inherently DOM-based (TipTap/ProseMirror requires a DOM). They cannot run natively in React Native. But they run perfectly in a WebView. The Expo app already uses a WebView for the editor — it's just loading a stripped-down CDN version instead of the actual shared code.

The proposal: **Expo should load the web app (`apps/web` build) in a WebView** for all rich content (editor, databases, canvas), with a thin React Native shell for navigation, native storage, and platform-specific features (biometrics, file system, push notifications).

```mermaid
flowchart TD
    subgraph "Proposed Architecture"
        direction TB

        subgraph shell["React Native Shell"]
            nav["Native Navigation\n(tabs, stack)"]
            auth["Native Auth\n(biometrics, secure store)"]
            fs["Native Storage\n(SQLite, file system)"]
            push["Push Notifications"]
        end

        subgraph webview["WebView (apps/web bundle)"]
            app_ui["Full App UI\n(same React components)"]
            editor2["RichTextEditor\n(@xnet/editor)"]
            views2["Database Views\n(@xnet/views)"]
            canvas2["Canvas\n(@xnet/canvas)"]
        end

        subgraph bridge["PostMessage Bridge"]
            b1["storage.get/set/query"]
            b2["identity.unlock/create"]
            b3["sync.connect/send"]
            b4["navigation.push/pop"]
        end

        shell <--> bridge
        bridge <--> webview
    end

    style shell fill:#f59e0b,color:#000
    style webview fill:#3b82f6,color:#fff
    style bridge fill:#6b7280,color:#fff
```

### Three-Tier Convergence Strategy

```mermaid
graph TB
    subgraph tier1["Tier 1: Shared Packages (today)"]
        t1_react["@xnet/react — hooks, providers, onboarding"]
        t1_data["@xnet/data — schemas, NodeStore"]
        t1_editor["@xnet/editor — TipTap editor"]
        t1_views["@xnet/views — database views"]
        t1_canvas["@xnet/canvas — infinite canvas"]
        t1_ui["@xnet/ui — UI primitives"]
        t1_identity["@xnet/identity — passkey auth"]
        t1_sync["@xnet/sync — CRDT sync"]
    end

    subgraph tier2["Tier 2: Shared App Shell (target)"]
        t2_app["apps/web — canonical React SPA"]
        t2_sidebar["Unified Sidebar"]
        t2_settings["Unified Settings"]
        t2_search["Unified Search"]
        t2_onboarding["Onboarding Flow"]
    end

    subgraph tier3["Tier 3: Platform Adapters (thin)"]
        t3_electron["Electron Adapter\nBrowserWindow + preload bridge\nNative menus, auto-update, tray"]
        t3_browser["Browser Adapter\nServed at xnet.fyi/app\nPWA service worker, IndexedDB"]
        t3_mobile["Mobile Adapter\nRN shell + WebView\nNative nav, biometrics, SQLite"]
    end

    tier1 --> tier2
    tier2 --> tier3

    style tier1 fill:#10b981,color:#fff
    style tier2 fill:#6366f1,color:#fff
    style tier3 fill:#f59e0b,color:#000
```

**Tier 1 (Shared Packages)** — Already exists. These are platform-agnostic libraries.

**Tier 2 (Shared App Shell)** — The `apps/web` SPA becomes the canonical UI that all platforms render. It contains the sidebar, settings, editor wrappers, search, onboarding, and all view components. Today, Electron has the most complete feature set, so the web app should converge toward Electron's renderer rather than being built from scratch.

**Tier 3 (Platform Adapters)** — Thin wrappers that provide platform-specific storage, sync, identity, and navigation:

| Concern         | Browser                        | Electron                       | Mobile                                     |
| --------------- | ------------------------------ | ------------------------------ | ------------------------------------------ |
| **Storage**     | IndexedDB via `@xnet/storage`  | SQLite via IPC preload bridge  | SQLite via RN postMessage bridge           |
| **Sync**        | WebSocket direct to hub        | WebSocket via main process BSM | WebSocket via RN bridge or direct          |
| **Identity**    | WebAuthn passkey (browser API) | Touch ID via Electron preload  | Biometrics via `expo-local-authentication` |
| **Rendering**   | Direct DOM                     | BrowserWindow (direct DOM)     | WebView (DOM inside RN)                    |
| **Navigation**  | TanStack Router (URL-based)    | TanStack Router or state-based | RN Navigation wrapping WebView routes      |
| **File access** | File API / downloads           | Node.js `fs` via IPC           | `expo-file-system` via bridge              |
| **Updates**     | Service worker                 | `electron-updater`             | App store / OTA via EAS                    |

### Convergence Path

This is not a "rewrite everything" proposal. It's an incremental convergence:

#### Step 1: Make `apps/web` the Feature-Complete SPA

Bring the web app to parity with Electron's renderer by porting features from `apps/electron/src/renderer/`:

1. **Port the Sidebar** — Electron's sidebar supports pages, databases, canvases, collapsible sections, plugin items, delete, and create menu. The web sidebar only lists pages. Port the Electron sidebar to the web app using the shared `@xnet/views` and `@xnet/ui` packages.

2. **Port DatabaseView and CanvasView** — Currently only in Electron. These use `@xnet/views` and `@xnet/canvas` which are platform-agnostic React packages. They should work in the web app with no changes.

3. **Port comments, presence, share** — The comment system (`CommentPopover`, `CommentsSidebar`, `OrphanedThreadList`) lives in `@xnet/ui`. The presence system uses `DIDAvatar` from `@xnet/ui`. These should be usable directly.

4. **Integrate onboarding** — Wire in `OnboardingProvider` + `OnboardingFlow` from `@xnet/react` (covered in Phase 1 of this exploration).

5. **Add devtools** — `@xnet/devtools` is a React package, not Electron-specific. Add it to the web app for developer experience.

#### Step 2: Abstract Platform Bridges

Define a `PlatformAdapter` interface that each platform implements:

```typescript
type PlatformAdapter = {
  storage: NodeStorageAdapter
  blobStore: BlobStoreAdapter
  sync: SyncManagerFactory
  identity: IdentityProvider
  platform: 'web' | 'electron' | 'mobile'
  capabilities: {
    nativeMenus: boolean
    fileSystem: boolean
    autoUpdate: boolean
    biometrics: boolean
    pushNotifications: boolean
  }
}
```

The web app (`apps/web/src/main.tsx`) detects the platform and uses the appropriate adapter:

- **Browser:** `IndexedDBAdapter` + `WebSocketSyncManager` + `PasskeyIdentityProvider`
- **Electron:** `IPCStorageAdapter` + `IPCSyncManager` + `PreloadIdentityProvider` (injected via `window.xnet*`)
- **Mobile:** `PostMessageStorageAdapter` + `PostMessageSyncManager` + `BiometricIdentityProvider` (bridged via postMessage)

#### Step 3: Electron Renders `apps/web`

Instead of maintaining a separate renderer in `apps/electron/src/renderer/`, Electron loads the `apps/web` build. The preload script injects the platform adapter via `contextBridge`. Electron-specific features (native menus, tray, auto-update, window management) stay in the main process.

```mermaid
sequenceDiagram
    participant Main as Electron Main Process
    participant Preload as Preload Script
    participant Renderer as apps/web SPA
    participant Hub as hub.xnet.fyi

    Main->>Preload: contextBridge.exposeInMainWorld()
    Note over Preload: Injects window.xnet = {<br/>storage: IPCAdapter,<br/>sync: IPCSyncManager,<br/>identity: NativeIdentity<br/>}
    Main->>Renderer: loadFile('apps/web/dist/index.html')
    Renderer->>Renderer: Detect window.xnet → use Electron adapter
    Renderer->>Hub: WebSocket sync (through main process BSM)
```

This eliminates the duplicated renderer code. The Electron app becomes:

- `src/main/` — Main process (window management, IPC handlers, native menus, auto-update)
- `src/preload/` — Bridge injection (same as today)
- **No `src/renderer/`** — Uses `apps/web/dist/` directly

#### Step 4: Mobile Loads `apps/web` in WebView

Replace the current Expo WebView approach (CDN TipTap in inline HTML) with loading the actual `apps/web` bundle. The RN shell provides:

- Tab/stack navigation (wrapping WebView route changes)
- Native biometric auth (bridged to the web app's identity layer)
- SQLite storage (bridged via postMessage as `NodeStorageAdapter`)
- Push notifications
- Native share sheet

```mermaid
sequenceDiagram
    participant RN as React Native Shell
    participant WV as WebView (apps/web)
    participant Bridge as PostMessage Bridge

    RN->>WV: Load apps/web/dist/index.html
    WV->>Bridge: { type: 'storage.query', schema: 'page' }
    Bridge->>RN: Forward to native SQLite
    RN-->>Bridge: { type: 'storage.result', data: [...] }
    Bridge-->>WV: Return query results

    WV->>Bridge: { type: 'identity.unlock' }
    Bridge->>RN: Trigger expo-local-authentication
    RN-->>Bridge: { type: 'identity.result', did: '...', key: Uint8Array }
    Bridge-->>WV: Return identity

    WV->>Bridge: { type: 'navigation.title', title: 'My Page' }
    Bridge->>RN: Update native header title
```

### What This Changes About the Web App Integration

The web app integration (Phases 1-3 of this exploration) becomes even more important under the convergence strategy. `apps/web` is not just "the browser version" — it's the **canonical UI** that all platforms render. Decisions made now about its architecture set the foundation for cross-platform convergence:

1. **The platform adapter pattern should be introduced from the start** — Don't hardcode `IndexedDBAdapter` in `main.tsx`. Use a factory that returns the right adapter for the platform.

2. **Feature parity matters** — Features added to Electron's renderer should be added to `apps/web` instead, since Electron will eventually render `apps/web`.

3. **The onboarding flow is platform-agnostic** — `OnboardingProvider` from `@xnet/react` works in any React environment. Wiring it into `apps/web` means it works on all three platforms for free.

4. **TanStack Router works everywhere** — URL-based routing works in browsers, Electron BrowserWindows, and WebViews. The basepath just changes (`/app/` for browser, `/` for Electron, `/` for WebView).

### Migration Risk Assessment

| Risk                                                   | Severity | Mitigation                                                                                                                                                                                                                |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron renderer rewrite is disruptive                | High     | Incremental migration: first get web app to feature parity, then switch Electron to load it. Keep old renderer as fallback.                                                                                               |
| WebView performance on mobile                          | Medium   | Profile early. TipTap/ProseMirror is lightweight. The current Expo WebView editor already works fine. Only complex database views with many rows might need optimization (virtual scrolling is already in `@xnet/views`). |
| PostMessage bridge latency                             | Medium   | Batch storage queries, use optimistic UI. The bridge only carries data operations, not rendering — the WebView handles all DOM work locally.                                                                              |
| WebView doesn't feel "native" on mobile                | Medium   | The RN shell provides native navigation chrome (headers, tabs, gestures). Content inside the WebView uses the same Tailwind styles. Platform-adaptive CSS can handle differences.                                         |
| Two build targets for `apps/web` (browser vs embedded) | Low      | Same Vite build, different `base` path. The platform adapter pattern means no code changes — just different runtime config.                                                                                               |

## Conclusion

The hardest work is already done. The identity system, onboarding flow, sync infrastructure, and hub are all implemented. The shared packages (`@xnet/react`, `@xnet/editor`, `@xnet/views`, `@xnet/ui`, `@xnet/canvas`) are platform-agnostic React libraries that work in any DOM environment.

The immediate priority is getting `xnet.fyi/app` live:

1. **Wire `apps/web/` to use `@xnet/identity` and `@xnet/react` onboarding** (the biggest code change, ~1 day)
2. **Set Vite base path and TanStack basepath to `/app/`** (config changes, ~1 hour)
3. **Update the CI workflow to build and stitch both projects** (~1 hour)
4. **Add landing page CTAs** (~1 hour)
5. **Build demo UI polish components** (DemoBanner, quota indicator — ~1 day)

The recommended approach (Option B: pre-built SPA copied into site dist) avoids any framework coupling between Astro and the web app, keeps both build pipelines simple, and works within GitHub Pages' constraints.

The broader opportunity is convergence. Today, Electron has the richest feature set (databases, canvas, comments, plugins, devtools) while the web app is a minimal page editor and Expo is essentially a separate product. By making `apps/web` the canonical React SPA and introducing a platform adapter pattern, all three platforms can render the same UI — Electron via BrowserWindow, browsers via direct load, and mobile via WebView. The features are written once in shared packages, the app shell is written once in `apps/web`, and platform-specific concerns (storage, sync, auth, native capabilities) are handled by thin adapters. This is not a rewrite — it's an incremental convergence that starts with the web app integration described in this document.
