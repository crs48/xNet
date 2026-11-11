# Collective sensemaking — website edition

Canonical research: [exploration 0501](../../0501_[_]_COLLECTIVE_SENSEMAKING_AT_COMMUNITY_SCALE.md).

This is a portable reading interface with 12 numbered chapters, a coordination and epistemics field guide, and three
semantic diagram renderings. It contains no product mockup, live poll or simulated political
participants. All product implementation and validation items remain unchecked.

## Build and preview

From the repository root with existing dependencies installed:

```sh
node docs/explorations/web/0501/build.mjs
python3 -m http.server 4352 --bind 127.0.0.1 --directory docs/explorations/web/0501
```

Open <http://127.0.0.1:4352/>; stop the server after review. The generated `index.html` can also
be opened or shared as a local HTML file. Save website and Download Markdown export portable
copies. No external runtime assets, fonts, analytics, requests or form submissions are used.
External citations need internet access. The CSP disables network connections and submissions.

Edit the research in the canonical Markdown. The builder generates the reader and embeds the
exact source for download; `template.html` owns presentation. Repository-only references become
annotated text in the portable page and remain links in the source. Diagram counts and duplicate
heading IDs fail the build explicitly.

## Verification — November 4, 2026

- Build rendered all 12 chapters and three diagrams.
- Inspected the real browser at its desktop size and 390px width.
- Fixed a download-filename overflow; the narrow page then measured 390px with no page overflow.
- Chapter navigation, the keyboard skip link and both download controls worked. The skip link
  moved focus to the main research region.
- Downloaded Markdown matched the canonical source. Generated and downloaded HTML had unique
  IDs, valid internal anchors, valid inline JavaScript and no external runtime assets.
- Browser reported no warning/error logs during these checks.
- Source repository references resolved; implementation checkboxes remained unchecked.

No Polis deployment, upstream API integration, numerical analysis, application feature, load
benchmark, formal accessibility audit or live consultation was performed. The web reader is a
research artifact; its diagrams describe proposals. No new permanent test gate was introduced.
