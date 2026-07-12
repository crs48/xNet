---
"@xnetjs/core": major
"@xnetjs/sync": major
"@xnetjs/data": major
"@xnetjs/sqlite": major
---

Grinding-resistant Last-Write-Wins tiebreak (protocol v4, exploration 0305)

The final LWW conflict tiebreak was the raw author DID ("higher DID wins").
Because a `did:key` is a free, attacker-chosen function of a keypair, an
attacker could grind a vanity DID that sorts highest and win **every**
concurrent-write tie against every honest peer, permanently.

Protocol v4 replaces that final rung with a per-conflict key,
`blake3(authorDID ‖ property ‖ value)` (`computeLwwTiebreakKey` in
`@xnetjs/core`), so the winner of a tie is a random-oracle function of *what is
written* — a ground identity wins no durable, universal advantage. The key is
gated on both changes being v4 (legacy changes fall back to the author DID), is
derived at resolution time (never part of the change hash or wire format), and
is threaded through `PropertyTimestamp`, the SQLite `node_properties` guard (new
nullable `tiebreak_key` column, schema v8), and every conformance kernel.

BREAKING: `CURRENT_PROTOCOL_VERSION` is now `4` and new changes are stamped v4.
The LWW golden vectors gain `0005-tie-grinding-resistant-key`; `LwwStamp` /
`PropertyTimestamp` gain an optional `tiebreakKey`. Mixed fleets converge on
exact `{lamport, wallTime}` ties only once both peers are on v4 — a transient
rollout window affecting rare exact ties.
