# 0050: Hosting xNet Web App on GitHub Pages — Free Demo at /app

> **Status:** Completed
> **Created:** 2026-02-04
> **Tags:** web-app, github-pages, deployment, onboarding, identity, demo

## Implementation Status

- [x] **Vite base path** — `base: '/app/'` in `apps/web/vite.config.ts`
- [x] **TanStack Router basepath** — `basepath: '/app'` configured
- [x] **PWA manifest scope** — `scope: '/app/'` for service worker
- [x] **Deploy workflow** — `deploy-site.yml` builds web app and copies to `site/dist/app/`
- [x] **SPA fallback** — 404.html copied for client-side routing
- [x] **CNAME** — `xnet.fyi` custom domain configured
- [x] **Landing page CTA** — "Try it now" button links to `/app`
- [x] **Passkey identity** — Client-side Ed25519 key generation via `@xnet/identity`
- [x] **Progressive identity** — Onboarding flow with passkey creation
- [x] **Hub connection** — `wss://hub.xnet.fyi` as default signaling URL

## Summary

This exploration investigates embedding the xNet web app (currently `apps/web/`) into the Astro documentation site at `/app`, deployed for free on GitHub Pages. We analyze the technical feasibility, identity/key generation without a server, sync constraints, onboarding tradeoffs, and compare GitHub Pages hosting vs Railway/Vercel alternatives.

**Key finding:** A fully functional demo app on GitHub Pages is feasible — the web app is already a static SPA with IndexedDB storage and ~320 KB gzipped. The main challenges are SPA routing on GitHub Pages, identity generation without a backend, and sync without a Hub. All are solvable.

---

## Current State

### Web App (`apps/web/`)

| Property          | Value                                        |
| ----------------- | -------------------------------------------- |
| Framework         | React 18 + Vite 5 + TanStack Router          |
| Output            | Static SPA (~1 MB raw, ~320 KB gzipped)      |
| Storage           | IndexedDB (structured data + blobs)          |
| Identity          | Hardcoded placeholder DID + fake signing key |
| Sync              | Disabled (`disableSync: true`)               |
| PWA               | Configured (Workbox service worker)          |
| Server dependency | **None** — fully client-side                 |

### Astro Site (`site/`)

| Property     | Value                                             |
| ------------ | ------------------------------------------------- |
| Output       | Static (SSG), deployed to GitHub Pages            |
| Base URL     | `/xNet`                                           |
| Routing      | Landing page at `/`, Starlight docs at `/docs/**` |
| React        | Not installed — pure Astro components             |
| `/app` route | **Unclaimed** — available                         |

---

## Architecture: How It Would Work

```mermaid
flowchart TB
    subgraph "GitHub Pages (crs48.github.io/xNet)"
        direction TB
        LANDING["/\nLanding Page\n(Astro)"]
        DOCS["/docs/**\nDocumentation\n(Starlight)"]
        APP["/app\nWeb App\n(React SPA)"]
    end

    subgraph "User's Browser"
        direction TB
        IDB[("IndexedDB\nAll data stored locally")]
        SW["Service Worker\nOffline support"]
        KEYS["Ed25519 Keys\nGenerated client-side"]
    end

    subgraph "Optional External"
        HUB["Hub\n(Railway/Fly.io)\nFor sync only"]
    end

    LANDING -->|"Try it now"| APP
    APP --> IDB
    APP --> SW
    APP --> KEYS
    APP -.->|"Optional WebSocket"| HUB

    style LANDING fill:#e3f2fd
    style DOCS fill:#e3f2fd
    style APP fill:#e8f5e9
    style IDB fill:#f3e5f5
    style KEYS fill:#fff3e0
    style HUB fill:#fff3e0
```

The app runs entirely in the browser. GitHub Pages serves the static files. No server needed for core functionality — identity, storage, editing, and offline all work without a backend.

---

## Technical Implementation

### 1. Embedding React in the Astro Site

Two approaches:

#### Option A: Astro React Island (Recommended)

