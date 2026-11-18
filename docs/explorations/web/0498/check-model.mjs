import assert from 'node:assert/strict'
import { assets, initialNodes, onlineCopies, placeReplicas, simulate, usedSpace } from './model.mjs'

let scenarioCount = 0
for (const extraSpace of [0, 40, 80, 160, 300]) {
  for (const failure of ['none', 'before', 'after']) {
    for (const friendOnline of [false, true]) {
      scenarioCount += 1
      const { nodes, transfers } = simulate({ extraSpace, failure, friendOnline })
      for (const node of nodes) {
        assert(usedSpace(node) <= node.capacity, 'Storage budget exceeded')
        assert.equal(new Set(node.copies).size, node.copies.length, 'Duplicate copy counted')
        for (const id of node.copies)
          assert(node.scopes.includes(assets.find((a) => a.id === id).scope), 'Scope violation')
      }
      for (const transfer of transfers) {
        if (failure === 'before')
          assert.notEqual(transfer.asset, 'film', 'Invented an unavailable source')
        if (transfer.tier === 'demand') {
          const beforeFailure = simulate({ extraSpace, friendOnline }).nodes
          assert(
            assets
              .filter((a) => a.scope === 'public')
              .every((a) => onlineCopies(beforeFailure, a) >= 2),
            'Demand bypassed baseline'
          )
        }
      }
    }
  }
}
const complete = simulate({ extraSpace: 300 })
assert(assets.every((a) => onlineCopies(complete.nodes, a) >= 2))
assert(
  assets.every((a) => onlineCopies(simulate({ extraSpace: 300, failure: 'after' }).nodes, a) >= 1)
)
assert.equal(onlineCopies(simulate({ failure: 'before' }).nodes, assets[0]), 0)
assert.equal(simulate({ extraSpace: 0 }).transfers.length, 0)
const malicious = initialNodes(300).map((n) =>
  n.id === 'neighbor' ? { ...n, operator: 'community' } : n
)
assert.equal(
  onlineCopies(placeReplicas(malicious).nodes, assets[1]),
  2,
  'Duplicate operators inflated redundancy'
)
assert.throws(() => simulate({ extraSpace: -1 }))
assert.throws(() => simulate({ failure: 'unknown' }))
console.log(
  `PASS: ${scenarioCount} placement scenarios plus edge checks; budgets, private scopes, copy integrity, source absence, operator diversity, and demand ordering.`
)
