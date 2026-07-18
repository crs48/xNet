const charterUrl = "https://github.com/crs48/xNet/blob/main/docs/CHARTER.md";
const updated = "June 2026";
const commitments = [
  {
    name: "Own",
    promise: "You hold the master copy.",
    detail: "Your data lives on your device first. xNet keeps no behavioral surplus and has no third-party customer to sell it to. There is no ad model; you are not the product.",
    backing: "enforced",
    backingLabel: "Enforced — no third-party ad/analytics SDKs can be added"
  },
  {
    name: "Exit",
    promise: "Leaving is your right, and it loses nothing.",
    detail: "You can take everything and go. Identity is a portable did:key that works on any hub; the wire format is an open, signed, hash-chained change log, not a vendor blob; the client works fully offline.",
    backing: "architectural",
    backingLabel: "Architectural — portable protocol + portable identity"
  },
  {
    name: "Calm",
    promise: "We compete for your wellbeing, not your time.",
    detail: (
      /* humane-ok: Charter copy names the banned pattern to promise against it — site scanned since 0257 */
      "No infinite scroll. No engagement ranking. No streaks engineered around loss aversion. Feeds are chronological; notifications are rule-based. An opt-in reminder even helps you step away."
    ),
    backing: "enforced",
    backingLabel: "Enforced — a CI gate bans dark-pattern primitives"
  },
  {
    name: "Consent",
    promise: "Nothing leaves without permission.",
    detail: `Telemetry is off by default. What is sent is PII-scrubbed and bucketed into ranges, so values can't be tied back to one person. A "what we know about you" panel shows every artifact xNet has derived — usually nothing — and lets you purge it.`,
    backing: "enforced",
    backingLabel: "Enforced — consent-gated, tested off-by-default"
  },
  {
    name: "Agency",
    promise: "AI makes you more capable, not less.",
    detail: "The assistant scaffolds by default — it proposes and cites, you write and own — rather than silently doing your thinking. Anything the model authored is marked as AI-generated.",
    backing: "architectural",
    backingLabel: "Architectural — scaffold-by-default, provenance-tagged"
  },
  {
    name: "Commons",
    promise: "You own your audience and your space.",
    detail: "Your social graph belongs to you, not to a platform that rents it back. Hubs are user-ownable and federated; a subscriber is a signed edge in your own graph, exportable with everything else.",
    backing: "building",
    backingLabel: "Building — BYO hub today; owned-audience publishing in design"
  }
];

export { charterUrl as a, commitments as c, updated as u };
