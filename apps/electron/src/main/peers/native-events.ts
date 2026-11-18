/** The 1.2.0 N-API binding emits error-first callbacks despite its .d.ts. */
export function readHomeRelayUpdate(args: readonly unknown[]): string[] {
  const value = args.length === 1 ? args[0] : args[1]
  if (args.length === 2 && args[0] != null) {
    throw new Error('Relay status watcher failed.', { cause: args[0] })
  }
  if (
    (args.length !== 1 && args.length !== 2) ||
    !Array.isArray(value) ||
    !value.every((url): url is string => typeof url === 'string')
  ) {
    throw new Error('Relay status watcher returned an invalid update.')
  }
  return value
}
