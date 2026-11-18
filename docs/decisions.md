# Current architecture decisions

The retired SDK's decisions are preserved in [the archive](../LEGACY.md).
This migration retains the prototype's wire formats and authorization rules.

## Primary product: desktop community network — November 18, 2026

Use the existing Rust/Tauri prototype as the primary product in this repository.
Keep the website and essays; retire the Electron/SDK implementation from the
active tree. Preserve immutable history and stable existing Tauri profile,
URI, and updater identifiers. No automatic Electron data conversion.

**Tripwire:** reconsider if an actual consumer workflow needs the retired
composable data model and cannot be delivered cleanly on the current storage API.

## Release separation — November 18, 2026

A main merge runs checks and publishes the consumer site. It never publishes a
desktop installer or advances an update feed automatically. Native CI artifacts
are development builds. The signed beta trust root and URL remain unchanged.

**Tripwire:** automate promotion only after native runtime checks on each target,
release signing, and a successful profile-preserving updater rehearsal are repeatable.
