# Rich chat media — local Electron verification

2026-10-22, `codex/chat-first-redesign`, profile `dev-wt-xNet`.
Use the **Rich media lab** conversation for a hands-on example. This pass used
the real desktop app over its worktree-specific CDP port and native macOS UI.

## Verified in the app

- Markdown headings, emphasis, strikethrough, lists, quotes, fenced code, and
  tables render as semantic elements.
- A YouTube URL resolves its title and thumbnail. Clicking Play creates the
  player; the test video reached a ready state and advanced playback. Its frame
  has no `window.xnet` bridge.
- A GitHub URL shows its Open Graph title, description, and image. The image is
  a local blob URL, not a request from the reader to GitHub.
- A directly linked PNG and an uploaded PNG render inline.
- A linked PDF opens in a centered, light-themed dialog. Electron's PDF viewer
  displayed the document text and its page/zoom/download controls.
- Uploaded audio loads with native controls and a valid duration.
- A directly linked MP4 loads from local blob storage and plays using native
  video controls.
- Text and unsupported-file attachments expose preview or download controls.
- Sending immediately after entering a URL saves the message first, then adds
  the preview when resolution finishes.
- An unreachable host displays “Preview unavailable”; removing its preview and
  sending keeps the message usable.
- Navigating away revokes all four image object URLs observed in the lab.
  Reopening restores the stored previews from local blobs. Renderer reloads also
  preserve the saved messages and preview references.

## Automated checks

The 13 focused tests passed. The affected-package typecheck command completed
all 102 tasks. The broad changed-file run passed 3,106 tests and encountered one
unrelated `EADDRINUSE` collision in the existing local-API suite; rerunning that
suite alone passed all 28 tests. The earlier related-test pass was green too.
The graph was refreshed with `graphify update .`; the Git hook's Python/stdin
worker invocation failed on macOS, so its duplicate refresh was skipped.

The four focused suites cover Markdown URL extraction, exact YouTube hosts and
video IDs, MIME policy, preview serialization, private and mixed DNS answers,
socket pinning, unsafe redirects, oversized/encoded responses, and cancellation
while DNS is pending. Run them with:

```sh
pnpm exec vitest run \
  --project unit packages/data/src/schema/schemas/link-preview.test.ts \
  --project dom packages/workbench/src/communities/chat-media.test.ts \
  --project electron apps/electron/src/main/chat-media-fetch.test.ts \
  apps/electron/src/main/chat-media-fetch-transport.test.ts
```

## Scope and limits

Automatic resolution handles at most three URLs per message, with a 12-second
deadline and 10 MiB response limit (3 MiB for thumbnail images). Larger files can
be attached explicitly. Unsupported formats remain downloadable. HTML and SVG
attachments are not executed as previews; text previews are bounded at 200 KB.

This pass does not establish two-device blob delivery, packaged-app behavior,
or compatibility with every provider/codec. Sites can refuse metadata or video
embedding. Preview jobs are in memory: quitting during resolution can leave the
saved message without its preview. Older messages do not automatically refetch
their sites; existing YouTube URLs can still offer the player.
