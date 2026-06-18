# xNet plugins registry

This directory is the source of the [xNet plugins marketplace](https://xnet.fyi/plugins).
Listing a plugin is a **one-line pull request** — your plugin's code stays in
your own repository.

## Files

| File | Who edits it | What it is |
| --- | --- | --- |
| `community.json` | **you** (via PR) | The submission list: `{ "repo", "category" }` entries pointing at author-owned repos. |
| `first-party.json` | core team | Built-in plugins that ship with the app (`tier: bundled`). |
| `blocked.json` | core team | Blocked repos / authors / plugin ids, and the `revoked` list. |
| `registry.json` | **generated** | The merged, enriched index the site and app read. Don't hand-edit. |

## Submit a plugin

1. **Publish your plugin** in your own GitHub repo and create a Release whose
   assets include `manifest.json` (and your built `plugin.js`). Scaffold a
   starting point with:

   ```sh
   npx xnet plugin scaffold com.you.cool-plugin
   ```

   See the [plugin guide](https://xnet.fyi/docs/guides/plugins/) for the
   manifest format and contribution points.

2. **Add one entry** to `community.json`:

   ```jsonc
   [
     { "repo": "your-handle/xnet-plugin-kanban", "category": "views" }
   ]
   ```

   Categories: `editor`, `views`, `connector`, `productivity`, `finance`,
   `social`, `ai`, `other`.

3. **Open a pull request.** CI validates the submission shape. After merge, a
   daily job enriches your entry from the GitHub API (stars, latest release) and
   points the install link at your Release's `manifest.json`. Updates you ship
   afterward are picked up automatically — no further PRs needed.

## Trust & safety

Community plugins install in a sandbox scoped to their trust tier. On install
the app shows the capabilities a plugin requests, verifies its provenance, and
asks you to approve before anything runs. Plugins found to be malicious are
added to `blocked.json` (`revoked`), which deactivates them in installed apps.
