# Moderation with agency — local website

The canonical research lives in [exploration 0500](../../0500_[_]_MODERATION_WITH_AGENCY.md).
`index.html` is a generated, self-contained website. It includes all prose, the existing xNet
wordmark, four accessible diagram renderings, a policy simulation, and a private-report simulation.
No production moderation behavior changes in this exploration.

## Build and preview

From the repository root, with the existing dependencies installed:

```sh
node docs/explorations/web/0500/build.mjs
node docs/explorations/web/0500/check-model.mjs
python3 -m http.server 4351 --bind 127.0.0.1 --directory docs/explorations/web/0500
```

Open <http://127.0.0.1:4351/>. Stop the preview server with Ctrl+C after review.
The built `index.html` can also be opened as a local file, sent as a file, or hosted as static HTML.
The page's **Save website** and **Download Markdown** buttons export portable local copies.
There are no external fonts, scripts, styles, analytics, fetches, or form submissions.
A content security policy disables network connections and form submission.

## Editing and checks

- Edit research in the canonical Markdown, not the generated HTML.
- `template.html` owns layout; `app.js` owns local interaction; `model.mjs` owns the illustrative rules.
- `build.mjs` uses repository-installed Markdown-it and Prettier; it renders and formats `index.html`.
- Diagram equivalents are authored in the builder. It rejects a mismatch in diagram counts.
- Relative repository references become annotated text in the portable website; original paths remain
  in the downloadable Markdown. They are not broken web links.
- **Consumer of `check-model.mjs`:** the exploration author before rebuilding or committing this page.
  Pass condition: all 14 policy and disclosure cases pass; any assertion or input-validation failure
  exits nonzero. These checks cover the simulation, not Rust authorization or network security.
- Run the local browser flows after changes: optional filtering, operator restriction, private
  membership, youth policy, evidence selection, recipient change clearing consent, and both downloads.
- Check at desktop and 390px widths. Tables scroll within their own region; the page must not overflow.

## Verification record — November 2, 2026

The recorded outcomes below concern this website only. Product implementation and acceptance
checklists remain unchecked in the canonical exploration.

- Built 12 research chapters and four diagram equivalents successfully.
- All 14 model checks passed, including negative cases for missing consent, invalid inputs,
  unauthorized private-room access, and personal overrides of operator restrictions.
- Exercised the real browser: operator refusal, teen restriction, private membership, personal hide,
  report selection, recipient change clearing consent, simulated submission, reset, and keyboard Tab.
- At 390px, document width remained 390px and all seven comparison tables scrolled internally.
  Inspected both the desktop landing and mobile policy-lab views.
- Checked that all internal anchors resolve and browser logs contained no warnings or errors.
- Downloaded both artifacts through the UI. The Markdown exactly matched the canonical source;
  the HTML had valid inline JavaScript, unique IDs, and no external runtime resources.
- Verified all nine repository links resolve in the source tree.
- Local-file browser navigation was blocked by the preview browser's URL policy. No workaround was
  attempted. Offline readiness is established by self-contained artifact inspection, not a claim
  of a completed offline-browser test. External citation links naturally require internet access.
- Screen-reader operation, printing to PDF, live peer enforcement, and production moderation were
  not tested by this exploration.
