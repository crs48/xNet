// A deliberately small policy simulation, not production moderation or cryptography.
export const scenarios = {
  opinion: {
    title: 'An unpopular opinion',
    category: 'Ordinary disagreement',
    text: 'I think every city should make its main street car-free.',
    sensitive: false
  },
  spoiler: {
    title: 'A film spoiler',
    category: 'Spoilers',
    text: 'A fictional plot detail you would rather discover yourself.',
    sensitive: true
  },
  news: {
    title: 'Graphic documentary footage',
    category: 'Graphic news',
    text: 'A placeholder for contextual reporting. No graphic media is included.',
    sensitive: true
  },
  art: {
    title: 'Adult art',
    category: 'Adult content',
    text: 'A placeholder for a lawful adult work. No adult media is included.',
    sensitive: true,
    adultsOnly: true
  },
  harassment: {
    title: 'Repeated unwanted contact',
    category: 'Contact abuse',
    text: 'A fictional sender keeps addressing you after you ask them to stop.',
    sensitive: false
  },
  prohibited: {
    title: 'A confirmed operator violation',
    category: 'Operator restriction',
    text: 'A fictional case already reviewed under this operator’s serious-abuse rules. No harmful content is included.',
    sensitive: false,
    removed: true
  },
  unknown: {
    title: 'An unclassified upload',
    category: 'No assessment',
    text: 'There is no trusted assessment of this fictional upload.',
    sensitive: false,
    unknown: true
  }
}

export const defaults = {
  scenario: 'news',
  preference: 'warn',
  audience: 'adult',
  surface: 'public',
  label: 'trusted',
  communityRestricted: false,
  member: true,
  blockContact: false,
  hosting: 'unapproved'
}

