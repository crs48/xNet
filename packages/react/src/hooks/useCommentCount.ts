/**
 * useCommentCount - Get unresolved comment count for a Node.
 *
 * Useful for showing comment badges in navigation/sidebars.
 *
 * @example
 * ```tsx
 * function NavItem({ node }) {
 *   const count = useCommentCount(node.id)
 *
 *   return (
 *     <div className="nav-item">
 *       {node.title}
 *       {count > 0 && <span className="comment-badge">{count}</span>}
 *     </div>
 *   )
 * }
 * ```
 */
import { useMemo } from 'react'
import { useComments } from './useComments'

/**
 * Get the unresolved comment count for a Node.
 *
 * @param nodeId - The Node ID to get comment count for
 * @returns The number of unresolved comment threads
 */
export function useCommentCount(nodeId: string): number {
  const { unresolvedCount } = useComments({ nodeId })
  return unresolvedCount
}

/**
 * Get detailed comment counts for a Node.
 *
 * @param nodeId - The Node ID to get comment counts for
 * @returns Object with total and unresolved counts
 */
export function useCommentCounts(nodeId: string): {
  total: number
  unresolved: number
  resolved: number
} {
  const { threads } = useComments({ nodeId })

  return useMemo(() => {
    const resolved = threads.filter((t) => t.root.properties.resolved).length
    const unresolved = threads.length - resolved

    return {
      total: threads.length,
      unresolved,
      resolved
    }
  }, [threads])
}
