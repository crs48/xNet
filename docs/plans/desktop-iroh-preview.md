# Desktop Iroh preview — implementation and evidence

Scope: local chat-first prototype branch, no push/merge; a dedicated Railway
relay is explicitly authorized. This is the first two-person text transport,
not a migration of every existing conversation or media feature.

- [x] Pin a native Iroh binding and isolate it to the desktop main process.
- [x] Persist a separate transport key and pin it to the xNet DID with a signature.
- [x] Add expiring invitations, identity review, inviter approval and disconnect.
- [x] Replicate bounded signed chat changes into local NodeStore/SQLite.
- [x] Page by author/channel and Lamport+hash; acknowledge only accepted writes.
- [x] Exclude peer records from readable hub publishing and hub importing.
- [x] Deploy the invite-only relay with persistent quota and CPU/RAM ceilings.
- [x] Verify native encrypted exchange through the public Railway HTTPS endpoint.
- [x] Verify real Electron invitation, approval, both directions, removal and restart catch-up using a local relay.
- [x] Verify hosted-relay messaging from Electron, including approval, both directions and restart catch-up.
- [x] Complete Vercel DNS and TLS for `iroh.xnet.fyi`; make it the desktop default.
- [ ] Verify two physical devices on different NATs and measure direct/relay ratios.
- [ ] Verify packaged binaries on all supported desktop targets; the pinned binding lacks Intel macOS.

The last two remain release gates. Both local Electron profiles used
`https://iroh.xnet.fyi/`, registered through the normal invitation flow, reached
relay-ready status, exchanged messages, and upgraded to a direct connection on
this Mac. Sending while the second profile was closed and reopening it also
recovered the queued message. This does not measure cross-NAT connectivity.

## Evidence collected on 2026-10-22

| Check                                          | Result                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Peer protocol, native events and service tests | 7 passed; signature tampering, cross-channel writes, native callback errors, approval, restart, disconnect |
| Real SQLite peer query                         | 1 passed; equal-Lamport pagination, author/channel filtering, empty tail                                   |
| Hub import policy + existing provider tests    | 36 passed; single/batch rejection, ordinary imports, outbound filters and replay                           |
| Desktop IPC sync-manager tests                 | 7 passed; existing desktop transport behavior preserved                                                    |
| Relay gateway tests                            | 3 passed; admission, expiry/reuse negatives, durable quota, corruption, readiness, revocation              |
| Hosted native relay wire test                  | 1 passed; encrypted round trip, remote key, relay path, outsider rejection                                 |
| Final local gateway and native wire tests      | 4 passed; includes real relay watcher callback and clean process shutdown                                  |
| Targeted desktop/workbench typecheck           | 43 tasks passed                                                                                            |
| Electron production build                      | Passed for main, preload and renderer                                                                      |
| ESLint for changed TypeScript                  | Passed                                                                                                     |
| Electron profiles                              | `dev-wt-xNet` and isolated `dev-iroh-qa-hosted`; actual composer and invitation controls used              |
| Custom hostname                                | Vercel CNAME/TXT added; Railway ownership verified, certificate valid; HTTPS health returned ready         |
| Hosted Electron repeat                         | Invite/review/approve, messages both ways, direct upgrade, clean quit and restart catch-up passed          |
| Final focused checks                           | 15 desktop peer/IPC tests and 3 relay gateway tests passed                                                 |

Integration found and fixed: enrollment before opening the relay transport;
relay ping routes required by Iroh; the data-process response envelope; competing
invitations hitting an overly strict per-device throttle; the native relay
watcher emitting error-first arguments despite its declared callback type; and
the need to reject hub imports as well as suppress hub exports. Idle chat outbox checks run every
three seconds, while empty network exchanges are spaced to thirty seconds to
reduce relay overhead.

The additional full renderer typecheck remains red in four unchanged locations:
`DatabaseView.tsx` (missing `onResolveThumbUrl`), `DocumentHeader.tsx` (readonly
ref), `PluginManager.tsx` (async effect cleanup), and `ipc-sync-manager.test.ts`
(`Promise<void>` versus `Promise<undefined>`). The targeted project typecheck
does not include that renderer check; do not treat its green result as covering it.

The earlier native dialogs said the workspace had not finished saving; they
were not network-permission prompts. After unlocking, restoring the stopped
renderer server, dismissing those notices and letting both profiles save/quit
normally, a clean start reached the public relay. The earlier timeout no longer
reproduces; its precise cause was not isolated. No OS protections were changed
and neither profile needed to be force-killed. The peer-chat footer now points
to its delivery status instead of contradicting the successful delivery time.
Both test profiles saved and closed normally after the hosted check, and the
temporary invitation file was removed. The secondary QA profile remains a
locally owned admitted device; the earlier standalone wire-test keys remain
revoked. A screenshot is saved locally at
`output/iroh-relay-demo-2026-10-22/desktop-chat.png`.

The local commit attempt stopped in the existing graphify pre-commit hook:
Python multiprocessing tried to reopen `<stdin>` as a file on macOS, then the
graph rebuild failed. A separate `graphify update .` succeeded. No hook was
bypassed; the prototype remains uncommitted, with no push or merge.

Operational details and repeatable gates live in
[the relay runbook](../../deploy/iroh-relay/README.md).
