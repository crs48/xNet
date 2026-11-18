// A placement model, not a network implementation. Capacities use decimal MB.
export const assets = [
  { id: 'film', name: 'A first garden film', size: 60, scope: 'public', demand: 8, fresh: true },
  { id: 'viral', name: 'The popular clip', size: 120, scope: 'public', demand: 900, fresh: false },
  { id: 'notes', name: 'Field notes', size: 40, scope: 'public', demand: 24, fresh: false },
  { id: 'animation', name: 'A tiny animation', size: 80, scope: 'public', demand: 6, fresh: true },
  { id: 'picnic', name: 'Our private picnic', size: 80, scope: 'garden', demand: 5, fresh: false }
]

export const usedSpace = (node) =>
  assets.filter((a) => node.copies.includes(a.id)).reduce((sum, a) => sum + a.size, 0)
export const holders = (nodes, asset) =>
  nodes.filter((n) => n.online && n.copies.includes(asset.id))
export const onlineCopies = (nodes, asset) =>
  new Set(holders(nodes, asset).map((n) => n.operator)).size

export function initialNodes(extraSpace = 160, friendOnline = true) {
  if (!Number.isFinite(extraSpace) || extraSpace < 0)
    throw new Error('Storage budget must be nonnegative.')
  return [
    {
      id: 'origin',
      label: 'Your origin',
      operator: 'you',
      online: true,
      capacity: 380,
      scopes: ['public', 'garden'],
      accepts: false,
      copies: assets.map((a) => a.id)
    },
    {
      id: 'mirror',
      label: 'Community mirror',
      operator: 'community',
      online: true,
      capacity: 120 + extraSpace,
      scopes: ['public'],
      accepts: true,
      copies: ['viral']
    },
    {
      id: 'neighbor',
      label: 'A new volunteer',
      operator: 'neighbor',
      online: true,
      capacity: extraSpace,
      scopes: ['public'],
      accepts: true,
      copies: []
    },
    {
      id: 'friend',
      label: 'Garden friend',
      operator: 'friend',
      online: friendOnline,
      capacity: 80 + extraSpace,
      scopes: ['garden'],
      accepts: true,
      copies: ['picnic']
    }
  ]
}

export function placeReplicas(input) {
  let nodes = input.map((node) => ({ ...node, copies: [...node.copies] }))
  const transfers = []
  const placeOne = (asset, tier) => {
    const sources = holders(nodes, asset)
    if (!sources.length) return false
    const operators = new Set(sources.map((node) => node.operator))
    const candidates = nodes
      .filter(
        (node) =>
          node.online &&
          node.accepts &&
          node.scopes.includes(asset.scope) &&
          !node.copies.includes(asset.id) &&
          !operators.has(node.operator) &&
          node.capacity - usedSpace(node) >= asset.size
      )
      .sort(
        (a, b) =>
          b.capacity - usedSpace(b) - (a.capacity - usedSpace(a)) || a.id.localeCompare(b.id)
      )
    if (!candidates.length) return false
    const target = candidates[0]
    nodes = nodes.map((node) =>
      node.id === target.id ? { ...node, copies: [...node.copies, asset.id] } : node
    )
    transfers.push({ asset: asset.id, target: target.id, size: asset.size, tier })
    return true
  }

  // A complete-copy floor precedes demand within this finite snapshot.
  // Source absence remains an incident; no scheduler can manufacture lost bytes.
  const ordered = [...assets].sort(
    (a, b) =>
      onlineCopies(nodes, a) - onlineCopies(nodes, b) ||
      Number(b.fresh) - Number(a.fresh) ||
      a.id.localeCompare(b.id)
  )
  for (const asset of ordered) {
    while (onlineCopies(nodes, asset) < 2 && placeOne(asset, 'baseline')) {}
  }
  // Demand copies use surplus public capacity only when every public floor is met.
  const publicFloorMet = assets
    .filter((a) => a.scope === 'public')
    .every((a) => onlineCopies(nodes, a) >= 2)
  if (publicFloorMet) {
    for (const asset of assets.filter((a) => a.scope === 'public' && a.demand >= 100)) {
      while (onlineCopies(nodes, asset) < 3 && placeOne(asset, 'demand')) {}
    }
  }
  return { nodes, transfers }
}

export function simulate({ extraSpace = 160, failure = 'none', friendOnline = true } = {}) {
  if (!['none', 'before', 'after'].includes(failure)) throw new Error('Unknown failure scenario.')
  let nodes = initialNodes(extraSpace, friendOnline)
  if (failure === 'before')
    nodes = nodes.map((n) => (n.id === 'origin' ? { ...n, online: false } : n))
  const placed = placeReplicas(nodes)
  if (failure !== 'after') return placed
  return {
    ...placed,
    nodes: placed.nodes.map((n) => (n.id === 'origin' ? { ...n, online: false } : n))
  }
}
