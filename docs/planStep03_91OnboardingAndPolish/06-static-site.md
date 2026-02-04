# 06: Static Site

> Landing page, documentation, app shell, and download links at xnet.fyi

**Duration:** 4 days
**Dependencies:** Electron releases, demo hub

## Overview

The static site at `xnet.fyi` serves as the primary entry point for xNet. It's built with Astro + Starlight + Tailwind and already exists in the `site/` directory (not in the pnpm workspace). GitHub Pages hosts it for free; the demo Hub runs separately on Railway at `hub.xnet.fyi`.

```
xnet.fyi
├── /                    # Landing page
├── /app                # React SPA (Astro React island) — connects to hub.xnet.fyi
├── /download           # Platform-specific downloads
├── /docs               # Documentation (Starlight)
│   ├── /getting-started
│   ├── /features
│   ├── /self-hosting
│   └── /api
└── /blog               # Optional: updates/changelog
```

**Key architectural decisions:**

- **Subpath `/app`** preferred over subdomain `app.xnet.fyi` — keeps passkey rpId as `xnet.fyi` (portable to subdomains later)
- **Existing `site/` directory** — already set up with Astro + Starlight, NOT in pnpm workspace
- **Build:** `cd site && pnpm build` (separate from monorepo build)

## Implementation

### 1. Astro Project (Existing)

The site already exists at `site/` with Astro + Starlight. Update the config for the custom domain:

```typescript
// site/astro.config.mjs
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import tailwind from '@astrojs/tailwind'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://xnet.fyi',
  base: '/', // Was '/xNet' before custom domain
  integrations: [
    starlight({ title: 'xNet' /* ... */ }),
    tailwind(),
    react() // For /app React SPA island
  ],
  output: 'static'
})
```

### 2. Landing Page

```astro
---
// site/src/pages/index.astro
import Layout from '../layouts/Layout.astro'
import Hero from '../components/Hero.astro'
import Features from '../components/Features.astro'
import HowItWorks from '../components/HowItWorks.astro'
import Testimonials from '../components/Testimonials.astro'
import CTA from '../components/CTA.astro'
---

<Layout title="xNet - Your Private, Local-First Workspace">
  <Hero />
  <Features />
  <HowItWorks />
  <CTA />
</Layout>
```

```astro
---
// site/src/components/Hero.astro
---

<section class="hero">
  <div class="container">
    <h1>Your workspace.<br />Your data.<br />Your rules.</h1>

    <p class="subtitle">
      xNet is a local-first workspace that syncs securely across all your devices.
      No accounts, no cloud lock-in, no compromises.
    </p>

    <div class="cta-buttons">
      <a href="/app" class="primary-button">
        Try it now
        <span class="badge">No signup</span>
      </a>

      <a href="/download" class="secondary-button">
        Download for Desktop
      </a>
    </div>

    <div class="hero-image">
      <img
        src="/images/hero-screenshot.png"
        alt="xNet workspace showing pages, databases, and canvas"
        width="1200"
        height="800"
      />
    </div>

    <div class="trust-badges">
      <span>Open Source</span>
      <span>End-to-End Encrypted</span>
      <span>Works Offline</span>
    </div>
  </div>
</section>

<style>
  .hero {
    padding: 6rem 0 4rem;
    text-align: center;
    background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  }

  h1 {
    font-size: 3.5rem;
    font-weight: 700;
    line-height: 1.1;
    margin-bottom: 1.5rem;
  }

  .subtitle {
    font-size: 1.25rem;
    color: var(--text-secondary);
    max-width: 600px;
    margin: 0 auto 2rem;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .primary-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: var(--primary);
    color: white;
    font-weight: 600;
    border-radius: 8px;
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .primary-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .badge {
    background: rgba(255, 255, 255, 0.2);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .secondary-button {
    padding: 1rem 2rem;
    border: 2px solid var(--border);
    border-radius: 8px;
    text-decoration: none;
    color: var(--text-primary);
    font-weight: 600;
    transition: border-color 0.15s;
  }

  .secondary-button:hover {
    border-color: var(--primary);
  }

  .hero-image {
    margin: 4rem 0 2rem;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .hero-image img {
    width: 100%;
    height: auto;
  }

  .trust-badges {
    display: flex;
    gap: 2rem;
    justify-content: center;
    flex-wrap: wrap;
    color: var(--text-tertiary);
    font-size: 0.875rem;
  }

  .trust-badges span::before {
    content: '✓';
    margin-right: 0.5rem;
    color: var(--success);
  }
</style>
```

### 3. Features Section

