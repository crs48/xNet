/**
 * The AI chat cluster (explorations 0174/0192/0391), exported as its own
 * subpath — `@xnetjs/workbench/ai` — so hosts opt in: the panel pulls
 * @xnetjs/brain and the WebLLM engine plumbing, which the core barrel's
 * consumers should not pay for.
 *
 * The panel is host-aware by construction: it probes `window.xnetAgentBridge`
 * (the desktop preload, #638) for the bridge tier and auto-pairs over IPC,
 * and falls back to the browser tiers (managed, cloud-key, local-server,
 * webllm) everywhere else.
 */

export { AiChatPanel } from './AiChatPanel'
export * from './ai-chat-connector'
export * from './ai-chat-persistence'
export * from './ai-chat-tools'
export * from './ai-context'
export * from './ai-graph-retriever'
export * from './ai-schemas'
export * from './ai-vector-search'
export * from './ai-vector-storage'
export * from './ai-webllm-engine'
