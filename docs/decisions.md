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

## Explicit self-signed desktop beta releases — November 18, 2026

A manual release from main may publish the consumer beta on GitHub Releases and
advance the existing HTTPS beta feed after all native builds, messaging checks,
and version-bound signature verification pass. Ordinary main pushes still only
run CI and publish the website. The release keeps the existing updater trust root.
macOS uses ad-hoc signing; Windows has no Authenticode publisher certificate.
The website clearly distinguishes xNet update signatures from OS publisher trust.
No installation of a self-signed certificate into a user's trust store is required.

**Tripwire:** obtain platform publisher signing when OS warnings or managed-device
policies prevent friends from installing, and revisit automated promotion only
after profile-preserving upgrades have been rehearsed on every supported target.
