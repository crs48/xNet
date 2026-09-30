/** One quit attempt at a time. A failed save leaves the process and editor alive. */
export function createQuitBarrier(options: {
  prepare: () => Promise<void>
  finish: () => void
  failed: (error: unknown) => void | Promise<void>
}) {
  let approved = false
  let pending: Promise<void> | null = null
  return {
    get approved() {
      return approved
    },
    request(): Promise<void> {
      if (approved) return Promise.resolve()
      if (pending) return pending
      pending = Promise.resolve()
        .then(options.prepare)
        .then(() => {
          approved = true
          options.finish()
        })
        .catch((error: unknown) => {
          approved = false
          return options.failed(error)
        })
        .finally(() => {
          pending = null
        })
      return pending
    }
  }
}