Add `@astrojs/react` to the site and create a catch-all page:

```mermaid
flowchart LR
    subgraph "Astro Build"
        PAGE["src/pages/app.astro"]
        REACT["XNetApp component\nclient:only='react'"]
        PAGE --> REACT
    end

    subgraph "Runtime"
        SHELL["HTML shell\n(server-rendered by Astro)"]
        SPA["React SPA\n(hydrates in browser)"]
        SHELL --> SPA
    end
```

```astro
<!-- site/src/pages/app.astro -->
---
import AppLayout from '../layouts/AppLayout.astro'
---
<AppLayout title="xNet App">
  <div id="app-root">
    <!-- React mounts here via client:only -->
    <XNetApp client:only="react" />
  </div>
</AppLayout>
```

Astro renders the HTML shell at build time. React takes over in the browser. The `client:only="react"` directive means zero server-side rendering of React — it's purely a client-side SPA.

#### Option B: Separate Vite Build, Copy to dist

Build the web app separately and copy `apps/web/dist/` into `site/dist/app/`:

```bash
# In CI/CD
cd apps/web && pnpm build --base /xNet/app/
cp -r dist/ ../site/dist/app/
```

This is simpler but creates two separate builds and duplicates React/Tailwind bundles.

**Recommendation: Option A** — single build, shared dependencies, consistent styling.

### 2. SPA Routing on GitHub Pages

GitHub Pages serves static files — there's no server to handle `pushState` routing. When a user navigates to `/xNet/app/doc/abc123` and refreshes, GitHub Pages returns 404.

```mermaid
flowchart TB
    subgraph "The Problem"
        USER["User refreshes\n/xNet/app/doc/abc123"]
        GHP["GitHub Pages"]
        404["404.html\n(no matching file)"]
        USER --> GHP --> 404
    end

    subgraph "Solution: 404.html Redirect"
        direction TB
        404B["404.html intercepts"]
        REDIRECT["Encodes path in URL fragment\n/xNet/app#/doc/abc123"]
        INDEX["app.astro loads\nReact reads fragment\nNavigates to correct route"]
        404B --> REDIRECT --> INDEX
    end

    style 404 fill:#f87171,color:#fff
    style INDEX fill:#34d399,color:#fff
```

Three solutions:

| Solution                       | Complexity |                             UX                             |
| ------------------------------ | :--------: | :--------------------------------------------------------: |
| **Hash routing** (`#/doc/abc`) |    Low     |               Ugly URLs but works perfectly                |
| **404.html redirect trick**    |   Medium   |             Clean URLs, brief flash on refresh             |
| **Pre-render known routes**    |    High    | Clean URLs, no flash, but can't pre-render dynamic doc IDs |

**Recommendation: Hash routing** for the demo. It's the simplest and most reliable on GitHub Pages. TanStack Router supports `createHashHistory()`.

### 3. Identity & Key Generation

This is the most interesting challenge. The onboarding plan (`plan03_9_1OnboardingAndPolish`) specifies passkey-based identity with PRF key derivation. Can we do this on GitHub Pages?

```mermaid
flowchart TB
    subgraph "Identity Options on GitHub Pages"
        direction TB

        A["Option 1:\nPasskey + PRF\n(Full spec)"]
        B["Option 2:\nClient-generated keys\n(Simpler)"]
        C["Option 3:\nPasskey without PRF\n(Fallback)"]
    end

    subgraph "Passkey + PRF"
        A1["WebAuthn PRF extension"]
        A2["Derive Ed25519 from PRF output"]
        A3["Key never stored"]
        A4["⚠️ rpId must match domain"]
    end

    subgraph "Client-generated"
        B1["crypto.getRandomValues()"]
        B2["Generate Ed25519 keypair"]
        B3["Store in IndexedDB"]
        B4["✅ Works everywhere"]
    end

    subgraph "Passkey without PRF"
        C1["Passkey protects unlock"]
        C2["Key encrypted in IndexedDB"]
        C3["Less secure than PRF"]
        C4["✅ Wider browser support"]
    end

    A --> A1 --> A2 --> A3 --> A4
    B --> B1 --> B2 --> B3 --> B4
    C --> C1 --> C2 --> C3 --> C4

    style A fill:#e8f5e9
    style B fill:#e3f2fd
    style C fill:#fff3e0
```

