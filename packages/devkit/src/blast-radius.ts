/**
 * @xnetjs/devkit — blast-radius resolution for point-and-change (exploration 0399).
 *
 * Answers the question every "change this" gesture asks before anything runs:
 * *which layer owns this pixel, and how much moves if we touch it?*
 *
 *   Lane 1 — theme tokens and layout commands. No code, no build, one Undo.
 *   Lane 2 — a workspace plugin surface. Sandboxed, hot, no rebuild of xNet.
 *   Lane 3 — xNet's own source. Isolated worktree, validation gate, pull request.
 *
 * Two properties are deliberately kept apart, because conflating them is how
 * this feature would surprise people:
 *
 * - {@link Lane} is the MECHANISM (and therefore the ceremony) a change needs.
 * - {@link ChangeScope} is how much of the UI actually moves.
 *
 * They are not correlated. A Lane 1 token edit is the cheapest mechanism there
 * is and repaints the entire app; a Lane 3 source edit drags a PR through CI
 * and may move one button. The UI must show the scope sentence, not the lane
 * number, or "make this blue" quietly restyles everything.
 *
 * Pure and dependency-free on purpose: the node-side dev loop and the browser
 * overlay both need this verdict, so it must not reach for `node:` or for
 * `@xnetjs/core` (whose `TaggedError` would cost devkit its zero-dependency
 * property). Refusals are therefore RETURNED as data — `allowed: false` plus a
 * sentence — never thrown. A refusal the caller must render is louder than an
 * exception it might swallow.
 */

/** Which layer owns the pointed element, and therefore what a change costs. */
export type Lane = 1 | 2 | 3

/** How much of the UI a change moves — independent of {@link Lane}. */
export type ChangeScope = 'global' | 'surface' | 'component'

/**
 * Kernel packages that point-and-change refuses in v1.
 *
 * The validation gate proves "not broken", not "not wrong": a change here can
 * typecheck, lint, and pass tests while silently altering the wire format, an
 * authz check, or a CRDT invariant. Those edits belong in a reviewed PR a human
 * started deliberately, not one a gesture started.
 */
export const KERNEL_PACKAGES: readonly string[] = ['sync', 'crypto', 'identity', 'data']

/**
 * What the pointer resolved about an element, gathered by the caller.
 *
 * Every field is optional because the overlay fills in whatever it can find by
 * walking up the DOM; an element with none of them is unstamped and gets the
 * `unknown` verdict rather than a guess.
 */
export interface PointedElement {
  /** `file:line:col`, from the `data-xnet-src` attribute the dev build stamps. */
  source?: string
  /** Theme token the element's computed style resolved to, e.g. `--surface-1`. */
  tokenRef?: string
  /** Registered `SlotContribution` id, when the element sits inside a panel. */
  slotId?: string
  /** Human label for {@link slotId}, used in the explain sentence. */
  slotLabel?: string
  /** Workspace-plugin id, when a plugin surface rendered this element. */
  pluginId?: string
  /** Human name for {@link pluginId}. */
  pluginName?: string
}

/** The verdict. `explain` is shown verbatim — write it for a human, not a log. */
export interface Resolution {
  lane: Lane
  scope: ChangeScope
  /** One sentence naming what moves. Rendered before anything runs. */
  explain: string
  /** False when v1 refuses the edit; `explain` says why. */
  allowed: boolean
  /** Lane 3 only: the workspace package the edit would land in. */
  pkg?: string
  /** True when {@link pkg} is a kernel package — implies `allowed: false`. */
  kernel?: boolean
  /** Echoed back so the caller can hand the agent a location without re-parsing. */
  source?: string
}

/** Where a source ref lives: which workspace root, and which directory in it. */
export interface WorkspaceRef {
  /** `packages` or `apps`. */
  root: 'packages' | 'apps'
  /** The directory name, e.g. `ui` or `web`. */
  name: string
  /** `packages/ui` — what a human should be shown. */
  path: string
}

/**
 * Locate the workspace a `data-xnet-src` value points into.
 *
 * Accepts both repo-relative (`packages/ui/src/Button.tsx:12:4`) and absolute
 * paths, and returns `undefined` rather than a guess when the path is outside
 * `packages/` and `apps/` — an unknown owner must not be silently treated as an
 * ordinary Lane 3 edit.
 */
