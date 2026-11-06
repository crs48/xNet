# From attention to shared agency — website edition

Canonical research: [exploration 0502](../../0502_[_]_FROM_ATTENTION_TO_SHARED_AGENCY.md).

A synthesis of Chris and Nikki's November 6, 2026 Granola conversation, connected to earlier
xNet explorations. The portable website contains 15 chapters, primary-source citations,
three semantic diagram renderings, two AI-generated illustrations, and a five-stage
illustrative walkthrough. The walkthrough is fictional and collects no responses.

## Build and preview

From the repository root with existing dependencies installed:

```sh
node docs/explorations/web/0502/build.mjs
python3 -m http.server 4353 --bind 127.0.0.1 --directory docs/explorations/web/0502
```

Open <http://127.0.0.1:4353/>; stop the server after review. The generated `index.html` is
self-contained and can be opened or shared as a local file. Its images are embedded, making
it approximately 8.6 MB. External citations require internet access, but the page itself uses
no network requests, external assets, analytics, or form submissions.

Edit the canonical Markdown for research changes. `template.html` owns presentation and the
fictional walkthrough. The builder embeds the exact source for the Markdown download;
repository-only references become annotated text in the portable page. Mermaid source remains
available beside accessible HTML diagram equivalents.

The original transcript is not embedded. The synthesis omits personal check-in details and
separates participant ideas from proposed product choices. Nothing is published or sent to
Nikki by building this page. The Granola source link retains its existing access controls.
Image prompts and provenance are in [assets/README.md](assets/README.md).

## Scope

This is a research artifact, not a live deliberation system. No application feature, political
consultation, participant vote, clinical claim, or measured product outcome is represented by
the walkthrough. Proposed implementation and validation checklists remain unchecked.

## Verification — November 6, 2026

- Built all 15 chapters, three diagrams and two embedded images.
- Inspected the real browser at its desktop size and at 390px width; no page overflow was measured.
- Clicked all five walkthrough stages and checked their changed content. Checked reset and
  keyboard activation of Next step.
- Chapter navigation reached the gift-shelf section. Both illustrations loaded. The skip link
  moved keyboard focus to the research article.
- Downloaded both formats through their visible controls. The Markdown download exactly matched
  the canonical source; generated and downloaded HTML contained the same exact source, unique
  IDs, valid internal anchors, valid inline JavaScript and no external runtime assets.
- Checked formatting and builder syntax. Repository references resolved. Browser warning/error
  logs were empty during the checks. Proposed product checklists remained unchecked.
- The in-app browser disallows `file:` URLs, so reopening the exported file there was not tested.
  The downloaded file was inspected statically; browser interaction checks used the local HTTP preview.

This was not a formal accessibility audit or a screen-reader test. No application tests or new
permanent testing gate were added for this standalone research artifact.
