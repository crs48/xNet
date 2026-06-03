/**
 * Runtime compatibility helpers for network dependencies.
 */

type PromiseWithResolvers<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

type PromiseConstructorWithResolvers = PromiseConstructor & {
  withResolvers?: <T>() => PromiseWithResolvers<T>
}

/**
 * Ensure dependencies using Promise.withResolvers continue to work on Node 20.
 */
export function ensurePromiseWithResolvers(): void {
  const promiseConstructor = Promise as PromiseConstructorWithResolvers

  if (typeof promiseConstructor.withResolvers === 'function') {
    return
  }

  Object.defineProperty(promiseConstructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: <T>(): PromiseWithResolvers<T> => {
      let resolve: PromiseWithResolvers<T>['resolve'] | undefined
      let reject: PromiseWithResolvers<T>['reject'] | undefined
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })

      if (!resolve || !reject) {
        throw new Error('Promise.withResolvers polyfill failed to initialize')
      }

      return { promise, resolve, reject }
    }
  })
}
