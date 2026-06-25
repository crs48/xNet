/**
 * `ScopedQuery` — a tiny immutable wrapper used by {@link AuthorizeReadHook} to
 * narrow an incoming read. `and()` merges equality filters into the
 * descriptor's `where` clause (AND semantics), the canonical row-level-security
 * move.
 */
import type { ScopedQuery } from './types'
import type { QueryDescriptor } from '@xnetjs/data-bridge'

export function scopedQuery(descriptor: QueryDescriptor): ScopedQuery {
  return {
    descriptor,
    and(where: Record<string, unknown>): ScopedQuery {
      return scopedQuery({
        ...descriptor,
        where: { ...(descriptor.where ?? {}), ...where }
      })
    }
  }
}

/** Coerce a hook return value (ScopedQuery or raw descriptor) to a descriptor. */
export function toDescriptor(value: ScopedQuery | QueryDescriptor): QueryDescriptor {
  return 'descriptor' in value ? value.descriptor : value
}
