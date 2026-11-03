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

Local commit `9751f31d5` succeeded with hooks enabled: all 102 affected Turbo tasks and all 913 changed tests across 119 files passed. A first retry was needed only to wrap long commit-message lines for commitlint. Unrelated in-progress product changes were left uncommitted.

The continuation adds a shared extension request/response contract and an explicit retry UI. All seven `pnpm test:extension` tests passed, exercising allowed playback as well as malformed requests, forged extension identities, top-level frames, mismatched player/content IDs, alternate registry origins, credential-bearing URLs, remote playback URLs, malformed tickets and incomplete responses. These are protocol tests, not simulated browser UI tests.

The updated native-host probe ran against the real Leo desktop. Pausing in the native UI produced inactive status and a denied playback request with no ticket. Resuming in the UI restored a valid session; the probe validated that response with the extension's actual parser and fetched a 64-byte range. JavaScript syntax and Python compile checks also passed. The retry control itself still needs Chrome verification.

The branding pass reused the existing xNet logotype and native mark exports. The frontend and native desktop builds passed. Both generated launchers have an icon resource that matches the source ICNS, and Finder's application information visibly renders the rounded xNet mark. Both native peers reopened with their existing profiles and the logotype visible in the sidebar. Evidence: `.local/evidence/native-brand-icon.png`.

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

1. **Actual Chrome extension playback remains unverified.** The existing automated Chrome command line includes `--disable-extensions`. Loading the local unpacked extension displayed a success toast but no installed item. A separate browser was opened for the follow-up, but automation could not complete the unpacked extension folder selection. The temporary browser processes were stopped; existing browser sessions were preserved. The native messaging registration helper has not registered a real Chrome extension ID on this machine. The retry UI is implemented but has not been verified in Chrome.
2. **Cold-start reliability:** the first integration run timed out contacting a peer; later runs passed. No root cause for that initial timeout was established. Same-network restart is now explicitly tested, but cold/WAN reliability remains an open test area.
3. **Physical devices and WAN:** direct peers were demonstrated as independent processes on one Mac. Different devices, NAT traversal, relays, network changes, packet loss, throughput, battery use and release bundle measurements remain untested.
4. **Product scope:** no social OAuth, mobile app, signed distributable, arbitrary public enrollment, DMs/contact discovery, recommendation engine, notification service or account recovery. Private rooms provide the prototype's private messaging path. Group crypto is not MLS or a forward-secret ratchet.
5. **Durability:** owner-hosted rooms need their owner online for new messages. Address changes can require a new link. Retained media has no cache eviction UI yet. The registry is a local SQLite service, not deployed infrastructure.

Nothing was pushed, merged, published, or deployed. The existing product remains in place, and the experiment is isolated under `experiments/community-network`.

## Music and Posts pass · November 2

The native app now has separate **Music** and **Posts** destinations. Music uses the existing peer media path, with MP3/WAV signatures, scoped playback tickets, byte ranges, retention and re-seeding. Posts is a registry-backed chronological public feed with signed 280-code-point text, search, replies and public links. Private room messages remain outside the registry.

Fresh verification for this pass:

- `cargo test -p community-network -p community-node`: **9 passed** (5 core units, 3 real-peer integration tests, 1 native framing test).
- `pnpm test:extension`: **7 passed**, now including audio playback and rejection of public-post operations/media-kind confusion.
- `pnpm build`: TypeScript and Vite passed; 254.86 KB application JS, 79.48 KB gzip.
- `cargo build --workspace --features tauri/custom-protocol`: passed, including the final native UI cleanup.
- `cargo fmt --all --check`: passed.
- `scripts/check-native-host.py` against Leo and the real audio ID: passed. The probe fetched an actual audio byte range and rejected `publish_post` and `post_thread`, as well as existing private/control operations.
- `graphify update .`: completed; the large graph's optional HTML visualization was skipped by its configured size limit.

The new network test verifies MP3/WAV publication, a second peer retaining audio, a third peer downloading after the origin pauses, audio MIME/range bytes, feed filtering, signed cross-peer replies, nonexistent/private/media reply targets, length and Unicode limits, forged post bodies, local/public record persistence, and an additive migration from the previous catalog schema. A separate regression test signs the exact old record bytes and verifies they still validate with the optional reply field added.

A rerun reproduced the pre-existing peer timeout in all three network tests, and a focused music run also timed out. These tests had been choosing the host's LAN/VPN interfaces despite testing only processes on one machine. The fixture now binds each real Iroh endpoint explicitly to `127.0.0.1:0`, and the saved assigned port still exercises restart behavior. The full suite then passed. This stabilizes the same-machine test boundary; it does not claim to fix production WAN discovery or the previously noted cold-start issue.

Native UI evidence:

1. Published the generated, original twelve-second **Garden loop** WAV from Maya using the audio-only native picker.
2. Opened Music in Leo, played the track, observed elapsed playback and the decoded twelve-second duration, then kept a full copy. The UI reported **two hosts**.
3. Pasted 281 characters into the Posts composer and observed the disabled Post button. Replaced it with a short update and published it as Maya.
4. Read that post in Leo, opened its thread, published a reply, and observed the signed Leo reply in Maya's thread.
5. Copied the public post link, opened it in the registry browser page, and pasted it into the desktop's **Open a link** flow. It resolved to the same conversation.
6. Quit and reopened both native profiles. The retained music, original post and reply remained available. Existing film and room listings also remained present.
7. Checked that switching from a music share action to Posts clears the previous tab's status and share box. Thread navigation moves keyboard focus to its heading; the composer has an explicit public label, counter, and invalid state above the length limit.

