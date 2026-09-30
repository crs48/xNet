# Trying the desktop Library

This is a development preview of exploration 0466. It can import supported
archives, fetch source details and images, search saved text offline, and capture
a link with an editable personal note. The full daily-use acceptance check is
still open. Keep the original exports and a separate copy of important writing.

From the repository root, run `pnpm --filter xnet-desktop dev:electron`. The
launcher rebuilds changed workspace dependencies and uses a separate `dev-`
profile. Open **Library** from the top bar. Renderer edits use the development
reload loop; native-process changes need a restart. This is not the signed,
automatically updated installation proposed in the exploration.

## Save and find

Choose **Save a link**, enter a URL, and add a title, a thought, or an excerpt.
Saving works offline. Your writing becomes a private Page linked to the source;
metadata refreshes do not replace it. If the source is already in Library, the
form offers its existing notes and can save a separate new note.

Open a result's details and choose **Open editable note** to keep writing. Return
to Library to refresh the note-body index. Search can find source descriptions,
URLs, personal notes, and retrieved caption segments. Imported items do not each
create a blank Page.

The desktop registers **Command/Ctrl + Shift + L** for capture. It reads a copied
URL only when invoked. The Library reports if another app prevents registration.
Registration has been exercised; the switch from another app and return of focus
still needs the native shortcut acceptance check.

A failed save keeps its original request and text for retry. You can explicitly edit it as a separate capture if you need a different note; the earlier attempt may already be saved. The unsubmitted
form draft is stored in Chromium local storage, outside native backups. Once the
native capture intent is written, it joins the covered workspace files. Completed
intents currently retain the original capture text even after later Page edits.

## Import and enrich

Choose **Import archive** and review the detected categories before starting.
The adapters cover the supplied Twitter/X, Instagram, YouTube, GitHub-star, and
garden export shapes. A garden file uses the existing version-1 `garden.json`
format. A retained copy of the complete source export is kept before node writes,
including categories you did not select. Keep this in mind when choosing files.

Paused or interrupted import jobs can resume from retained source files. A batch
only advances the saved cursor after acknowledgement. Repeating a batch after a
crash uses deterministic IDs. Full-corpus and cross-version overlapping-import
reconciliation remain acceptance work; they are not implied by a small test.

Choose **Start enrichment** to request source websites from this Mac. It is
paused by default. Coverage & gaps separates metadata, thumbnail, caption, and
index work, and shows missing fields and retry reasons. Saved thumbnails use local
blob storage, so expired source URLs do not remove the fetched image.

Video extraction currently requires the tested local `yt-dlp` version
`2026.07.04`. The app checks common local helper locations and reports a missing
or incompatible version. It does not yet install that helper. Available source
captions are supported; automatic local transcription and generated video posters
are not connected. Ordinary web descriptions may be preview text rather than the
full article, and login-limited sources remain explicit gaps.

## Recovery and readiness

Settings → Data provides verified native recovery copies and password-encrypted
`.xnetbackup` export/restore. Keep the whole encrypted folder and its password.
Native copies remain on this disk. Selecting a folder does not prove it has
reached another device. See [Desktop storage and recovery](./desktop-storage.md)
for exactly which files are covered.

The current implementation has been exercised in isolated Electron profiles:
checkpoint restore, encrypted export/restore, interrupted-import resume after
removing its original source, saved thumbnails and late-caption search after an
offline restart, and capture followed by ordinary title/body edits and restart.
The installed signed-Mac upgrade, complete settings/key recovery, off-device
retention, full real-corpus import/enrichment, guide publication, and founder trial
remain open in the exploration. The preview is not a durability guarantee for
irreplaceable data.

The [partially implemented exploration](../explorations/0466_[-]_PERSONAL_LIBRARY_FOR_LEARNING_AND_SHARING.md) records the remaining work and command results.
