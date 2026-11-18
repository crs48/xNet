# Security

This is early-beta peer-to-peer software. See [known limits](docs/beta.md) before
using it for sensitive conversations. Private room grants are capability secrets;
do not put them in reports. Never share a profile directory, identity key, local
bridge token, or updater signing key.

Report vulnerabilities privately through [GitHub security advisories](https://github.com/crs48/xNet/security/advisories/new).
Include the app version and a minimal reproduction using synthetic data.
Do not publish another person's messages or credentials in an issue.

The maintained product is the Tauri app and its Rust services. Retired SDK and
Electron releases are archived and receive no ongoing support. A new app profile
is not a migration or backup of an old Electron workspace.
