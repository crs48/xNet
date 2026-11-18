# From a link to a shared network

Standalone companion to [exploration 0499](../../0499_[_]_FROM_SHARED_LINK_TO_COMMUNITY_HOST.md). The Markdown remains canonical. The generated website embeds the report, three diagram equivalents, and an eight-step local concept prototype.

```sh
node docs/explorations/web/0499/build.mjs
node docs/explorations/web/0499/check-model.mjs
python3 -m http.server 4350 --bind 127.0.0.1 --directory docs/explorations/web/0499
```

Open `http://127.0.0.1:4350/`. Stop the preview when finished. `index.html` contains its own styles, scripts, examples, and Markdown; it can be shared as a single HTML file. Downloads are browser-local. There are no external assets, authentication requests, installations, uploads, payments, or peer connections.

The model compares strict mandatory seeding with optional hosting, distinguishes authentication from private device access, pauses hosting under resource constraints, preserves reading/local search after service cancellation, and separates publication from public indexing or private delivery. Examples do not claim actual security enforcement, platform support, network performance, or full coverage. Browser permissions and a real OS scheduler are not simulated.

Verified locally on November 2, 2026:

- The model check passed 48 device/policy combinations plus permission, budget, outage, subscription, and publication edge cases.
- Drove all eight steps in the browser, including interrupted sign-in with a preserved comment draft, private-device verification, hosting pauses, upload failures, public-only wider search, and cancellation that retains local search.
- Checked the final mandatory-seeding rule for remote discovery and its local-search exception; checked a 390 px phone viewport without document overflow.
- Parsed all three Mermaid diagrams, checked nine repository references and page anchors, and compiled the inline JavaScript. The browser recorded no warning or error messages.
- Downloaded both artifacts through the UI. The Markdown matches the canonical file, and the saved HTML contains the latest source without test comments or external runtime assets.

This verifies the exploration and its simulated behavior, not a deployed identity, storage, payment, or peer-network implementation. Product implementation and real-device validation remain unchecked in the canonical document.
