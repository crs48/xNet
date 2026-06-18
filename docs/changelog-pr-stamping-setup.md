# Activating automatic changelog PR-number stamping

*One-time setup, ~5 minutes, GitHub UI only. Until you do it, nothing breaks —
the changelog still works; this just makes the PR number show up in the repo
source, not only on the live site.*

## Background (why this exists)

Each changelog entry lives in a fragment file under
`site/src/data/changelog/*.json`. You write it without a PR number (you don't
know it yet). The number gets attached three ways:

1. `scripts/changelog/new.mjs --pr auto` bakes it in if the PR already exists.
2. **At merge**, [`.github/workflows/stamp-pr-number.yml`](../.github/workflows/stamp-pr-number.yml)
   writes the PR number into the fragment and commits it back to `main`.
3. At deploy, `scripts/changelog/resolve-prs.mjs` fills any remaining gap (the net).

Step 2 is the one that needs setup. To commit back to `main`, the workflow must
push to a protected branch — and our `main` ruleset blocks direct pushes ("Changes
must be made through a pull request"). A **GitHub App** that's on the ruleset's
**bypass list** is the secure way to allow exactly this one automated push.

Without the App, step 2 safely no-ops with a warning and step 3 keeps the live
site correct — so this is optional, just nicer (the repo source matches what's
published, and the number is visible in `git`).

## Setup

### 1. Create the GitHub App

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
(this can live under your personal account, since the repo is `crs48/xNet`).

- **GitHub App name:** e.g. `xnet-changelog-bot`
- **Homepage URL:** anything (e.g. `https://github.com/crs48/xNet`)
- **Webhook:** **uncheck "Active"** (no webhook needed)
- **Repository permissions → Contents:** **Read and write** (this is the only
  permission required; leave everything else "No access")
- **Where can this app be installed:** "Only on this account"

Click **Create GitHub App**. On the next page, note the **App ID** (a number near
the top).

### 2. Generate a private key

On the App's settings page, scroll to **Private keys → Generate a private key**.
A `.pem` file downloads. Keep it handy for step 4.

### 3. Install the App on the repo

In the App's left sidebar: **Install App → Install** on your account → choose
**"Only select repositories" → `crs48/xNet`** → Install.

### 4. Add the credentials to the repo

Go to **`crs48/xNet` → Settings → Secrets and variables → Actions**:

- **Variables** tab → **New repository variable**
  - Name: `CHANGELOG_APP_ID`
  - Value: the App ID number from step 1
- **Secrets** tab → **New repository secret**
  - Name: `CHANGELOG_APP_PRIVATE_KEY`
  - Value: the **entire contents** of the `.pem` file from step 2, including the
    `-----BEGIN RSA PRIVATE KEY-----` / `-----END RSA PRIVATE KEY-----` lines

> The App ID is a variable (not sensitive, and the workflow reads it in an `if`).
> The private key is a secret.

### 5. Add the App to the `main` ruleset bypass list

Go to **`crs48/xNet` → Settings → Rules → Rulesets**, open the ruleset that
protects `main`, find **Bypass list → Add bypass**, choose **GitHub Apps** and
select your App, then **Save**.

This is what actually lets the stamp commit land on `main`.

## Verify it worked

On the **next** changelog PR you merge:

1. Open the **Actions** tab → the **"Stamp Changelog PR Number"** run for that PR.
   The "Mint a GitHub App token" step should succeed and the push should land
   (no `::warning`).
2. Check the source now carries the number:
   ```bash
   git fetch origin main
   git show origin/main:site/src/data/changelog/<the-entry-id>.json | grep '"pr"'
   ```
   You should see `"pr": <N>` — i.e. the repo matches the live site.

You'll also see a small commit on `main` like
`docs(changelog): link PR #<N> to its fragment [skip ci]`. The `[skip ci]` is
intentional — the merge's own deploy already published the number, so this commit
just reconciles source without re-deploying.

## Troubleshooting

- **Still seeing the `::warning` "Could not push…"** — the App isn't on the
  ruleset bypass list (step 5), or the private key/App ID don't match. Re-check
  steps 4–5. The changelog is unaffected meanwhile (the deploy-time net fills it).
- **"Mint a GitHub App token" step is skipped** — the `CHANGELOG_APP_ID` variable
  is unset or empty (step 4). The workflow then falls back to the default token
  and degrades to the warning by design.

## Don't want a GitHub App?

A fine-grained **PAT** with **Contents: write** works too: store it as the
`CHANGELOG_BOT_TOKEN` secret and add its owner (your admin role) to the ruleset
bypass. The workflow already honours `CHANGELOG_BOT_TOKEN` as a fallback. A PAT is
simpler but longer-lived and tied to a person; the App is the recommended option.
