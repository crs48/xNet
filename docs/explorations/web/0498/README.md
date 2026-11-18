# Two apps, one community network

Local, self-contained companion to [exploration 0498](../../0498_[_]_TWO_APPS_AND_A_COMMUNITY_SEED_NETWORK.md). The Markdown is canonical. The generated reader contains the full essay, sources, accessible diagram equivalents, downloads, and an illustrative complete-copy placement model. It makes no network requests and implements no actual peer transport.

Build from the repository root:

```sh
node docs/explorations/web/0498/build.mjs
node docs/explorations/web/0498/check-model.mjs
python3 -m http.server 4349 --bind 127.0.0.1 --directory docs/explorations/web/0498
```

Open `http://127.0.0.1:4349/`. Stop the preview server when finished. `index.html` can also be shared as one file; its scripts, styles, and canonical Markdown are embedded. Repository links are annotated rather than pretending their source files are included.

The model deliberately omits real transfers, queues, leases, churn, malicious peers, and topology. It counts complete copies per independent operator, refuses new private placements on public-only nodes, observes storage budgets, and requires a reachable source. The “after replication” scenario completes placement before taking the origin offline; it does not perform another repair cycle. The policy in the essay is broader than this illustrative model.

Verification on November 2, 2026: the model passed 30 parameter combinations and additional edge checks. All three Mermaid diagrams parsed; the JSON example and eleven local reference occurrences resolved. The real browser exercised the outage selector, private friend's availability, keyboard range endpoints, reset, and both downloads. The 390 px layout had no document-level horizontal overflow. Downloaded Markdown matched the canonical file; downloaded HTML retained the model and valid scripts. Browser console inspection returned no warnings or errors. This verifies the reader and simulation, not the proposed network. Screenshots are in `output/explorations/0498/` at the repository root.
