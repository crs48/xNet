/**
 * V4 Serializer — identical wire format to V3, protocol version 4.
 *
 * Protocol v4 (exploration 0305) changes only the *convergence rule* (a
 * grinding-resistant LWW final tiebreak, see `@xnetjs/core`'s
 * `computeLwwTiebreakKey`). That tiebreak key is DERIVED at resolution time
 * from the change's own fields — it is never part of the wire format or the
 * change hash — so the v4 wire is byte-identical to v3. V4Serializer therefore
 * reuses every V3 code path and only stamps `v: 4` / `protocolVersion: 4`
 * (handled by V3Serializer reading `this.version`).
 */

import { V3Serializer } from './v3'

export class V4Serializer extends V3Serializer {
  readonly version: number = 4
  readonly name = 'V4 Serializer (v3 wire + grinding-resistant LWW tiebreak)'
}

/** Default V4 serializer instance. */
export const v4Serializer = new V4Serializer()
