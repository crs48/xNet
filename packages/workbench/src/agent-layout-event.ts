/**
 * The window event the workspace agent module dispatches after mutating the
 * layout tree, and the chrome listens for to announce the change (0280).
 * Payload contract: `CustomEvent<{ message: string }>`.
 */
export const AGENT_LAYOUT_EVENT = 'xnet:workspace:agent-change'
