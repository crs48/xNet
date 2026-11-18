import type { RoomInvitation } from './extension-room-policy'
import type {
  RoomEvent,
  RoomRequest,
  RoomState,
  RoomValue
} from '../../../../packages/workbench/src/communities/extension-room-contract'
import type { Connection } from '@number0/iroh'
import { randomBytes } from 'node:crypto'
import { Endpoint, EndpointAddr, EndpointTicket, RelayMode } from '@number0/iroh'
import {
  ROOM_ALPN,
  ROOM_LIFETIME,
  ROOM_PEER_LIMIT,
  authorizeRoomJoin,
  decodeRoomFrame,
  decodeRoomInvitation,
  encodeRoomFrame,
  encodeRoomInvitation,
  roomBudget
} from './extension-room-policy'

const peerId = (connection: Connection) =>
  Buffer.from(connection.remoteId().toBytes()).toString('hex')
const timeout = async <T>(promise: Promise<T>, ms: number, cancel: () => void): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancel()
          reject(new Error('The room connection timed out.'))
        }, ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
export function createExtensionRooms(options: {
  application: string
  active: () => boolean
  confirm: (role: 'host' | 'guest') => Promise<boolean>
  emit: (event: RoomEvent) => void
  /** Tests may disable relays; extensions cannot supply addresses or relay configuration. */
  nearbyOnly?: boolean
}) {
  let endpoint: Endpoint | undefined
  let state: RoomState | null = null
  let invitation: RoomInvitation | undefined
  let generation = 0,
    sequence = 0,
    incoming = 0,
    busy = false
  let timer: ReturnType<typeof setInterval> | undefined
  const pending = new Set<Connection>()
  const admitting = new Set<string>()
  const peers = new Map<string, { connection: Connection; receivedAt: number; sequence: number }>()
  const sendBudget = roomBudget(30),
    admitBudget = roomBudget(16, 60_000)
  const active = (version: number) => options.active() && generation === version
  const snapshot = () => {
    if (!state) return null
    state = {
      ...state,
      peers: [...peers].map(([id, { connection }]) => {
        const path = connection.paths().find((path) => path.isSelected)
        return {
          id,
          route: path?.isIp ? 'direct' : path?.isRelay ? 'relay' : 'connecting',
          latencyMs: path?.rttMs ?? null
        }
      })
    }
    return state
  }
  const publish = () => options.emit({ type: 'state', room: snapshot() })
  const close = async () => {
    generation++
    clearInterval(timer)
    for (const connection of pending) connection.close(0n, [])
    for (const { connection } of peers.values()) connection.close(0n, [])
    pending.clear()
    admitting.clear()
    peers.clear()
    const previous = endpoint
    endpoint = undefined
    state = null
    invitation = undefined
    publish()
    if (previous) await previous.close()
  }
  const error = (message: string) => options.emit({ type: 'error', message })
  const receive = async (connection: Connection, version: number) => {
    const id = peerId(connection),
      budget = roomBudget(40)
    const entry = { connection, receivedAt: Date.now(), sequence: -1 }
    peers.set(id, entry)
    pending.delete(connection)
    connection.setMaxConcurrentBiStreams(0n)
    connection.setMaxConcurrentUniStreams(0n)
    publish()
    try {
      while (active(version)) {
        const bytes = await connection.readDatagram()
        if (!active(version)) break
        budget()
        const frame = decodeRoomFrame(bytes)
        entry.receivedAt = Date.now()
        if (frame.sequence <= entry.sequence) continue
        entry.sequence = frame.sequence
        if (!frame.heartbeat) options.emit({ type: 'message', peer: id, data: frame.data })
      }
    } catch {
      if (active(version) && state?.role === 'guest')
        error('The host disconnected. Start or join a new room.')
    } finally {
      connection.close(0n, [])
      if (peers.get(id) === entry) peers.delete(id)
      if (active(version)) {
        if (state?.role === 'guest') await close()
        else publish()
      }
    }
  }
  const accept = async (current: Endpoint, version: number) => {
    while (active(version)) {
      const incomingConnection = await current.acceptNext()
      if (!incomingConnection) return
      try {
        admitBudget()
      } catch {
        await incomingConnection.refuse()
        continue
      }
      if (!active(version) || incoming >= 4) {
        await incomingConnection.refuse()
        continue
      }
      incoming++
      let abandoned = false
      void (async () => {
        let connection: Connection | undefined
        let admittedId: string | undefined
        try {
          connection = await timeout(
            (async () => {
              const value = await (await incomingConnection.accept()).connect()
              if (!active(version) || abandoned) {
                value.close(1n, [])
                throw new Error('Room closed.')
              }
              pending.add(value)
              return value
            })(),
            5000,
            () => {
              abandoned = true
            }
          )
          if (abandoned || !active(version)) throw new Error('Room closed.')
          const currentConnection = connection
          connection.setReceiveWindow(8192n)
          connection.setMaxConcurrentUniStreams(0n)
          connection.setMaxConcurrentBiStreams(1n)
          await timeout(
            (async () => {
              const stream = await currentConnection.acceptBi()
              const raw = JSON.parse(
                Buffer.from(await stream.recv.readToEnd(8192)).toString()
              ) as unknown
              if (!invitation || !active(version)) throw new Error('Room closed.')
              authorizeRoomJoin(raw, invitation)
              const id = peerId(currentConnection)
              if (peers.has(id) || admitting.has(id)) throw new Error('Already in this room.')
              if (peers.size + admitting.size >= ROOM_PEER_LIMIT)
                throw new Error('This room is full.')
              admittedId = id
              admitting.add(id)
              await stream.send.writeAll(Array.from(Buffer.from('{"ok":true}')))
              await stream.send.finish()
            })(),
            5000,
            () => currentConnection.close(1n, [])
          )
          if (!active(version)) throw new Error('Room closed.')
          void receive(connection, version)
          connection = undefined
        } catch {
          // Unauthenticated failures never become guest-controlled text in the trusted UI.
        } finally {
          if (connection) {
            pending.delete(connection)
            connection.close(1n, [])
          }
          if (admittedId && active(version)) admitting.delete(admittedId)
          incoming--
        }
      })()
    }
  }
  const send = (data: RoomValue) => {
    if (!state || !options.active()) throw new Error('Join a room before sending updates.')
    sendBudget()
    const bytes = encodeRoomFrame(++sequence, data)
    for (const { connection } of peers.values()) connection.sendDatagram(bytes)
  }
  const request = async (request: RoomRequest): Promise<RoomState | null> => {
    if (request.operation === 'leave') {
      await close()
      return null
    }
    if (busy || state) throw new Error('Leave the current room before starting another.')
    busy = true
    const version = generation
    const requestedAt = Date.now()
    let abandoned = false
    try {
      const invited =
        request.operation === 'join'
          ? decodeRoomInvitation(request.invitation, options.application)
          : undefined
      const addr = invited ? EndpointTicket.fromString(invited.ticket).endpointAddr() : undefined
      // A capability cannot redirect native networking through an attacker-controlled relay.
      if (addr?.relayUrl() && !RelayMode.defaultMode().relayMap().urls().includes(addr.relayUrl()!))
        throw new Error('This room uses an unsupported relay.')
      if (addr && addr.directAddresses().length > 8) throw new Error('Too many peer addresses.')
      if (!(await options.confirm(invited ? 'guest' : 'host'))) return null
      if (Date.now() - requestedAt > 90_000)
        throw new Error('This permission request expired. Try again.')
      if (!active(version)) throw new Error('Extension closed before permission was granted.')
      options.emit({
        type: 'status',
        message: invited ? 'Connecting to the host…' : 'Starting your room…'
      })
      const builder = Endpoint.builder()
      builder.applyMinimal()
      builder.alpns([ROOM_ALPN])
      builder.bindAddr('0.0.0.0:0')
      builder.relayMode(options.nearbyOnly ? RelayMode.disabled() : RelayMode.defaultMode())
      const current = await builder.bind()
      if (!active(version)) {
        await current.close()
        throw new Error('Extension closed.')
      }
      endpoint = current
      // Give address discovery time without promising that a relay is reachable.
      if (!options.nearbyOnly) await timeout(current.online(), 2500, () => {}).catch(() => {})
      if (!active(version)) throw new Error('Extension closed.')
      const self = Buffer.from(current.id().toBytes()).toString('hex')
      if (invited && addr) {
        const connection = await timeout(
          current.connect(addr, ROOM_ALPN).then((value) => {
            if (!active(version) || abandoned) {
              value.close(1n, [])
              throw new Error('Join cancelled.')
            }
            pending.add(value)
            return value
          }),
          12_000,
          () => {
            abandoned = true
          }
        )
        connection.setMaxConcurrentUniStreams(0n)
        connection.setReceiveWindow(8192n)
        await timeout(
          (async () => {
            const stream = await connection.openBi()
            await stream.send.writeAll(Array.from(Buffer.from(JSON.stringify(invited))))
            await stream.send.finish()
            const response = Buffer.from(await stream.recv.readToEnd(128)).toString()
            if (response !== '{"ok":true}')
              throw new Error('The room did not approve this connection.')
          })(),
          5000,
          () => connection.close(1n, [])
        )
        if (!active(version)) throw new Error('Join cancelled.')
        state = {
          id: invited.room,
          self,
          host: peerId(connection),
          role: 'guest',
          invitation: null,
          expiresAt: invited.expiresAt,
          relayAvailable: !!addr.relayUrl(),
          peers: []
        }
        void receive(connection, version)
      } else {
        const localPort = current
          .boundSockets()
          .find((address) => address.startsWith('0.0.0.0:'))
          ?.split(':')
          .at(-1)
        const discovered = current.addr()
        const advertised = new EndpointAddr(
          current.id(),
          discovered.relayUrl(),
          [
            ...new Set([
              ...discovered.directAddresses(),
              ...(localPort ? [`127.0.0.1:${localPort}`] : [])
            ])
          ].slice(0, 8)
        )
        invitation = {
          version: 1,
          room: randomBytes(32).toString('hex'),
          secret: randomBytes(32).toString('hex'),
          application: options.application,
          ticket: EndpointTicket.fromAddr(advertised).toString(),
          expiresAt: Date.now() + ROOM_LIFETIME
        }
        state = {
          id: invitation.room,
          self,
          host: self,
          role: 'host',
          invitation: encodeRoomInvitation(invitation),
          expiresAt: invitation.expiresAt,
          relayAvailable: !!advertised.relayUrl(),
          peers: []
        }
        void accept(current, version).catch(() => {
          if (active(version)) {
            error('Room transport stopped.')
            void close()
          }
        })
      }
      timer = setInterval(() => {
        if (!state || !active(version)) return
        if (Date.now() >= state.expiresAt) {
          error('This room expired. Start a new room.')
          void close()
          return
        }
        const heartbeat = encodeRoomFrame(++sequence, null, true)
        for (const { connection, receivedAt } of peers.values()) {
          if (Date.now() - receivedAt > 10_000) connection.close(1n, [])
          else {
            try {
              connection.sendDatagram(heartbeat)
            } catch {
              connection.close(1n, [])
            }
          }
        }
        publish()
      }, 1000)
      publish()
      return snapshot()
    } catch (cause) {
      await close()
      throw cause
    } finally {
      busy = false
    }
  }
  return { request, send, close }
}
