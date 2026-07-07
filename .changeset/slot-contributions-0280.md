---
'@xnetjs/plugins': minor
---

Generalize the SurfaceDock contract into shell-wide slot contributions (exploration 0280). New `SlotContribution` type (with `defaultRegion` / `allowedRegions`), `SlotRegion` union, a `slots` registry on `ContributionRegistry`, a `slots` key on `PluginContributions`, and `ExtensionContext.registerSlotView()`. `SurfaceDockContribution` and the `surfaceDock` registry remain as deprecated aliases — no breaking changes.
