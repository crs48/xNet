/**
 * @xnetjs/comms — Real-time communications for xNet.
 *
 * Layers (explorations 0167/0168):
 * - presence/: the Room primitive over Yjs Awareness (rosters, typing, calls)
 * - chat/:     channels, DMs, and messages as signed nodes
 * - notify/:   the local-first notifier (rules over the change log) + inbox
 * - calls/:    WebRTC mesh calls signaled over hub pub/sub topics
 */

// Presence
export {
  workspacePresenceRoomId,
  type AwarenessLike,
  type CallPresence,
  type PeerPresence,
  type PresenceStatus,
  type RoomPresence,
  type RoomProvider,
  type TypingPresence,
  type UserCard
} from './presence/types'
export { peersInCall, presentDids, remotePeers, rosterUsers, typingPeers } from './presence/helpers'
export {
  createRoomManager,
  TYPING_TTL_MS,
  type RoomManager,
  type RoomSession
} from './presence/room-manager'

// Chat
export { DM_ID_PREFIX, dmChannelId, dmMembers, isDmChannelId } from './chat/dm'
export {
  channelHistoryQuery,
  compareMessages,
  createChannel,
  editMessage,
  ensureDmChannel,
  redactMessage,
  sendMessage,
  type ChatStore,
  type CreateChannelInput,
  type SendMessageInput
} from './chat/chat-service'