```astro
---
// site/src/components/Features.astro
const features = [
  {
    icon: 'lock',
    title: 'True Privacy',
    description: 'Your data is encrypted end-to-end. Even we can\'t read it. No tracking, no ads, no data mining.'
  },
  {
    icon: 'wifi-off',
    title: 'Works Offline',
    description: 'Everything works without internet. Changes sync automatically when you\'re back online.'
  },
  {
    icon: 'devices',
    title: 'Syncs Everywhere',
    description: 'Desktop, mobile, web. Your data follows you across all your devices seamlessly.'
  },
  {
    icon: 'key',
    title: 'You Own Your Keys',
    description: 'Your identity is a cryptographic keypair you control. No email, no password, no accounts.'
  },
  {
    icon: 'git-branch',
    title: 'Real-Time Collaboration',
    description: 'Work with others in real-time. Conflicts resolve automatically with CRDTs.'
  },
  {
    icon: 'server',
    title: 'Self-Hostable',
    description: 'Run your own sync server on any VPS. Full control, full privacy.'
  }
]
---

<section class="features">
  <div class="container">
    <h2>Built Different</h2>
    <p class="section-subtitle">
      xNet isn't another cloud app. It's a new kind of software that puts you in control.
    </p>

    <div class="features-grid">
      {features.map(feature => (
        <div class="feature-card">
          <div class="feature-icon">
            <Icon name={feature.icon} />
          </div>
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
        </div>
      ))}
    </div>
  </div>
</section>
```

### 4. Download Page

```astro
---
// site/src/pages/download.astro
import Layout from '../layouts/Layout.astro'

// Fetch latest release from GitHub API at build time
const releaseRes = await fetch('https://api.github.com/repos/xnet-dev/xnet/releases/latest')
const release = await releaseRes.json()
const version = release.tag_name.replace('v', '')

function getDownloadUrl(pattern: string) {
  const asset = release.assets.find((a: any) => a.name.includes(pattern))
  return asset?.browser_download_url ?? '#'
}
---

<Layout title="Download xNet">
  <section class="download-page">
    <div class="container">
      <h1>Download xNet</h1>
      <p class="version">Version {version}</p>

      <div class="platforms">
        <div class="platform-card" data-platform="mac">
          <div class="platform-icon">
            <AppleIcon />
          </div>
          <h3>macOS</h3>
          <div class="download-options">
            <a href={getDownloadUrl('arm64.dmg')} class="download-button primary">
              Apple Silicon
            </a>
            <a href={getDownloadUrl('x64.dmg')} class="download-button secondary">
              Intel
            </a>
          </div>
          <p class="requirements">macOS 11+ required</p>
        </div>

        <div class="platform-card" data-platform="windows">
          <div class="platform-icon">
            <WindowsIcon />
          </div>
          <h3>Windows</h3>
          <div class="download-options">
            <a href={getDownloadUrl('Setup.exe')} class="download-button primary">
              Download
            </a>
          </div>
          <p class="requirements">Windows 10+ required</p>
        </div>

        <div class="platform-card" data-platform="linux">
          <div class="platform-icon">
            <LinuxIcon />
          </div>
          <h3>Linux</h3>
          <div class="download-options">
            <a href={getDownloadUrl('.AppImage')} class="download-button primary">
              AppImage
            </a>
            <a href={getDownloadUrl('.deb')} class="download-button secondary">
              .deb
            </a>
          </div>
          <p class="requirements">x64 or ARM64</p>
        </div>
      </div>

      <div class="alternative-options">
        <h3>Other Options</h3>
        <ul>
          <li>
            <a href="/app">Use in browser</a> - No download needed
          </li>
          <li>
            <a href="https://github.com/xnet-dev/xnet">Build from source</a> - For developers
          </li>
          <li>
            <a href="/docs/mobile">Mobile apps</a> - iOS and Android (coming soon)
          </li>
        </ul>
      </div>
    </div>
  </section>
</Layout>

<script>
  // Auto-detect platform and highlight it
  const platform = navigator.platform.toLowerCase()
  let detected = 'mac'

  if (platform.includes('win')) detected = 'windows'
  else if (platform.includes('linux')) detected = 'linux'

  document.querySelector(`[data-platform="${detected}"]`)?.classList.add('detected')
</script>
```

### 5. Documentation Structure

```
site/src/content/docs/docs/  # Note: double docs/ — Starlight convention
├── getting-started/
│   ├── index.mdx
│   ├── first-steps.mdx
│   ├── concepts.mdx
│   └── faq.mdx
├── features/
│   ├── pages.mdx
│   ├── databases.mdx
│   ├── canvas.mdx
│   ├── sharing.mdx
│   └── sync.mdx
├── self-hosting/
│   ├── index.mdx
│   ├── docker.mdx
│   ├── vps-guide.mdx
│   └── configuration.mdx
└── api/
    ├── index.mdx
    ├── identity.mdx
    ├── data.mdx
    └── hooks.mdx
```

