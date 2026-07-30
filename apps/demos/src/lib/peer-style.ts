/** Stable per-DID display name + color, derived from a hash of the DID. */

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316'
]

const ANIMALS = ['Otter', 'Heron', 'Lynx', 'Newt', 'Wren', 'Mole', 'Orca', 'Fox']

function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function peerColor(did: string): string {
  return COLORS[hash(did) % COLORS.length]
}

export function peerName(did: string): string {
  return `${ANIMALS[hash(did) % ANIMALS.length]} ${did.slice(-4)}`
}
