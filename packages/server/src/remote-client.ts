/**
 * In-process `RemoteNodeQueryClient` adapter.
 *
 * Wraps a server `query` runner and injects the developer's bearer token onto
 * every request, so the same object can be handed to `XNetProvider`'s
 * `remoteNodeQueryClient` config. React `useQuery` reads (mode `'remote'` or
 * `'local-then-remote'`) then route to the server with no hook changes.
 */
import type { MaybePromise } from './types'
import type {
  RemoteNodeQueryClient,
  RemoteNodeQueryRequest,
  RemoteNodeQueryResponse
} from '@xnetjs/data-bridge'

export interface RemoteQueryRunner {
  query(request: RemoteNodeQueryRequest): Promise<RemoteNodeQueryResponse>
}

export function createInProcessRemoteQueryClient(
  runner: RemoteQueryRunner,
  getToken?: () => MaybePromise<string | undefined>
): RemoteNodeQueryClient {
  return {
    async query(request: RemoteNodeQueryRequest): Promise<RemoteNodeQueryResponse> {
      const token = getToken ? await getToken() : request.auth?.bearerToken
      return runner.query({
        ...request,
        auth: { ...(request.auth ?? {}), bearerToken: token }
      })
    }
  }
}