#### Passkey PRF on GitHub Pages

The WebAuthn `rpId` (Relying Party ID) is tied to the domain. For GitHub Pages:

- **rpId:** `crs48.github.io`
- **origin:** `https://crs48.github.io`

This works! Passkeys created on `crs48.github.io` are valid for that domain. However:

| Concern                              | Impact                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| Passkey is tied to `crs48.github.io` | If we later move to `xnet.dev`, passkeys won't transfer |
| PRF support                          | Chrome 116+, Safari 18+, Firefox experimental           |
| Cross-device passkey sync            | Works via iCloud Keychain / Google Password Manager     |

**The rpId portability problem is significant.** If a user creates a passkey on `crs48.github.io` and we later host on `xnet.dev`, they can't use that passkey. Their DID would be the same (derived from PRF output which is the same regardless of rpId), but they'd need to re-register the passkey on the new domain.

#### Recommended Approach: Progressive Identity

```mermaid
sequenceDiagram
    participant User
    participant App as Web App (/app)
    participant IDB as IndexedDB
    participant PK as Passkey Provider

    Note over User,PK: First Visit (Anonymous)
    User->>App: Open /xNet/app
    App->>App: Generate ephemeral Ed25519 keypair
    App->>IDB: Store keypair (unprotected)
    App->>App: Derive DID:key
    App->>User: Ready to use! (anonymous mode)

    Note over User,PK: User Decides to Persist
    User->>App: "Save my identity"
    App->>PK: navigator.credentials.create({prf})
    PK->>User: Biometric prompt
    User->>PK: Touch ID
    PK->>App: PRF output

    alt PRF Supported
        App->>App: Derive NEW keypair from PRF
        App->>App: Migrate data to new DID
        App->>IDB: Store passkey credential ID
        App->>IDB: Delete old ephemeral key
    else PRF Not Supported
        App->>App: Encrypt existing key with passkey
        App->>IDB: Store encrypted key + credential ID
    end

    App->>User: Identity saved! Works across devices.

    Note over User,PK: Returning Visit
    User->>App: Open /xNet/app
    App->>IDB: Check for stored credential
    App->>PK: navigator.credentials.get({prf})
    PK->>User: Touch ID prompt
    User->>PK: Authenticate
    PK->>App: PRF output → same keypair
    App->>User: Welcome back!
```

This approach:

