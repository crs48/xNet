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

// Notify
export {
  type InboxItem,
  type NotificationReason,
  type NotifierContext,
  type NotifierEvent
} from './notify/types'
export { evaluateChange } from './notify/rules'
export {
  MAX_ACKED_MENTIONS,
  channelTier,
  deriveBadges,
  isInDnd,
  isItemOpen,
  isPastWatermark,
  isSnoozed,
  isUnread,
  shouldAlert,
  unreadCount,
  withAckedMention,
  withTriage,
  withWatermark,
  type BadgeCounts,
  type InboxStateData
} from './notify/inbox'
export { MAX_INBOX_ITEMS, createNotifier, type Notifier } from './notify/notifier'

// Calls
export {
  MESH_MAX_AUDIO_PARTICIPANTS,
  MESH_MAX_VIDEO_PARTICIPANTS,
  meshCapacity,
  type CallPeerSnapshot,
  type CallSelf,
  type CallSignal,
  type CallStatus,
  type MediaFlags,
  type PeerConnectionLike,
  type SignalingTransport
} from './calls/types'
export {
  callTopic,
  createLoopbackBus,
  createWebSocketSignaling,
  type LoopbackBus,
  type WebSocketSignalingOptions
} from './calls/signaling'
export { createCallManager, type CallManager, type CallManagerOptions } from './calls/call-manager'

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
  setMessageLinkPreviews,
  type ChatStore,
  type CreateChannelInput,
  type SendMessageInput
} from './chat/chat-service'