```mdx
---
// site/src/content/docs/docs/getting-started/index.mdx
title: Getting Started
description: Get up and running with xNet in 5 minutes
---

# Getting Started with xNet

xNet is a local-first workspace for your notes, tasks, and ideas. Here's how to get started.

## Quick Start

1. **[Open xNet](/app)** in your browser, or [download the desktop app](/download)
2. **Authenticate** with Touch ID / Face ID (required)
3. **Create your first page** and start writing

That's it! No email, no password, no account creation.

## What is xNet?

xNet is different from other note-taking and productivity apps:

- **Local-first**: Your data lives on your device, not in the cloud
- **End-to-end encrypted**: Only you can read your data
- **Works offline**: Full functionality without internet
- **Syncs everywhere**: Desktop, mobile, and web
- **Self-hostable**: Run your own sync server if you want

## Core Concepts

### Identity

Your identity in xNet is a cryptographic keypair. This keypair:

- Signs all your changes (proving you wrote them)
- Encrypts your data (only you can read it)
- Identifies you to others (for sharing and collaboration)

You can protect your identity with Face ID, Touch ID, or Windows Hello.

### Sync

xNet syncs data in two ways:

1. **Direct P2P**: When devices are on the same network
2. **Via Hub**: A relay server that bridges devices that can't connect directly

You can use our demo hub (`hub.xnet.fyi`) or [run your own](/docs/self-hosting).

### CRDTs

xNet uses CRDTs (Conflict-free Replicated Data Types) to merge changes from multiple devices. This means:

- No merge conflicts
- Changes from offline devices just work
- Real-time collaboration with no locks

## Next Steps

- [Create your first page](/docs/getting-started/first-steps)
- [Learn about databases](/docs/features/databases)
- [Set up sync](/docs/features/sync)
```

### 6. Docs Layout

```astro
---
// site/src/layouts/DocsLayout.astro (if custom layout needed; Starlight provides its own)
import Layout from './Layout.astro'
import DocsSidebar from '../components/DocsSidebar.astro'
import DocsTableOfContents from '../components/DocsTableOfContents.astro'

const { frontmatter, headings } = Astro.props
---

<Layout title={`${frontmatter.title} - xNet Docs`}>
  <div class="docs-layout">
    <aside class="docs-sidebar">
      <DocsSidebar />
    </aside>

    <main class="docs-content">
      <article>
        <h1>{frontmatter.title}</h1>
        {frontmatter.description && (
          <p class="description">{frontmatter.description}</p>
        )}
        <slot />
      </article>

      <nav class="docs-pagination">
        <a href="#" class="prev">Previous</a>
        <a href="#" class="next">Next</a>
      </nav>
    </main>

    <aside class="docs-toc">
      <DocsTableOfContents headings={headings} />
    </aside>
  </div>
</Layout>

<style>
  .docs-layout {
    display: grid;
    grid-template-columns: 250px 1fr 200px;
    gap: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }

  .docs-sidebar {
    position: sticky;
    top: 5rem;
    height: fit-content;
  }

  .docs-content {
    min-width: 0;
  }

  .docs-content article {
    max-width: 800px;
  }

  .docs-toc {
    position: sticky;
    top: 5rem;
    height: fit-content;
  }

  @media (max-width: 1200px) {
    .docs-layout {
      grid-template-columns: 250px 1fr;
    }
    .docs-toc {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .docs-layout {
      grid-template-columns: 1fr;
    }
    .docs-sidebar {
      display: none;
    }
  }
</style>
```

### 7. GitHub Actions for Deployment

```yaml
# .github/workflows/static-site.yml

name: Deploy Static Site

on:
  push:
    branches: [main]
    paths:
      - 'site/**'
      - '.github/workflows/static-site.yml'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: cd site && pnpm install --frozen-lockfile

      - name: Build site
        run: cd site && pnpm build
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 8. Custom Domain Setup

```
# site/public/CNAME
xnet.fyi
```

DNS Configuration:

```
Type  Name  Value
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   crs48.github.io
```

## Testing

```typescript
describe('Static Site', () => {
  it('landing page renders', async () => {
    const res = await fetch('http://localhost:4321/')
    expect(res.ok).toBe(true)
    const html = await res.text()
    expect(html).toContain('xNet')
  })

  it('download page shows version', async () => {
    const res = await fetch('http://localhost:4321/download')
    const html = await res.text()
    expect(html).toMatch(/Version \d+\.\d+\.\d+/)
  })

  it('docs pages render', async () => {
    const res = await fetch('http://localhost:4321/docs/getting-started')
    expect(res.ok).toBe(true)
  })

  it('sitemap is generated', async () => {
    const res = await fetch('http://localhost:4321/sitemap.xml')
    expect(res.ok).toBe(true)
    const xml = await res.text()
    expect(xml).toContain('<urlset')
  })
})
```

## Validation Gate

- [ ] Landing page loads and looks good at `xnet.fyi`
- [ ] `/app` route serves React SPA with passkey-first onboarding
- [ ] `/app` connects to `hub.xnet.fyi` for demo sync
- [ ] Download page shows latest release version
- [ ] Platform detection highlights correct download
- [ ] Documentation renders with Starlight navigation
- [ ] Site deploys to GitHub Pages from `site/` directory
- [ ] Custom domain (`xnet.fyi`) works with SSL
- [ ] Passkey rpId is `xnet.fyi` (portable to subdomains later)

---

[Back to README](./README.md) | [Next: Demo Hub ->](./07-demo-hub.md)
