import { TaggedError } from '@xnetjs/core'

export class LibraryProviderError extends TaggedError {
  readonly _tag = 'LibraryProviderError'
  constructor(
    message: string,
    readonly disposition: 'retry' | 'blocked' | 'unavailable',
    readonly retryAt?: number,
    readonly scope: 'resource' | 'provider' = 'resource',
    readonly host?: string
  ) {
    super(message)
  }
}