1. **Zero friction start** — user starts immediately with a generated key
2. **Optional upgrade** — passkey protection when they're ready
3. **Works on GitHub Pages** — no server needed for WebAuthn (it's a client-side API)
4. **Portable** — if they later use the Electron app, same passkey = same DID

### 4. Sync Without a Hub

The demo can work in three modes:

```mermaid
flowchart LR
    subgraph "Mode 1: Solo (Default)"
        S1["All data in IndexedDB"]
        S2["No network needed"]
        S3["Works offline"]
    end

    subgraph "Mode 2: P2P"
        P1["WebRTC between\nbrowser tabs/devices"]
        P2["Needs signaling server"]
        P3["Free via demo Hub"]
    end

    subgraph "Mode 3: Hub Sync"
        H1["Persistent relay"]
        H2["Cross-device sync"]
        H3["Needs Hub running"]
    end

    S1 --> P1
    P1 --> H1

    style S1 fill:#e8f5e9
    style P1 fill:#e3f2fd
    style H1 fill:#fff3e0
```

| Mode         | Requirements     | Cost           | UX                                |
| ------------ | ---------------- | -------------- | --------------------------------- |
| **Solo**     | Nothing          | Free           | Single device, all data local     |
| **P2P**      | Signaling server | ~$0 (demo Hub) | Multi-tab/device when both online |
| **Hub sync** | Running Hub      | ~$0-5/mo       | Async sync, backup, search        |

**For the GitHub Pages demo, Solo mode is the default.** Users create and edit content with zero infrastructure. If they want sync, they can:

1. Connect to our demo Hub (we'd run one on Railway for ~$0-2/mo)
2. Self-host their own Hub

This is actually _the perfect demo of local-first_: everything works without a server.

### 5. What We Can Demo Without a Hub

| Feature               | Works on GH Pages? | Notes                                 |
| --------------------- | :----------------: | ------------------------------------- |
| Create/edit pages     |        Yes         | Rich text editor (TipTap)             |
| Create/edit databases |        Yes         | Schema system, 15 property types      |
| Canvas                |        Yes         | Infinite canvas with spatial indexing |
| Offline               |        Yes         | Service worker + IndexedDB            |
| Identity (basic)      |        Yes         | Client-generated Ed25519 keys         |
| Identity (passkey)    |        Yes         | WebAuthn is a client-side API         |
| File attachments      |        Yes         | Stored in IndexedDB blobs             |
| Search                |        Yes         | Client-side IndexedDB queries         |
| Sync between devices  |         No         | Needs signaling server                |
| Encrypted backup      |         No         | Needs Hub                             |
| Sharing/collaboration |         No         | Needs Hub + signaling                 |

### 6. What We Need a Hub For

If we want the demo to support sync, we need a running Hub. Options:

```mermaid
flowchart TB
    subgraph "Demo Hub Hosting Options"
        direction TB
        RW["Railway\n$0-2/mo\n(within free credits)"]
        FLY["Fly.io\n$2-4/mo\n(auto-suspend)"]
        CF["Cloudflare Workers\nDurable Objects\n~$0.15/mo"]
    end

    subgraph "Connects To"
        APP["Web App on\nGitHub Pages"]
        ELECTRON["Electron App\n(desktop)"]
    end

    APP --> RW
    APP --> FLY
    ELECTRON --> RW
    ELECTRON --> FLY

    style RW fill:#e8f5e9
    style FLY fill:#e3f2fd
    style CF fill:#fff3e0
```

---

## GitHub Pages vs Alternative Hosts

### For the Static Site + Demo App

| Feature                  |  GitHub Pages  | Railway (Static) |     Vercel      |   Cloudflare Pages    |
| ------------------------ | :------------: | :--------------: | :-------------: | :-------------------: |
| **Cost**                 |      Free      |   ~$0 (static)   |  Free (Hobby)   |         Free          |
| **Custom domain**        |      Yes       |       Yes        |       Yes       |          Yes          |
| **SPA routing**          | 404.html hack  | Native rewrites  | Native rewrites |    Native rewrites    |
| **Build CI/CD**          | GitHub Actions |     Git push     |    Git push     |       Git push        |
| **Bandwidth**            |   100 GB/mo    |     Included     |    100 GB/mo    |       Unlimited       |
| **Deploy from monorepo** | Yes (Actions)  |       Yes        |       Yes       |          Yes          |
| **WebSocket (for Hub)**  |       No       |       Yes        | No (serverless) | Yes (Durable Objects) |

### The Key Tradeoff

```mermaid
flowchart LR
    subgraph "GitHub Pages"
        GH1["✅ Free forever"]
        GH2["✅ Already deployed"]
        GH3["✅ GitHub integration"]
        GH4["❌ No SPA rewrites"]
        GH5["❌ No server (Hub separate)"]
        GH6["❌ 404.html hack for routing"]
    end

    subgraph "Railway / Vercel"
        RV1["✅ SPA rewrites"]
        RV2["✅ Preview deploys"]
        RV3["✅ Cleaner routing"]
        RV4["⚠️ Hobby tier limits"]
        RV5["⚠️ Another provider to manage"]
        RV6["✅ Could co-host Hub + App"]
    end

    style GH1 fill:#e8f5e9
    style GH4 fill:#fce4ec
    style RV1 fill:#e8f5e9
    style RV5 fill:#fff3e0
```

**Recommendation: Start on GitHub Pages, migrate if needed.** The hash routing limitation is minor for a demo. If we later want clean URLs, we can move the app to Vercel/Cloudflare Pages while keeping docs on GitHub Pages, or use a custom domain with Cloudflare in front.

---

## Onboarding Flow on GitHub Pages

Based on the onboarding plan (`plan03_9_1OnboardingAndPolish`), here's how the user journey maps to a GitHub Pages demo:

```mermaid
sequenceDiagram
    participant User
    participant Site as Landing Page<br/>(crs48.github.io/xNet)
    participant App as Demo App<br/>(/xNet/app)
    participant IDB as IndexedDB

    User->>Site: Visit landing page
    Site->>User: "Try xNet — no signup required"

    User->>App: Click "Try it now"
    App->>App: Generate Ed25519 keypair
    App->>IDB: Store keypair + DID
    App->>User: Welcome! Here's a sample page.

    User->>App: Edit page, create database
    App->>IDB: All changes saved locally

    User->>App: "I like this. Save my identity."
    App->>App: Passkey creation (WebAuthn)
    App->>IDB: Store credential ID

    Note over User,IDB: Days later, returns...

    User->>App: Open /xNet/app
    App->>IDB: Found credential ID
    App->>App: Passkey unlock (Touch ID)
    App->>User: Welcome back! All your data is here.

    Note over User,IDB: Optional: Enable sync

    User->>App: "Connect to Hub" in settings
    App->>App: Connect to wss://hub.up.railway.app
    App->>User: Sync enabled! Use on other devices too.
```

### What the Onboarding Plan Requires vs What GitHub Pages Can Do

| Onboarding Step                   | Needs Server? |              GitHub Pages?              |
| --------------------------------- | :-----------: | :-------------------------------------: |
| Visit landing page                |      No       |                   Yes                   |
| Try web app immediately           |      No       |                   Yes                   |
| Generate identity (Ed25519)       |      No       |                   Yes                   |
| Passkey creation (WebAuthn PRF)   |      No       |                   Yes                   |
| Passkey unlock (returning user)   |      No       |                   Yes                   |
| Create pages, databases, canvases |      No       |                   Yes                   |
| Offline access (PWA)              |      No       |                   Yes                   |
| Cross-device sync via passkey     | **Yes** (Hub) | Partial — passkey syncs, data needs Hub |
| Hub-mediated sync                 | **Yes** (Hub) |            Need external Hub            |
| Share via link                    | **Yes** (Hub) |            Need external Hub            |
| Download desktop app              |      No       |      Yes (link to GitHub Releases)      |

**8 of 11 onboarding steps work on GitHub Pages with zero infrastructure.**

---

## Implementation Plan

### Phase 1: Static Demo (No Sync)

1. Install `@astrojs/react` and `react`/`react-dom` in `site/`
2. Create `site/src/pages/app.astro` with React `client:only` island
3. Port essential web app components (editor, database, canvas)
4. Implement client-side key generation (replace hardcoded DID)
5. Configure hash routing for TanStack Router
6. Add "Try it now" button on landing page linking to `/xNet/app`
7. Add PWA manifest and icons

### Phase 2: Identity (Passkey)

1. Implement `createIdentityManager()` from passkey plan
2. Progressive identity: start anonymous, upgrade to passkey
3. Store credential ID + public key in IndexedDB
4. Implement passkey unlock flow

### Phase 3: Optional Sync (External Hub)

1. Deploy demo Hub on Railway (~$0-2/mo)
2. Add Hub URL configuration in app settings
3. Re-enable `WebSocketSyncProvider` when Hub URL is set
4. Add "Connect to Hub" onboarding step (optional)

---

## Bundle Size Considerations

Current web app bundle: ~985 KB raw, ~313 KB gzipped. Adding it to the Astro site:

| Component                      | Size Impact              |
| ------------------------------ | ------------------------ |
| React + ReactDOM               | ~140 KB (already needed) |
| TanStack Router                | ~45 KB                   |
| TipTap Editor                  | ~350 KB (largest dep)    |
| @xnet/data + @xnet/react       | ~120 KB                  |
| @xnet/crypto (BLAKE3, Ed25519) | ~80 KB (WASM)            |
| @xnet/storage (IndexedDB)      | ~30 KB                   |
| Tailwind (shared with site)    | 0 KB (already included)  |

**Total app bundle: ~750-900 KB gzipped**, loaded only when visiting `/app`. The landing page and docs remain lightweight.

Using `client:only="react"` ensures the app JS is only loaded on the `/app` route — it doesn't affect landing page or docs performance.

---

## Risks and Mitigations

| Risk                                       | Impact                                              | Mitigation                                                        |
| ------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| **Passkey rpId tied to `crs48.github.io`** | Can't migrate passkeys to custom domain             | Accept for demo; use custom domain from the start if possible     |
| **No sync in demo**                        | Users might think xNet doesn't sync                 | Clear messaging: "This is a solo demo. Enable sync in settings."  |
| **IndexedDB data loss**                    | Browser clear storage deletes everything            | Encourage passkey + Hub backup; warn users                        |
| **Hash routing looks unprofessional**      | URLs like `/xNet/app#/doc/abc`                      | Minor for a demo; migrate to Vercel/CF Pages for clean URLs later |
| **Large bundle for demo**                  | ~900 KB JS on first load                            | Service worker caches after first load; subsequent visits instant |
| **WebAuthn on GitHub Pages subdomain**     | Some browsers restrict WebAuthn to "secure context" | GitHub Pages is HTTPS — this works fine                           |
| **Crypto WASM in browser**                 | BLAKE3/Ed25519 WASM might not load                  | All @xnet/crypto already works in browsers; tested in web app     |

---

## Decision: Do We Need a Hub for the Demo?

```mermaid
flowchart TB
    Q1{"What's the goal\nof the demo?"}

    Q1 -->|"Show editing + local-first"| SOLO["Solo mode\nGitHub Pages only\n$0/mo"]
    Q1 -->|"Show sync + collaboration"| SYNC["Hub needed\nRailway: $0-2/mo"]
    Q1 -->|"Full onboarding flow"| FULL["Hub + passkey sync\nRailway: $0-2/mo"]

    SOLO -->|"Sufficient for"| S1["Landing page 'Try it now'\nEditor demo\nDatabase demo\nCanvas demo\nOffline PWA"]

    SYNC -->|"Also enables"| S2["Cross-device sync\nReal-time collaboration\nShare links"]

    FULL -->|"Also enables"| S3["Passkey → desktop handoff\nEncrypted backup\nFull onboarding journey"]

    style SOLO fill:#e8f5e9
    style SYNC fill:#e3f2fd
    style FULL fill:#fff3e0
```

**Recommendation: Start with Solo mode (Phase 1).** It demonstrates the core local-first value proposition at zero cost. Add Hub sync (Phase 3) when the Hub is ready — it's a configuration change, not an architectural one.

---

## Key Takeaways

1. **Hosting the web app on GitHub Pages at `/app` is fully feasible** — it's already a static SPA with zero server dependencies
2. **Identity generation works client-side** — Ed25519 keys via `@xnet/crypto`, passkeys via WebAuthn (both are browser APIs, no server needed)
3. **The passkey rpId portability issue is the main concern** — passkeys created on `crs48.github.io` won't transfer to a custom domain
4. **8 of 11 onboarding steps work without any server** — the demo is genuinely useful even without sync
5. **Hash routing is the pragmatic choice** for GitHub Pages SPA routing
6. **Bundle cost is ~900 KB gzipped** but only loads on `/app` — doesn't affect landing page or docs
7. **Adding sync later is a config change** — deploy a Hub on Railway ($0-2/mo) and set the URL in settings
8. **Option A (Astro React island)** is the recommended integration approach — single build, shared Tailwind, clean separation
