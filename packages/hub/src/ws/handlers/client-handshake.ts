/**
 * @xnetjs/hub - `client-handshake` handler (protocol version negotiation).
 *
 * The hub's own `handshake` message is sent on connection (before the pump)
 * in server.ts; this handles the client's reply. A client-handshake may
 * arrive at any point — it was never required to be the first message — and
 * an incompatible version only warns, it never closes the connection.
 */

import type { Metrics } from '../../middleware/metrics'
import type { ClientHandshakeMessage } from '../guards'
import type { WsHandler } from '../message-router'
import { HUB_METRICS } from '../../middleware/metrics'

export const createClientHandshakeHandler = (deps: {
  metrics: Metrics
}): WsHandler<ClientHandshakeMessage> => {
  return (payload, ctx) => {
    const hubProtocolVersion = 1
    const hubMinProtocolVersion = 1

    // Check version compatibility
    const clientMax = payload.protocolVersion
    const clientMin = payload.minProtocolVersion

    // Find compatible version range
    const agreedVersion = Math.min(hubProtocolVersion, clientMax)
    const minRequired = Math.max(hubMinProtocolVersion, clientMin)

    if (agreedVersion < minRequired) {
      // Versions are incompatible
      const suggestion =
        clientMax < hubMinProtocolVersion
          ? 'upgrade-client'
          : hubProtocolVersion < clientMin
            ? 'upgrade-hub'
            : 'incompatible'

      ctx.ws.send(
        JSON.stringify({
          type: 'version-mismatch',
          hubVersion: hubProtocolVersion,
          clientVersion: clientMax,
          suggestion,
          message:
            suggestion === 'upgrade-client'
              ? `Client protocol v${clientMax} is too old. Please upgrade to at least v${hubMinProtocolVersion}.`
              : suggestion === 'upgrade-hub'
                ? `Hub protocol v${hubProtocolVersion} is too old for client v${clientMin}.`
                : 'Protocol versions are incompatible.'
        })
      )
      deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
      // Don't close the connection - just warn
    } else if (clientMax < hubProtocolVersion) {
      // Client is using older version - log for metrics
      console.log(
        `Client ${payload.did} using older protocol v${clientMax} (hub is v${hubProtocolVersion})`
      )
    }
    return 'handled'
  }
}
