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
form draft is stored in Chromium local storage and included in the logical settings
snapshot at completed checkpoints. Once the native capture intent is written,
it joins the covered workspace files. Completed
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

Open **Collections** to find an imported playlist or saved group by name. Both
the collection list and its entries have pages of forty items. Entries follow
the export's ordering key when present. Repeated saves remain separate entries;
opening either occurrence shows the same resource's source details and notes.
An entry without an indexed resource remains visible with an explanation.

Collection cards show the item count reported by the source when available;
the opened collection counts the actual local membership records. These can
differ after an incomplete import. **Graph & saved views** still opens the
existing data workspace for inspecting the broader graph. Dedicated creator
views and bounded resource neighborhoods remain unfinished.

Choose **Start enrichment** to request source websites from this Mac. It is
paused by default. Coverage & gaps separates metadata, thumbnail, caption, and
index work, and shows missing fields and retry reasons. Saved thumbnails use local
blob storage, so expired source URLs do not remove the fetched image.

YouTube titles, full descriptions, authors, thumbnail URLs, and caption lists now
come directly from the public video page. No helper installation is needed for
these cards. A public preview can supply a title and image when the full page
fails; the description and caption coverage then remain partial.

The progress strip shows completed metadata, pending videos, saved images, and
current requests. Local indexing does not hold up network work. Several requests
can run at once, with separate pacing for metadata, images, and captions. A
private or removed video leaves a gap on that video. A provider rate limit pauses
that provider and survives retry or restart. Pausing cancels active requests;
starting again resumes the saved queue without resetting completed work.

Caption discovery does not guarantee readable caption text. YouTube may return
an empty caption response even when it lists a track. This is shown as a blocked
caption job, while titles and images continue. A missing track is reported
separately. Neither case is counted as a retrieved transcript.

Instagram public embeds supply written captions, author names, and post images.
The saved post URL is used even when the export identifies the record with a
numeric Facebook ID. Photos and carousels can have a thumbnail without containing
a video. Display titles come from the written caption, so their coverage remains
partial. A public page preview is also marked partial when the full caption is
unavailable. Private, removed, or login-limited posts remain explicit gaps.

Instagram's written caption is separate from speech in the video. The public
embed does not supply transcript tracks; local transcription is still pending.
YouTube work already completed is preserved when this Instagram provider is added.

For X/Twitter on macOS, **Coverage & gaps → Install video helper** downloads the tested
`yt-dlp 2026.07.04` executable from its official release (about 38 MB). The app
checks its pinned size, checksum, and version before installation. You can cancel
the download or repair a damaged helper. Installation does not start enrichment
or read browser cookies. The managed helper is preferred over compatible existing
local installations. It can be downloaded again after restoring a workspace.
The installer’s integrity and failure tests pass. In the live Electron check on
this Mac, the GitHub asset connection timed out; cancellation, cleanup, retry,
and restart worked. Successful download and installation through this control
still need a live check. Existing compatible local helpers can already supply
source metadata and captions.

Available source captions are supported; automatic local transcription and
generated video posters are not connected. Ordinary web descriptions may be preview text rather than the
full article, and login-limited sources remain explicit gaps.

## Recovery and readiness

Settings → Data provides verified native recovery copies and password-encrypted
`.xnetbackup` export/restore. Keep the whole encrypted folder and its password.
Native copies remain on this disk. Selecting a folder does not prove it has
reached another device. See [Desktop storage and recovery](./desktop-storage.md)
for exactly which files are covered. New copies include known desktop settings,
the AI provider key, and an unfinished capture draft. Restore applies these before
the app opens; device sessions and unlisted browser state are excluded.

The current implementation has been exercised in isolated Electron profiles:
checkpoint restore, encrypted export/restore, interrupted-import resume after
removing its original source, saved thumbnails and late-caption search after an
offline restart, capture followed by ordinary title/body edits and restart, and
settings/draft recovery after deleting an entire test profile.
The installed signed-Mac upgrade, complete settings/key recovery, off-device
retention, full real-corpus import/enrichment, guide publication, and founder trial
remain open in the exploration. The preview is not a durability guarantee for
irreplaceable data.

The [partially implemented exploration](../explorations/0466_[-]_PERSONAL_LIBRARY_FOR_LEARNING_AND_SHARING.md) records the remaining work and command results.