Screenshots: `.local/evidence/music-peer-playback.png` and `.local/evidence/public-post-thread.png`. These contain fictional demo profiles and public local-only test content.

The web player now includes an audio element and validates audio responses, but actual Chrome-extension audio interaction remains unverified for the same browser setup reasons listed above. Public posts do not yet have follows, likes, editing, deletion, moderation or peer-only replication. The public registry remains local and undeployed. This pass is recorded here as prototype notes, not a public release announcement.

## Moderation integration — November 3, 2026

Local Rust/Tauri prototype only. No push, PR, merge or deployment.

### Automated evidence

- `cargo +stable test -p community-network -p community-node -- --nocapture`: 12 tests passed (five model/store, three existing real-network flows, three new moderation flows, one native framing test); doc-test runner passed with no examples. Both `RUSTC` and `RUSTDOC` were set to the stable x86_64 toolchain because the shell otherwise resolves an older rustdoc.
- `pnpm build`: TypeScript and Vite production build passed. `cargo +stable build --workspace --features tauri/custom-protocol`: native workspace build passed.
- `pnpm test:extension`: seven browser/native contract tests passed. `scripts/check-native-host.py` passed against Leo for active range playback and paused denial, including rejection of all new moderation/safety commands from the browser extension. This does not claim an actual Chrome playback pass.
- Research website rebuild and its 14 policy/disclosure simulation checks passed. Simulations are distinct from the Rust/network security checks.
- `git diff --check` and Prettier checks passed for changed application files. `graphify update .` completed; graph export uses an aggregate view because the repository exceeds its detailed HTML limit.

New real-peer assertions cover: playback caching without hosting consent; explicit retain and stop-sharing/provider withdrawal; forged reviewer identity, unauthorized review, signed-request replay and wrong registry audience; catalog/direct-ID removal; cached media, old bridge tickets and direct chunk denial; author notices without reporter evidence; appeals while paused and reversal history; persisted personal hides and encrypted cases; unexpected authority-key replacement and stale policy when the registry disappears; independent case restrictions; private evidence selection/confirmation and tamper rejection; room newcomer approval, slow mode, removal and invitation invalidation; blocked-contact safety exceptions; cross-room case rejection; self-promotion denial; removed-member appeals and restoration; cached safety history while paused; leaving while retaining case access.

### Native UI evidence

Drove the compiled macOS Tauri applications via computer use, using the existing fictional **Maya** and **Leo** profiles. Maya’s public device key was explicitly configured as the local registry reviewer.

1. Leo hid the generated video, saw it disappear, opened Safety, undid the filter and saw it return.
2. Leo submitted a clearly labeled test report and received a receipt. Maya opened the queue, applied a temporary content-only restriction with a reason, and Leo’s refreshed discovery removed the video.
3. Leo paused hosting, opened the case and submitted an appeal. Maya saw the appeal and restored access. The public record and complete decision/appeal history survived restarting both apps and the registry.
4. In **Garden friends**, Leo selected one private message, previewed the recipient and exact disclosure, explicitly confirmed, and received a receipt. Maya’s review showed exactly one excerpt. The harmless test case was closed with “No violation found.”
5. Maya saved visible room rules and newcomer approval, removed Leo with a reason, and saw an appealable membership case. Leo lost access to messages but could still open the room’s rules and notices. Maya restored membership and Leo’s conversation resumed. The invitation was rotated by removal.
6. Retested the final two-step disclosure UI after rebuilding: the preview has its own screen, focus moves to its heading, Tab reaches the consent checkbox, Space toggles it, returning to selection resets consent, and Send remains disabled until fresh consent. Escape closes the modal.
7. While Leo was paused, cached messages remained available explicitly for safety review with the live composer disabled. The normal browser-native player still denied playback while paused.

The UI pass found and corrected the long disclosure form, vague removed-member error, stale restricted-message display and missing paused safety-history affordance. Native accessibility trees and limited keyboard flows were inspected. VoiceOver, comprehensive focus restoration, 200% zoom and formal WCAG conformance are not claimed.

### Repository hook evidence

The first pre-commit run hit the existing web demo-seeding test's ten-second timeout (912 passed, one timeout). Its isolated rerun passed all seven tests, and the full rerun passed all 913 tests across 119 files. All 102 affected typecheck/build tasks succeeded. The first commit-message attempt then failed the 100-character body-line rule; the message was wrapped before retrying. No hook bypass was used.

### Remaining boundaries

The registry policy signer is pinned on first use; this still needs authenticated production bootstrap/key rotation. Fresh policy is an availability dependency for public media. A registry delists public rooms; their independent hosts retain room-admission authority. Registry-wide restrictions do not reach private chat policy. Existing copied bytes cannot be recalled and modified clients can ignore policy.

Reports are encrypted separately, with an owner-only key beside the database. This is not whole-device encryption. Evidence expires after 30 days and is scrubbed on access, not by a guaranteed background deletion job; backups and recipient copies remain outside that promise. Private chats still use the original host-readable group protocol. Report queues are bounded and have no archive UI; independent review assignment, operational escalation, Sybil-resistant abuse controls, policy dry-runs, labeler federation and youth-specific designs remain future work. The research checklist preserves these as open items.
