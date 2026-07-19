# Rule change decision log

> The public record of every [Rule Change Proposal](../RULE_CHANGES.md) and what
> we decided — **declines and deferrals as much as acceptances**. A log of only
> the accepted proposals is marketing, not a record.

**Append-only.** Entries are never edited or deleted once written. A decision
that is later reversed gets a *new* entry that supersedes the old one, and the
old one stays where it is. That is the whole point: the record has to survive
the person who made the call, including when the call was wrong.

**How to read an entry.** Every entry names the rule, who was affected, the
outcome (Accepted / Declined / Deferred / Redirected), and the reasoning. The
reasoning is the part that matters — an outcome without one is not a response.

**Not the ADR log.** "Why is it built this way?" is answered by the
[Architecture Decisions](../../site/src/content/docs/docs/architecture/decisions.mdx)
record. This log answers a different question: *who asked to change a rule that
binds them, and what did we say back?* Both are append-only and supersede
rather than rewrite — same discipline, different subject.

---

## Seed entries (retroactive)

The four entries below **were not filed as RCPs**. They are real rule decisions
already made and documented in the repository's exploration record, back-filled
here so the log starts with substance rather than an empty table promising
future honesty. They are marked `retroactive` and carry no proposer.

Everything from `RCP-0005` onward is a proposal filed through the process.

---

### RCP-0001 — Add "no context capture" to the Charter's refused rents

- **Date:** 2026-07-18
- **Rule:** The Charter's refused rents ([`CHARTER.md` §6](../CHARTER.md))
- **Proposer:** *retroactive — internal (exploration 0358)*
- **Affected:** Anyone relying on portability. Data you can move while your
  standing stays behind is a moat in everything but name.
- **Outcome:** **Accepted**

Portability that covers the bytes but not the *context* — an audience, share
grants, plugin licences — is exit in form and capture in substance. A
repository is portable; a contribution graph is not. The refusal was added to
§6 and, importantly, added **honestly**: the matching claim
(`economics-no-context-capture` in the claims ledger) is marked `building`, not
`enforced`, because share grants are still hub-managed and the DID-based
subscriber list is unbuilt. The gap is inventoried in
[`ECONOMICS.md` §3](../ECONOMICS.md).

Recorded here because it is the shape of decision this log exists for: a rule
that binds outsiders, changed by a maintainer commit, where the reasoning would
otherwise live only in an exploration document.

---

### RCP-0002 — Add "no marketplace self-preferencing" to the refused rents

- **Date:** 2026-07-18
- **Rule:** The Charter's refused rents ([`CHARTER.md` §6](../CHARTER.md)); marketplace terms
- **Proposer:** *retroactive — internal (exploration 0358)*
- **Affected:** Plugin authors competing with xNet's own listings
- **Outcome:** **Accepted**

An operator that ranks its own listings above everyone else's has converted a
marketplace into a chokepoint. §6 now commits that xNet's listings receive no
ranking preference, and that delisting is limited to grounds enumerated in the
public marketplace terms — the second half matters more than the first, because
unbounded takedown discretion is the same power wearing a different hat.

The backing is **architectural**, not enforced: the sovereign 0% BYO-billing
path and the MIT catalog mean a self-hoster can run their own marketplace. That
is a weaker guarantee than a CI gate, and it is stated as such.

---

### RCP-0003 — Relicense the core under GPL or AGPL

- **Date:** 2026-07-18
- **Rule:** Project licensing (MIT core + FSL cloud), which sets the terms
  every downstream fork and plugin author inherits
- **Proposer:** *retroactive — internal (exploration 0345)*
- **Affected:** Every downstream consumer of `@xnetjs/*`, every plugin author,
  every fork
- **Outcome:** **Declined**

Copyleft on an npm SDK is adoption-fatal rather than protective: it taxes the
people building on the commons while doing little to the well-resourced actors
it is aimed at. The existing MIT-core + FSL-cloud split already does the work
copyleft is being asked to do here, and relicensing today would read as a
HashiCorp-shaped signal — exactly the wrong one for a project asking people to
trust its exit guarantees.

The honest caveat, recorded because a decline should carry its own weak points:
MIT means a well-funded competitor can take the core and give nothing back.
That is a real cost, accepted deliberately. The structural answer is 0241's
foundation and trademark commitments, not licence maximalism. A bounded
copyleft niche remains available if circumstances change — AGPL on the **hub
server binary only**, never on a `@xnetjs/*` library — and the tripwires for
revisiting are listed in 0345.

Note that copyleft is not treated as alien: `AGPL-3.0-only` is an approved
third-party plugin licence in
[`license-policy.ts`](../../packages/plugins/src/ecosystem/license-policy.ts).
This decision is about what *we* ship, not what we permit.

---

### RCP-0004 — Charge for admission to the xNet Index

- **Date:** 2026-07-18
- **Rule:** The Moat Register ([`ECONOMICS.md` §2](../ECONOMICS.md)) and the
  Charter's four tests
- **Proposer:** *retroactive — internal (exploration 0365, withdrawn by 0366)*
- **Affected:** Everyone who would need to be listed to be discoverable
- **Outcome:** **Declined** — and the earlier proposal to sell L2 index access
  was **withdrawn**

Exploration 0365 proposed selling access to a second-tier index. 0366 withdrew
it and refused paid admission outright, on the four tests: charging for entry
to a commons is payment for **access**, not for labour performed on the
lister's behalf — it fails the improvement test — and it fails the sleep test
outright, because a free competing index erases a paid one instantly.

The finding underneath is the one worth keeping: **fees do not stop spam;
identity binding does.** Admission is by identity, by every path, and free.
Discovery is funded from hosting margin instead.

This entry is here specifically because it is a **reversal**. 0365's lane was
proposed, written down, and then refused by a later document. Under the
append-only rule both stay visible, which is the behaviour this log is trying
to make normal.

---

## Filed proposals

*None yet.* The process shipped with
[exploration 0361](../explorations/0361_[x]_VOICE_AS_THE_COMPLEMENT_TO_EXIT_OSTROM_COLLECTIVE_CHOICE_AND_XNET_GOVERNANCE.md).

At xNet's current size the honest expectation is a handful of RCPs a year, and
possibly none for a while. **Low volume is not failure.** The value is that the
path exists and is visible when it matters — an empty section here means nobody
needed it yet, not that nobody was heard.

<!--
Template for a new entry — copy below the last one, never above.

### RCP-NNNN — <short title>

- **Date:** YYYY-MM-DD
- **Rule:** <which in-scope rule, linked>
- **Proposer:** <@handle or DID>
- **Issue:** #NNN
- **Affected:** <who this binds, beyond the proposer>
- **Outcome:** **Accepted | Declined | Deferred | Redirected**

<The reasoning. If declined, say what would change the answer. If deferred,
name the condition that reopens it. If accepted, link the commit.>
-->
