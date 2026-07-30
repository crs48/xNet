# Block reference

All exported from `@xnetjs/ui/exploration`.

## `<Screen surface label>`

| Prop      | Type                                               | Notes                     |
| --------- | -------------------------------------------------- | ------------------------- |
| `surface` | `browser \| desktop \| mobile \| popover \| panel` | default `panel`           |
| `label`   | `string`                                           | caption beneath the frame |

Children are plain semantic HTML. See `references/wireframe.md`.

## `<Callout tone>`

`tone`: `note` · `tip` · `important` · `warning` · `caution` · `decision`.
Mirrors the GitHub alert vocabulary the `.md` explorations use. Reserve
`warning`/`caution` for real hazards so they keep their signal.

## `<Diagram chart label>`

`chart` is raw mermaid source. Renders client-side.

> `mermaid` is **not** a dependency of `@xnetjs/ui` and is externalized in
> `.storybook/main.ts`. When it cannot be loaded the block shows its own source
> in a readable `<pre>` with a note. That degradation is deliberate — a visibly
> unrendered diagram is honest, a silently empty one is not.

## `<FileTree entries>`

`entries: { path, note?, changed? }[]`. `changed: true` tints the row. List the
files worth reading, never every touched file.

## `<AnnotatedCode code annotations filename>`

`annotations: { lines: "12" | "12-18", note }[]`. Anchor a few high-signal notes
to the lines that actually change — the new action, the changed schema, the
wiring point. Never one note per line. Drop to a plain fenced block for a
throwaway snippet with nothing to call out.

## `<Columns>` / `<Column title>`

Side-by-side comparison of two real options. Not decoration — if there is no
genuine choice, use prose.

## `<Checklist items>`

`items: { label, done? }[]`. **Read-only mirror.** The canonical checklist lives
in the `.md` and is flipped by `/implement`'s driver. Include this only when a
reader genuinely needs progress at a glance; a stale mirror is worse than none.

## `<OpenQuestions questions>`

`questions: string[]`. One block, at the bottom. Unresolved decisions only — not
a list of things you did not feel like writing.
