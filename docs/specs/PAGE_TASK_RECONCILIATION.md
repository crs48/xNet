# Page Task Reconciliation Spec

Defines the invariants for reconciling editor-embedded task items (TipTap
`PageTaskItemExtension` rows) with canonical Task nodes
(`packages/data/src/schema/schemas/task.ts`). Implemented by
`packages/react/src/hooks/usePageTaskSync.ts` and exercised by
`usePageTaskSync.test.tsx`.

Companion to exploration
`docs/explorations/0161_[_]_LINEAR_STYLE_TASKS_AS_A_PORTABLE_CROSS_SURFACE_PRIMITIVE.md`.

## Model

- The **Task node is canonical**. Every surface (page, canvas, database
  relation cell, task views) holds only a `taskId` reference plus
  surface-local layout (block anchor, canvas position, sortKey).
- A page's checklist items are an **editing projection** of Task nodes
  whose `page` property points at that page.
- There are **no copies**. Editing a task from any surface mutates the
  same node; all other surfaces converge via `useQuery` subscriptions.

## Field authority

While a page hosts a task (`task.page === pageId`):

| Field                                | Authority                   | Notes                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                              | **Editor text**             | The TipTap item's text content is authoritative; the node property is a mirror written by the bridge. Tasks created elsewhere write the property first and the bridge materializes editor text when embedded.                                                                                                         |
| `completed`                          | **Editor doc** while hosted | Non-editor surfaces (board, canvas card) must write through to the node _and_ the change must propagate into the host page's Y.Doc (node → editor direction, owned by the embedding editor); the next editor snapshot then reflects it. A reconciliation pass always writes the latest editor snapshot over the node. |
| `status`                             | Derived on toggle           | `completed=true` → `done`; un-completing a `done` task → `todo`; other statuses set from non-editor surfaces are preserved (`getNextStatus`).                                                                                                                                                                         |
| `parent`, `sortKey`, `anchorBlockId` | **Editor structure**        | Nesting and order inside the host page come from the document.                                                                                                                                                                                                                                                        |
| `assignees`, `dueDate`, `references` | Editor metadata extensions  | Mirrored from inline metadata (mentions, due-date chips, smart references).                                                                                                                                                                                                                                           |
| `page`, `source`                     | Bridge                      | `source: 'page'` whenever a page claims the task.                                                                                                                                                                                                                                                                     |

## Reconciliation algorithm

On each (debounced) editor snapshot for `pageId`:

1. Query Task nodes `where: { page: pageId }` including deleted
   (archived) ones.
2. For each snapshot item:
   - **Known on this page** (id in query result): diff fields and apply a
     minimal update. If the node is archived, **restore** it first
     (re-adding a previously removed item resurrects the same node —
     undo-friendly, preserves history/comments/references).
   - **Unknown on this page** (id not in query result): **claim**:
     - `restore(taskId)` — succeeds iff the node exists anywhere
       (resurrects it if it was archived by its previous host page);
       throws if the node has never existed.
     - On restore success → `update` with the full projection (sets
       `page` to this page: this is the cross-page move).
     - On restore failure → `create` with the given id (genuinely new
       task born in this editor).
3. For each previously-hosted task missing from the snapshot: **archive**
   (soft delete). Never hard-delete from a reconciliation pass.

### Cross-page moves (cut/paste)

A task item cut from page A and pasted into page B keeps its `taskId`
(the TipTap attribute travels with the content). Page B's sync claims the
node (restore + update `page: B`); page A's sync archives it when its
snapshot no longer contains the item. Orderings:

- **B claims, then A archives**: A's query is scoped to `page: A`; after
  B's claim the node no longer matches A's query, so A does not archive
  it. Converges correctly.
- **A archives, then B claims**: B's `restore` resurrects the node and
  the update moves it. Converges correctly.
- **Same-instant writes** (clock-skewed offline peers): per-property LWW
  applies; the claim's `restore` + `page` write and the archive tombstone
  are ordered by Lamport clock. A claim that loses can leave the task
  archived until either page re-syncs — self-healing on next edit, and
  surfaced as a tombstone (below), never data loss. A future
  compare-and-set on `page` can close this window.

## Deletion semantics

Three distinct operations, never conflated:

| Operation                        | Trigger                                                                       | Effect                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Complete**                     | checkbox / status change                                                      | State change only. The task stays everywhere it is rendered.                                                                                                                                     |
| **Unlink / remove from surface** | deleting the checklist item, removing a canvas card, clearing a relation cell | Removes the surface reference. From the host page this archives the node (soft delete); from non-host surfaces (canvas card, relation cell) it only drops the reference — the node is untouched. |
| **Archive (soft delete)**        | explicit "delete task", or host page unlink                                   | `deleted: true` tombstone; restorable; excluded from default queries. Hard deletion is reserved for explicit data-management flows, never reconciliation.                                        |

**Tombstones:** any surface resolving a `taskId` whose node is archived
or missing must render a tombstone chip ("task removed" + restore
affordance when the node exists), never crash and never silently drop
the reference. Implemented by the shared task components in
`packages/ui` (`TaskChip` with `tombstone` state).

## Invariants

1. One `taskId` ⇒ at most one Task node, ever. Claims restore; they never
   create duplicates.
2. Reconciliation never hard-deletes.
3. A snapshot containing a task always leaves that task alive (restored
   if needed) and hosted by the snapshot's page.
4. A task absent from its host page's snapshot ends archived — unless
   another page claimed it first (its `page` moved), in which case it is
   left alone.
5. Reconciliation is idempotent: replaying the same snapshot produces no
   writes (empty diff short-circuits).
6. **No reconciliation before the first editor snapshot.** The hook's
   default (empty) snapshot is "the editor hasn't spoken yet", not "the
   page is empty" — reconciling it would archive every hosted task on a
   mount race. The gate is keyed to the host id, so a surface reused
   across navigation never reconciles a previous host's snapshot either
   (exploration 0296).
7. **Placeholder titles never overwrite real titles.** The extraction
   falls back to `Untitled task` for items with no text, and deletion
   gestures empty an item's text one transaction before removing the
   node — so a snapshot can transiently carry the placeholder for a task
   that still has a real title. Diff updates skip the title in that case,
   and claims omit the title entirely when the snapshot only has the
   placeholder (exploration 0296).
