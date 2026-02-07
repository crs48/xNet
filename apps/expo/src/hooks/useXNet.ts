/**
 * XNet client hook for Expo
 *
 * @deprecated Use XNetProvider and useXNetContext from '../context/XNetProvider' instead.
 * This hook is maintained for backwards compatibility.
 */
import { useXNetContext } from '../context/XNetProvider'

interface UseXNetResult {
  /** @deprecated Use `bridge` from useXNetContext instead */
  client: null // Deprecated - use bridge instead
  isReady: boolean
  identity: string | null
  error: Error | null
}

/**
 * @deprecated Use XNetProvider and useXNetContext instead.
 *
 * Migration:
 * ```tsx
 * // Old way
 * const { client, isReady } = useXNet()
 *
 * // New way - wrap your app in XNetProvider, then:
 * const { bridge, isReady, authorDID } = useXNetContext()
 * ```
 */
export function useXNet(): UseXNetResult {
  const { isReady, authorDID, error } = useXNetContext()

  return {
    client: null, // Deprecated - use bridge from useXNetContext instead
    isReady,
    identity: authorDID,
    error
  }
}
