---
'@xnetjs/billing': patch
'@xnetjs/devkit': patch
'@xnetjs/slack-compat': patch
'@xnetjs/trust': patch
---

fix(release): close the npm dependency closure and wire release tooling

Publish the four MIT leaf packages that already-published packages depend on
at runtime, fixing the latent release-blocker found in exploration 0220
(Decision F): @xnetjs/plugins -> trust + slack-compat, @xnetjs/react -> billing,
@xnetjs/cli -> devkit. Each leaf is flipped public with files[], LICENSE, and
provenance publishConfig.

Also:

- scripts/check-publish-closure.mjs + check:publish-closure (wired into the CI
  lint job): fail if any published package has an unpublished @xnetjs runtime dep.
- @changesets/changelog-github for PR-linked release notes.
- changeset-conventional-commits + changeset:from-commits (deterministic
  conventional-commit -> changeset bridge; runs on PR branches).
- Pin npm@latest in npm-release.yml for OIDC trusted publishing (>= 11.5.1).
- Add @xnetjs/cloud (FSL, commercial) to the changeset ignore list for
  defense-in-depth.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