export function workspaceOf(source: string | undefined): WorkspaceRef | undefined {
  if (!source) return undefined
  const path = source.replace(/\\/g, '/')
  const match = /(?:^|\/)(packages|apps)\/([^/]+)\//.exec(path)
  if (!match) return undefined
  const root = match[1] as 'packages' | 'apps'
  return { root, name: match[2], path: `${root}/${match[2]}` }
}

/** The directory name alone. Kept for call sites that only need the identifier. */
export function packageOf(source: string | undefined): string | undefined {
  return workspaceOf(source)?.name
}

/**
 * Whether a ref points at kernel code.
 *
 * Scoped to `packages/` on purpose: an app directory that happened to be named
 * `sync` is not the sync kernel, and refusing it would be a confusing lie.
 */
export function isKernel(ref: WorkspaceRef | undefined): boolean {
  return ref?.root === 'packages' && KERNEL_PACKAGES.includes(ref.name)
}

/** Strip the `:line:col` suffix so the file path can be shown on its own. */
export function fileOf(source: string | undefined): string | undefined {
  if (!source) return undefined
  const match = /^(.*?)(?::\d+){0,2}$/.exec(source.replace(/\\/g, '/'))
  return match?.[1] || undefined
}

/**
 * Resolve a pointed element to the lowest lane that can satisfy a change.
 *
 * Order is token → slot → plugin → source, and it is not arbitrary: a token
 * change is still a token change when it happens inside a plugin surface, so
 * the cheapest MECHANISM wins even though its SCOPE is the widest. The explain
 * sentence carries that asymmetry to the user.
 */
export function resolveLane(element: PointedElement): Resolution {
  if (element.tokenRef) {
    return {
      lane: 1,
      scope: 'global',
      allowed: true,
      source: element.source,
      explain: `Changes the ${element.tokenRef} theme token everywhere it is used — this restyles the whole app, not just this element.`
    }
  }

  if (element.slotId) {
    const label = element.slotLabel ?? element.slotId
    return {
      lane: 1,
      scope: 'surface',
      allowed: true,
      source: element.source,
      explain: `Moves or hides the ${label} panel. Applies immediately and is one Undo away.`
    }
  }

  if (element.pluginId) {
    const name = element.pluginName ?? element.pluginId
    return {
      lane: 2,
      scope: 'surface',
      allowed: true,
      source: element.source,
      explain: `Edits the ${name} plugin. It runs sandboxed, so xNet itself is not rebuilt.`
    }
  }

  const workspace = workspaceOf(element.source)

  if (!workspace) {
    return {
      lane: 3,
      scope: 'component',
      allowed: false,
      source: element.source,
      explain:
        'This element has no source mapping, so there is nothing to point an edit at. Run the dev build to enable inspection.'
    }
  }

  if (isKernel(workspace)) {
    return {
      lane: 3,
      scope: 'component',
      allowed: false,
      pkg: workspace.name,
      kernel: true,
      source: element.source,
      explain: `This is kernel code in ${workspace.path}. Point-and-change refuses it: a change here can pass every check and still break sync, identity, or stored data. Edit it in a pull request you start deliberately.`
    }
  }

  return {
    lane: 3,
    scope: 'component',
    allowed: true,
    pkg: workspace.name,
    kernel: false,
    source: element.source,
    explain: `Edits xNet's own source in ${workspace.path}. Runs in an isolated worktree and opens a draft pull request — nothing in this app changes until it is merged.`
  }
}

/**
 * The prompt an agent may see for a Lane 3 task.
 *
 * Deliberately built from the source LOCATION and the user's own instruction
 * only. The pointed element's rendered text is workspace content — authored by
 * whoever wrote the page, which on a synced or shared workspace is not
 * necessarily the person clicking. Feeding it to an agent that can edit the
 * repository turns any document into an instruction channel, so it never
 * crosses this boundary. See exploration 0399, "Risks And Open Questions".
 */
export function lane3Prompt(resolution: Resolution, instruction: string): string {
  const file = fileOf(resolution.source)
  const where = file ? `The user pointed at ${file}.` : 'The user did not point at a specific file.'
  return [
    where,
    `Workspace: ${workspaceOf(resolution.source)?.path ?? 'unknown'}.`,
    '',
    'Instruction from the user:',
    instruction
  ].join('\n')
}
