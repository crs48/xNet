import type { ExtensionRequest } from './extension-protocol'
import {
  decodeExtensionRequest,
  encodeExtensionFailure,
  ExtensionAccessError,
  EXTENSION_OPERATIONS
} from './extension-protocol'

type Reply =
  | { type: 'result'; id: string; result: unknown }
  | { type: 'result'; id: string; error: ReturnType<typeof encodeExtensionFailure> }

/** A dispatcher belongs to one host-bound MessagePort; requests cannot choose another caller. */
export function createExtensionDispatcher(
  request: (input: ExtensionRequest, signal: AbortSignal) => Promise<unknown>,
  send: (reply: Reply) => void
) {
  const pending = new Map<
    string,
    { controller: AbortController; timer: ReturnType<typeof setTimeout> }
  >()
  let stopped = false
  return {
    dispatch(input: unknown) {
      if (stopped) throw new ExtensionAccessError('revoked', 'Extension access has stopped.')
      const value = decodeExtensionRequest(input)
      if (pending.has(value.id))
        throw new ExtensionAccessError('invalid', 'Duplicate in-flight request identifier.')
      if (pending.size >= 20) {
        send({
          type: 'result',
          id: value.id,
          error: encodeExtensionFailure(
            new ExtensionAccessError('quota', 'Too many pending requests.')
          )
        })
        return
      }
      const controller = new AbortController()
      const timer = setTimeout(() => {
        controller.abort()
        pending.delete(value.id)
        send({
          type: 'result',
          id: value.id,
          error: encodeExtensionFailure(
            new ExtensionAccessError(
              'timeout',
              'The operation timed out. An accepted edit may have committed; refresh before retrying.'
            )
          )
        })
      }, EXTENSION_OPERATIONS[value.operation].deadlineMs)
      pending.set(value.id, { controller, timer })
      void Promise.resolve()
        .then(() => {
          if (controller.signal.aborted)
            throw new ExtensionAccessError('cancelled', 'The request was cancelled.')
          return request(value, controller.signal)
        })
        .then(
          (result) => {
            if (!controller.signal.aborted) send({ type: 'result', id: value.id, result })
          },
          (error: unknown) => {
            if (!controller.signal.aborted)
              send({ type: 'result', id: value.id, error: encodeExtensionFailure(error) })
          }
        )
        .finally(() => {
          clearTimeout(timer)
          if (pending.get(value.id)?.controller === controller) pending.delete(value.id)
        })
    },
    stop() {
      stopped = true
      for (const { controller, timer } of pending.values()) {
        clearTimeout(timer)
        controller.abort()
      }
      pending.clear()
    }
  }
}
