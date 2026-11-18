import type { ChatExtensionProposal, ChatPreviewNode } from './agent-extension'

/** Evidence from a disposable test copy. Never contains a workspace grant. */
export interface ExtensionCheckObservation {
  tree: ChatPreviewNode | null
  rendered?: boolean
  text: string
  controls: Array<{
    id: string
    label: string
    type: 'button' | 'input'
    disabled: boolean
    x: number
    y: number
    width: number
    height: number
  }>
  errors: string[]
  width: number
  height: number
  overflow: boolean
  requiresData: boolean
  requiresNetwork?: boolean
}
export interface ExtensionCheckAction {
  type: 'click' | 'input' | 'resize' | 'reset'
  target: string | null
  value: string | null
  width: number | null
  expectText: string | null
}
export interface ExtensionCheckReport {
  status: 'running' | 'passed' | 'limited' | 'failed'
  summary: string
  steps: string[]
  revisions: number
  actions: number
  screenshot?: string
}
export interface ExtensionCheckDecision {
  status: 'act' | 'revise' | 'pass' | 'blocked'
  summary: string
  actions: ExtensionCheckAction[]
  extension: ChatExtensionProposal | null
}
export interface ExtensionCheckDriver {
  start(source: string): Promise<ExtensionCheckObservation>
  observe(): Promise<ExtensionCheckObservation>
  action(action: ExtensionCheckAction): Promise<ExtensionCheckObservation>
}
