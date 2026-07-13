---
'@xnetjs/plugins': major
---

`EditorContribution` carries BlockNote specs instead of TipTap extensions (exploration 0312).

- **Breaking**: `EditorContribution.extension` (TipTap `Extension`) and
  `EditorContribution.toolbar` (`ToolbarContribution`, removed entirely) are
  gone. Plugins now contribute `blockSpecs` / `inlineContentSpecs` /
  `styleSpecs` (opaque BlockNote spec objects keyed by spec name) plus
  behavior-only `slashMenuItems`.
- **Breaking**: the editor schema-skew guard is spec-based —
  `isSchemaDefiningExtension` is replaced by `isSchemaDefiningContribution`,
  and `findEditorSchemaRisks` / `warnOnEditorSchemaRisks` take the host's
  statically bundled spec names and flag any contributed spec outside that
  set (0205 invariant: schema specs must be identical across all
  collaborators or Yjs silently drops content).
- `SlashCommandContext.editor` is now a BlockNote editor instance.
- The `@tiptap/core` dependency is removed.
