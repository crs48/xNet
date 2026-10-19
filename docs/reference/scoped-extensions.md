# Scoped chat extensions

The local prototype supports interactive React views over explicitly selected xNet
records. It is an experimental subset of [exploration 0481](../explorations/0481_[_]_THE_FULL_XNET_API_INSIDE_SCOPED_EXTENSIONS.md).
The complete API design is not implemented or independently reviewed.

## Available imports

| Import                                   | Available exports                                                | Authority                                                     |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `react`, `react/jsx-runtime`             | Pinned React 18 runtime                                          | Worker state, effects, context, JSX                           |
| `@xnetjs/react`, `@xnetjs/react/queries` | `useQuery`, `useMutate`                                          | Scoped DataBridge; no host provider/context                   |
| `@xnetjs/data`                           | `ChannelSchema`, `ChatMessageSchema`, `TaskSchema`, `PageSchema` | Schema definitions only                                       |
| `@xnetjs/ui`                             | `Badge`, `Button`                                                | Closed host-rendered controls; Button is a restricted adapter |

Other imports fail. New host exports do not automatically become extension APIs.
The [generated inventory](extension-api-inventory.json) classifies runtime exports
from every declared data, React, plugins, SDK, and UI entrypoint, including
Node-only plugin services and stylesheet resources. Extension SDK authors regenerate
it with `node scripts/extensions/inventory.mjs`; `--check` passes only when the
committed inventory matches the current exports. Run `--selftest` to verify that
an export planted only in compiler memory is detected. This is a manual review aid,
not a new CI job or a claim that the listed APIs have all been implemented.

## Data and writes

`useQuery` sees approved conversations and their messages, plus individually
selected personal tasks/pages. Authorization precedes projection and the guest's
filter/sort. It receives only these property fields:

| Schema      | Properties                                            |
| ----------- | ----------------------------------------------------- |
| Task        | `title`, `status`, `completed`, `priority`, `dueDate` |
| Page        | `title`, `icon`                                       |
| Channel     | `name`, `description`                                 |
| ChatMessage | `channel`, `content`, `author`, `createdAt`           |

System IDs, schema IDs, creator, and creation/update times accompany these fields.
Document bodies, relation targets, attachments, raw timestamps, and store handles
are excluded. The host refuses oversized selections rather than silently truncating
them. This is a bounded live snapshot, not the planned cursor/pagination API.

`useMutate` uses the real hook implementation. The host supports:

- `create(TaskSchema, properties)`: separate creation permission; always private.
- `update(TaskSchema, id, properties)`: separately approved tasks; the five task
  fields above only. Ownership, visibility, relations, and containers cannot change.
- `remove(id)` and `restore(id)`: separate delete/restore permission.
- `mutate(operations)`: at most 20 operations; every operation must pass before any
  change is submitted. A record may appear only once in a batch. The host assigns new task IDs;
  custom/temporary IDs and bulk import are not supported.

Tasks must belong to the current owner and have no space, project, page, canvas,
folder, or parent. Public/unlisted destinations are refused. These checks deliberately
avoid shared-destination writes; they are not a general audience or E2E-encryption
proof. Community authorization/encryption remains a separate prerequisite.

The storage owner compares the approved structured snapshots and deadline inside
the committing transaction. Document-byte guards and databases with active spatial indexes
are refused until they have a compatible conditional path. Undo also checks committed change heads and refuses
to overwrite a later edit. Undo that deletes or restores a task requires the same
explicit delete/restore permission as a direct command. Tasks created by an extension persist, but their automatic scope inclusion currently
lasts only for that session; select them explicitly when reopening. Receipts and replay IDs live for this runtime session;
they do not supply durable exactly-once execution across restarts.

```mermaid
sequenceDiagram
  participant UI as Extension worker
  participant Host as Host broker
  participant DB as Storage owner
  UI->>Host: Versioned command (no caller or grant fields)
  Host->>Host: Bound grant, fields, destination, quota
  Host->>DB: Read current records
  Host->>Host: Validate complete batch
  Host->>DB: Conditional atomic transaction
  DB->>DB: Compare snapshots, heads, deadline
  DB-->>Host: Committed states and change heads
  Host-->>UI: Projected results
```

## Runtime and revocation

The host compiles TSX and pins source, compiled code, compiler, and runtime to one
hash. Each new hash needs approval. React mounts in a worker under an opaque-origin
iframe whose CSP blocks network. Remote DOM provides the worker's DOM polyfill;
only validated text/layout/button/text-input snapshots enter the host. No guest
HTML, URL, callback, or arbitrary component property is executed in the host.

Use `<Button onClick={...}>` or `<input value={value}
onInput={event => setValue(event.currentTarget.value)} />`. Catch mutation errors
and display them. Hooks can keep state and effects; effects do not confer new
permissions. Complex editors, portals, rich focus behavior, and arbitrary xNet
components have not been verified for this runtime.

Limits: 24,000 source characters, 100,000 compiled characters, 200 records per
selection, 500 total records, 256,000 UTF-8 input bytes, 300 rendered nodes,
12 levels, and 32,000 text characters. Requests are bounded to 16 KiB, 20 operations,
and 200 unique commands per session. A foreground heartbeat terminates an
unresponsive worker. Chromium background throttling is not reported as an agent
failure. Workers do not provide a hard heap quota or an OS process boundary.

Revoking access stops admission and data delivery immediately, destroys the worker,
and drains already accepted commits before reporting completion. It does not undo
committed work. It cannot recall bytes already observed. Closing the panel or
changing source destroys the runtime. New permission approvals never happen in
guest UI, and the worker has no access to the host's saved grants.

## Still unavailable

Raw `useXNet`, `useNodeStore`, host DataBridge, signing keys, Electron IPC, SQL,
filesystem, and sync administration remain host-only. `useNode`, document editing,
raw Yjs, assets, database/canvas components, custom schemas/migrations, connectors,
AI calls, durable background jobs, and cross-device delegation still need scoped
implementations. Existing trusted workspace plugin contexts have not been migrated
and must not be exposed to this worker. The expanded boundary still needs an
independent security review before use with sensitive third-party extensions.