export function evaluatePolicy(input) {
  const state = { ...defaults, ...input }
  const item = scenarios[state.scenario]
  if (!Object.hasOwn(scenarios, state.scenario)) throw new Error('Unknown scenario')
  for (const [key, values] of Object.entries({
    preference: ['show', 'warn', 'hide'],
    audience: ['adult', 'teen'],
    surface: ['public', 'private'],
    label: ['trusted', 'untrusted', 'expired'],
    hosting: ['approved', 'declined', 'unapproved']
  }))
    if (!values.includes(state[key])) throw new Error(`Invalid ${key}`)
  for (const key of ['communityRestricted', 'member', 'blockContact']) {
    if (typeof state[key] !== 'boolean') throw new Error(`Invalid ${key}`)
  }
  const privateRoom = state.surface === 'private'
  const excluded = privateRoom && (!state.member || state.communityRestricted)
  const youthRestriction = item.adultsOnly && state.audience === 'teen'
  const labelApplies = state.label === 'trusted' && item.sensitive
  let display = {
    value: 'Visible',
    reason: item.unknown
      ? 'No assessment is available. Visible is not a safety certification.'
      : 'No applicable display restriction.',
    authority: 'Your preferences'
  }
  if (labelApplies)
    display = {
      value: { show: 'Visible', warn: 'Warning first', hide: 'Hidden from you' }[state.preference],
      reason: `${item.category}: your chosen treatment of this optional label.`,
      authority: 'Your preferences · selected labeler'
    }
  // A personal hide always works, including for unlabelled ordinary disagreement.
  if (state.preference === 'hide')
    display = {
      value: 'Hidden from you',
      reason: 'Your personal choice does not remove other people’s access.',
      authority: 'Your preferences'
    }
  if (excluded)
    display = {
      value: 'Unavailable here',
      reason: state.member
        ? 'This contribution is restricted in this room.'
        : 'You are not a member of this private room.',
      authority: 'Room authority'
    }
  if (youthRestriction)
    display = {
      value: 'Age restricted',
      reason:
        'This fixture includes a known adult classification. Optional label settings cannot override the youth policy.',
      authority: 'Account age policy'
    }
  if (item.removed)
    display = {
      value: 'Unavailable here',
      reason:
        'This operator has restricted the item. A personal “show” preference cannot restore it.',
      authority: 'Service operator'
    }

  const community = {
    value: item.removed
      ? 'Restricted by operator'
      : state.communityRestricted
        ? 'Removed from this room'
        : 'Accepted by this room',
    reason: item.removed
      ? 'This operator restricts the item across its own participating services.'
      : 'A room rule affects this room; it is not a network-wide ban.',
    authority: item.removed ? 'Service operator' : 'Room moderators'
  }
  let contact = {
    value: 'Request allowed',
    reason:
      'No block is set in this simulation. Abuse reports do not automatically establish a finding.',
    authority: 'Recipient'
  }
  if (state.blockContact)
    contact = {
      value: 'Contact blocked',
      reason:
        'This account cannot contact you through this route; public content is not made private.',
      authority: 'Recipient'
    }
  if (privateRoom && !state.member)
    contact = {
      value: 'Membership required',
      reason: 'Private-room participation needs an invitation or approved membership.',
      authority: 'Room authority'
    }
  const index = {
    value: privateRoom
      ? 'Never publicly indexed'
      : item.removed
        ? 'Omitted by this registry'
        : 'Eligible for public listing',
    reason: privateRoom
      ? 'Private content does not enter the public catalog.'
      : 'Other registries make their own decisions. Listing does not promise recommendation.',
    authority: 'Registry operator'
  }
  let hosting = {
    value: 'Ask before retaining',
    reason:
      'No hosting permission is present. Viewing and liking are not consent to persistent seeding.',
    authority: 'Device owner'
  }
  if (state.hosting === 'approved')
    hosting = {
      value: 'Approved to seed',
      reason:
        'Explicit approval for this fictional item. Your feed preference remains independent.',
      authority: 'Device owner'
    }
  if (state.hosting === 'declined')
    hosting = {
      value: 'Do not seed',
      reason: 'Your device declines this item. This does not delete the original.',
      authority: 'Device owner'
    }
  if (excluded || youthRestriction || item.removed)
    hosting = {
      value: 'Serving denied',
      reason: 'The relevant access or operator rule takes precedence over a retention preference.',
      authority: excluded
        ? 'Room authority'
        : youthRestriction
          ? 'Account age policy'
          : 'Service operator'
    }
  const review = item.removed
    ? 'Appeal to this service operator. Your preference cannot overturn its decision.'
    : youthRestriction
      ? 'Ask the account service to review a mistaken classification. Adult-content access is not a personal override for teen accounts.'
      : excluded
        ? 'Ask the room authority about access or appeal its room decision.'
        : 'Change your preferences; challenge an optional label with its issuer. Separate restrictions need separate appeals.'
  const labelStatus = !item.sensitive
    ? 'No optional content label applies to this example'
    : state.label === 'trusted'
      ? 'Selected labeler · current assertion'
      : state.label === 'expired'
        ? 'Expired optional assertion · not applied'
        : 'Unselected issuer · not applied'
  return { item, display, community, contact, index, hosting, review, labelStatus }
}

export const fictionalMessages = [
  { id: 'm1', author: 'Mira', time: '10:02', text: 'Can we keep feedback about the game, please?' },
  { id: 'm2', author: 'Rowan', time: '10:03', text: 'I will keep messaging you until you answer.' },
  { id: 'm3', author: 'Mira', time: '10:04', text: 'Please stop contacting me.' }
]

export function previewReport(ids, recipient) {
  const recipients = { community: 'Room moderators', operator: 'Service operator' }
  if (!Object.hasOwn(recipients, recipient)) throw new Error('Choose a valid report recipient')
  const selected = new Set(ids)
  if ([...selected].some((id) => !fictionalMessages.some((message) => message.id === id)))
    throw new Error('Unknown evidence selection')
  return {
    recipient: recipients[recipient],
    messages: fictionalMessages
      .filter((message) => selected.has(message.id))
      .map((message) => ({ ...message })),
    attachments: [],
    disclosure:
      'Selected message text, authors and displayed times only. No other messages, attachments, member list or decryption keys.',
    warning:
      'These excerpts can identify participants and may lack context. This is a local simulation; nothing is sent.'
  }
}

export function simulateReport(ids, recipient, consent) {
  const preview = previewReport(ids, recipient)
  if (preview.messages.length === 0) throw new Error('Select at least one message')
  if (consent !== true) throw new Error('Confirm the exact evidence and recipient first')
  return { ...preview, status: 'Simulation complete — no report sent' }
}
