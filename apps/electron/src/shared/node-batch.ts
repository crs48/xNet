import type { ApplyNodeBatchInput, NodeChange, NodeState } from '@xnetjs/data'

/** Keep byte arrays explicit across the renderer, main, and utility boundaries. */
export type SerializedNodeBatch = Omit<ApplyNodeBatchInput, 'nodes' | 'changes'> & {
  nodes: Array<Omit<NodeState, 'documentContent'> & { documentContent?: number[] }>
  changes: Array<Omit<NodeChange, 'signature'> & { signature: number[] }>
}

export function serializeNodeBatch(input: ApplyNodeBatchInput): SerializedNodeBatch {
  return {
    ...input,
    nodes: input.nodes.map((node) => ({
      ...node,
      documentContent: node.documentContent ? Array.from(node.documentContent) : undefined
    })),
    changes: input.changes.map((change) => ({ ...change, signature: Array.from(change.signature) }))
  }
}

export function deserializeNodeBatch(input: SerializedNodeBatch): ApplyNodeBatchInput {
  return {
    ...input,
    nodes: input.nodes.map((node) => ({
      ...node,
      documentContent: node.documentContent ? new Uint8Array(node.documentContent) : undefined
    })),
    changes: input.changes.map((change) => ({
      ...change,
      signature: new Uint8Array(change.signature)
    }))
  }
}
