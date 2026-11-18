# Exploration 0496 web reader

Open `index.html` in a browser. It includes its styles, scripts, diagrams, and downloadable Markdown source. No server or external assets are needed for the reader; external source links need an internet connection.

The canonical document is [Portable social foundations](../../0496_[_]_PORTABLE_SOCIAL_FOUNDATIONS.md). Edit that document and `template.html`, then rebuild from the repository root:

```sh
node docs/explorations/web/0496/build.mjs
```

The generator uses the repository's installed Markdown-it dependency. Its three HTML diagrams correspond to the document's Mermaid diagrams. If a diagram changes, update both forms.

For a temporary HTTP preview:

```sh
python3 -m http.server 4348 --bind 127.0.0.1 --directory docs/explorations/web/0496
```

## Verification on November 2, 2026

- Drove the actual page in the in-app browser at desktop size and a 390px mobile viewport. Checked light/dark appearance, chapter links, mobile contents, and all four workload choices across the three deployment stages. No horizontal page overflow at 390px.
- Checked calculator defaults: 600,000 delivered minutes, 9 TB at 2 Mbps, and $650 storage plus delivery. The smaller scenario returns 30,000 minutes, 450 GB, and $80. Zero viewers with 1,001 stored minutes returns $10 in rounded storage capacity. Negative input displays an explicit validation message.
- Downloaded Markdown matched the canonical source byte for byte. The saved HTML includes its source and assets without duplicating the generated calculator. Opening a `file://` URL in the in-app browser was blocked by its URL policy, so that browser's offline-file execution was not verified.
- All 18 local Markdown links resolve. All three Mermaid diagrams parse with the installed Mermaid version and a DOM implementation. The generated JavaScript parses, and the browser reported no warnings or errors during the checked interactions.
- Prettier checks passed for the Markdown, generator, and template. Refreshed the repository's AST knowledge graph.

These checks cover the research reader. No application benchmark, protocol interoperability test, security audit, or service deployment was performed. The prototype and validation checklists in the exploration describe future work.
