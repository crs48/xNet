# Property Editor Contract

This document defines expected behavior for `PropertyHandler.Editor` components used by table cells.

## Props

Editors receive `PropertyEditorProps<T>`:

- `value`: current draft value.
- `config`: property config for the column.
- `onChange(next)`: update the draft value (no persistence required).
- `onCommit(next?, reason?)`: optional explicit commit hook.
- `onCancel()`: optional explicit cancel hook.
- `onBlur()`: cell-level blur callback.
- `autoFocus`: request focus when editor mounts.
- `disabled`: read-only mode.

## Behavioral Expectations

- **Draft-first**: call `onChange` during typing or picker interaction.
- **Commit**:
  - use `onCommit` for explicit actions (picker selection, Enter submit) when the editor controls commit timing.
  - otherwise, rely on table-cell keyboard/blur commit behavior.
- **Cancel**: call `onCancel` for Escape-like explicit cancel flows.
- **Blur safety**: avoid closing popovers while focus remains inside the same editor root.
- **Keyboard parity**: support Enter, Escape, and arrow navigation where applicable.
- **A11y**: combobox-style editors should expose `role="combobox"` and `role="listbox"`/`role="option"` semantics.

## Commit Reasons

`EditorCommitReason` values:

- `enter`
- `tab`
- `blur`
- `picker-select`
- `programmatic`
