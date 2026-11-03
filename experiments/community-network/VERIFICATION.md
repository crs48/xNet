# Local demo verification · November 2, 2026

This records a prototype on one Mac with separate processes and identities. It is not a cross-device, public-internet or production security qualification.

## Fresh command results

| Check                                                              | Result                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test -p community-network -p community-node -- --nocapture` | 7 passed: 4 network unit tests, 2 network integration tests, 1 native framing test                                                           |
| `pnpm build`                                                       | TypeScript and Vite passed; about 247 KB application JS before gzip                                                                          |
| `cargo build --workspace --features tauri/custom-protocol`         | All four workspace crates built, including the native desktop                                                                                |
| `cargo fmt --all --check`                                          | Passed with the installed ARM Rust formatter                                                                                                 |
| `node --check` on extension scripts                                | Passed                                                                                                                                       |
| Python compile check for the three helper scripts                  | Passed                                                                                                                                       |
| `scripts/check-native-host.py` against the running Leo peer        | Passed: scoped public playback, actual 64-byte HTTP range, denied private/control operations, invalid origin, oversized and truncated frames |

Build and test commands used Rust 1.97.1 with an explicit `RUSTC` path because the login shell otherwise selected rustc 1.72.1. Clippy was not run: it is absent from the x86_64 stable toolchain. We did not run the unrelated legacy workspace's entire test suite.

The initial local commit attempt ran the repository's hooks without bypassing them. Lint/format and all 102 affected Turbo tasks passed, but changed tests reported three failures in existing Electron fixtures. The follow-up fixes the recovery fixture to provide registered workspace windows and checks extension source sizes against the limit advertised in the agent contract, including the exact boundary and first rejected character. All 21 focused Electron tests now pass, and the experiment's seven Rust tests and frontend build pass again. The production Electron implementations were not changed by these fixture repairs.

## Native and browser interaction

- Created **Maya** and **Leo** through the native onboarding UI, including contribution consent.
- Published a generated six-second H.264 MP4 from Maya using the native file picker.
- Discovered and played it in Leo's native video player, observing real decoded frames and playback reaching the end.
- Observed a verified local copy and two announced providers. No video was uploaded to the registry.
- Created **Open studio**, joined from discovery in Leo, and observed messages arrive in both clients.
- Created **Garden friends**, copied its invitation through the UI, pasted it in Leo, and observed two-way private replies. It remained absent from public discovery.
- Restarted both clients and observed their identities, library, settings and room lists persist.
- After upgrading the prototype to stable ports, refreshed Leo's old invitation once, then quit and reopened Maya again. Leo sent “Still connected after restarting Maya.” without another invitation; it appeared in Maya's native chat.
- Paused Maya in the native contribution screen and started a fresh headless **Kai** peer. Kai downloaded all 555,398 video bytes from Leo. Leo's native counters then showed 542 KB received and 542 KB sent. The temporary Kai process was stopped after verification; both desktop clients were restored to contributing.
- Exercised pause/resume. The initial UI pass exposed a form-submit bug: Pause also saved the previous settings. The corrected button has `type="button"`; a later native pass showed “Hosting paused”, disabled playback, then resumed successfully.
- Used the public registry's search to find the film, opened its shareable content page, and verified that the browser showed metadata without downloading media.

Screenshots live in the ignored `.local/evidence/` folder: `public-link.png`, `private-chat.png`, `retained-and-seeded.png` and `video-playback.png`. `live-reseeding.txt` records the transferred payload. No identity keys, bridge credentials or private invitation links are included in screenshots intended for sharing.

## Backend behavior independently verified

The three-peer test verifies complete content transfer and re-seeding from the second peer after the original pauses. It also tests private admission, forged senders, corrupted cached chunks, tampered catalog signatures, bridge credentials, browser Origin rejection, bad byte ranges and paused network operations.

The restart test closes the private room owner, releases its profile lock, starts the owner again with the same identity and socket ports, and sends another message from the already-joined guest without a new invitation.

## Open checks and limits

1. **Actual Chrome extension playback remains unverified.** The current Chrome command line includes `--disable-extensions`. Loading the local unpacked extension displayed a success toast but no installed item. We inspected `chrome://version` to identify the restriction. We did not replace or restart that browser session. The native messaging registration helper has not registered a real Chrome extension ID on this machine.
2. **Cold-start reliability:** the first integration run timed out contacting a peer; later runs passed. No root cause for that initial timeout was established. Same-network restart is now explicitly tested, but cold/WAN reliability remains an open test area.
3. **Physical devices and WAN:** direct peers were demonstrated as independent processes on one Mac. Different devices, NAT traversal, relays, network changes, packet loss, throughput, battery use and release bundle measurements remain untested.
4. **Product scope:** no social OAuth, mobile app, signed distributable, arbitrary public enrollment, DMs/contact discovery, recommendation engine, notification service or account recovery. Private rooms provide the prototype's private messaging path. Group crypto is not MLS or a forward-secret ratchet.
5. **Durability:** owner-hosted rooms need their owner online for new messages. Address changes can require a new link. Retained media has no cache eviction UI yet. The registry is a local SQLite service, not deployed infrastructure.

Nothing was pushed, merged, published, or deployed. The existing product remains in place, and the experiment is isolated under `experiments/community-network`.
