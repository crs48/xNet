export const stages = [
  'Open a link',
  'Use your identity',
  'Join the conversation',
  'Take it with you',
  'Help keep it available',
  'Create and publish',
  'Find your next thing',
  'Stay in control'
]

export const initialState = () => ({
  step: 0,
  device: 'web',
  policy: 'open',
  entry: 'public',
  provider: 'Bluesky',
  account: false,
  verified: false,
  providerDown: false,
  liked: false,
  followed: false,
  saved: false,
  comment: '',
  comments: [],
  consent: false,
  charging: true,
  unmetered: true,
  foreground: true,
  paused: false,
  capacity: 10,
  traffic: 10,
  audience: 'public',
  upload: 'draft',
  origin: true,
  backup: true,
  scope: 'local',
  query: '',
  funding: 'donations',
  plan: false,
  indexOnline: true,
  ranking: 'newest'
})

export function hosting(state) {
  if (!state.account) return { active: false, reason: 'Join before enrolling this device.' }
  if (!state.consent) return { active: false, reason: 'Off. Hosting is a separate choice.' }
  if (state.device === 'web')
    return { active: false, reason: 'Web viewer. Persistent hosting needs a native device.' }
  if (state.paused)
    return { active: false, reason: 'Paused by you. Stored copies can remain on disk.' }
  if (state.capacity <= 0 || state.traffic <= 0)
    return { active: false, reason: 'Paused: the storage or transfer budget is zero.' }
  if (!state.charging) return { active: false, reason: 'Paused to protect the battery.' }
  if (!state.unmetered)
    return { active: false, reason: 'Paused on a metered or unapproved network.' }
  if (state.device === 'phone' && !state.foreground)
    return { active: false, reason: 'Phone is in the background. No always-on peer service.' }
  return {
    active: true,
    reason:
      state.device === 'phone'
        ? 'Could assist while open and charging. A later mobile experiment.'
        : 'Eligible to help while this computer is running within your limits.'
  }
}

export function access(state) {
  if (state.entry === 'private' && !(state.account && state.verified))
    return {
      allowed: false,
      reason: 'Private invitation. Sign in and verify this device before reading.'
    }
  if (state.policy === 'required' && !hosting(state).active)
    return {
      allowed: false,
      reason: 'Strict-policy comparison: viewing is blocked until this device can seed.'
    }
  return {
    allowed: true,
    reason:
      state.entry === 'public'
        ? 'Public content can be viewed through HTTPS.'
        : 'This verified device can read its permitted private content.'
  }
}

export function publishBlock(state) {
  if (!state.account) return 'Sign in before publishing.'
  if (state.policy === 'required' && !hosting(state).active)
    return 'The strict policy would require eligible hosting first.'
  if (state.audience === 'private' && !state.verified)
    return 'Verify this device before preparing an encrypted attachment.'
  if (state.upload !== 'draft' && !state.origin)
    return 'The origin is offline. Keep the draft and retry later.'
  if (state.upload === 'stored' && !state.backup)
    return 'The retention policy is not confirmed. Do not claim durable publication.'
  if (state.upload === 'published' && state.audience === 'public' && !state.indexOnline)
    return 'Published, but the public index is unavailable. Index visibility is still pending.'
  return null
}

export function advanceUpload(state) {
  const blocked = publishBlock(state)
  if (blocked) return { state, blocked }
  const next = {
    draft: 'prepared',
    prepared: 'stored',
    stored: 'published',
    published: state.audience === 'public' ? 'indexed' : 'delivered'
  }
  return { state: { ...state, upload: next[state.upload] ?? state.upload }, blocked: null }
}

export const catalog = [
  {
    id: 'rain',
    title: 'A garden after the rain',
    text: 'A short film about the garden.',
    visibility: 'public',
    local: true,
    community: true,
    date: 6,
    reason: 'A community you chose',
    author: 'Maya'
  },
  {
    id: 'plans',
    title: 'Garden picnic plans',
    text: 'Your group conversation and shared album.',
    visibility: 'private',
    local: true,
    community: true,
    date: 7,
    reason: 'A group this device can decrypt',
    author: 'Garden group'
  },
  {
    id: 'forest',
    title: 'A tiny forest, made by hand',
    text: 'A new stop-motion film from a small garden studio.',
    visibility: 'public',
    local: false,
    community: true,
    date: 8,
    reason: 'New work from a creator you have not seen',
    author: 'Jules'
  },
  {
    id: 'repair',
    title: 'A bicycle gets another summer',
    text: 'A community repair workshop.',
    visibility: 'public',
    local: false,
    community: false,
    date: 5,
    reason: 'A public topic you selected: making things',
    author: 'Repair club'
  },
  {
    id: 'seeds',
    title: 'The seed library',
    text: 'Sharing garden seeds with the neighborhood.',
    visibility: 'public',
    local: false,
    community: false,
    date: 9,
    reason: 'A wider public catalog',
    author: 'Seed library'
  }
]

export function search(state) {
  if (!['local', 'community', 'wider'].includes(state.scope))
    throw new Error('Unknown search scope')
  if (state.scope !== 'local' && state.policy === 'required' && !hosting(state).active)
    return {
      status: 'participation',
      results: [],
      note: 'The strict policy blocks remote discovery while this device cannot seed. Your local index remains yours.'
    }
  if (state.scope !== 'local' && !state.indexOnline)
    return {
      status: 'offline',
      results: [],
      note: 'The selected public index is unavailable. This is not a zero-result search.'
    }
  if (state.scope === 'wider' && state.funding === 'paid' && !state.plan)
    return {
      status: 'subscription',
      results: [],
      note: 'Wider search needs this provider’s subscription. Your local index and direct links still work.'
    }
  const needle = state.query.trim().toLowerCase()
  const results = catalog
    .filter((item) => {
      if (
        item.visibility === 'private' &&
        (!(state.account && state.verified) || state.scope === 'wider')
      )
        return false
      if (state.scope === 'local' && !item.local) return false
      if (state.scope === 'community' && !item.community) return false
      return `${item.title} ${item.text}`.toLowerCase().includes(needle)
    })
    .sort((a, b) =>
      state.ranking === 'discover'
        ? Number(b.id === 'forest') - Number(a.id === 'forest') || b.date - a.date
        : b.date - a.date
    )
  return {
    status: 'ready',
    results,
    note:
      state.scope === 'local'
        ? 'Only this device’s indexed items. Private matches need this device’s keys.'
        : state.scope === 'community'
          ? 'Chosen public community catalogs plus permitted items already indexed locally. Coverage is partial.'
          : 'Public-only results from the selected provider. This is never a complete index of every device.'
  }
}
