import assert from 'node:assert/strict'
import { defaults, evaluatePolicy, previewReport, simulateReport, scenarios } from './model.mjs'

const cases = [
  [
    'personal hide is not a registry removal',
    () => {
      const decision = evaluatePolicy({ scenario: 'opinion', preference: 'hide' })
      assert.equal(decision.display.value, 'Hidden from you')
      assert.equal(decision.index.value, 'Eligible for public listing')
    }
  ],
  [
    'personal show cannot bypass operator decisions',
    () => {
      for (const label of ['trusted', 'untrusted', 'expired']) {
        const decision = evaluatePolicy({
          scenario: 'prohibited',
          preference: 'show',
          hosting: 'approved',
          label
        })
        assert.equal(decision.display.value, 'Unavailable here')
        assert.equal(decision.hosting.value, 'Serving denied')
        assert.equal(decision.index.value, 'Omitted by this registry')
      }
    }
  ],
  [
    'private rooms never enter public discovery',
    () => {
      for (const scenario of Object.keys(scenarios))
        assert.equal(
          evaluatePolicy({ surface: 'private', scenario }).index.value,
          'Never publicly indexed'
        )
    }
  ],
  [
    'membership gates display and serving',
    () => {
      const decision = evaluatePolicy({ surface: 'private', member: false, hosting: 'approved' })
      assert.equal(decision.display.value, 'Unavailable here')
      assert.equal(decision.hosting.value, 'Serving denied')
      assert.equal(decision.contact.value, 'Membership required')
    }
  ],
  [
    'room action does not remove public source',
    () => {
      const decision = evaluatePolicy({ communityRestricted: true })
      assert.equal(decision.community.value, 'Removed from this room')
      assert.equal(decision.index.value, 'Eligible for public listing')
    }
  ],
  [
    'age policy is not an optional label',
    () => {
      const decision = evaluatePolicy({
        scenario: 'art',
        audience: 'teen',
        label: 'untrusted',
        preference: 'show',
        hosting: 'approved'
      })
      assert.equal(decision.display.value, 'Age restricted')
      assert.equal(decision.hosting.value, 'Serving denied')
    }
  ],
  [
    'unselected or expired optional assertions do not hide',
    () => {
      for (const label of ['untrusted', 'expired'])
        assert.equal(
          evaluatePolicy({ scenario: 'news', preference: 'warn', label }).display.value,
          'Visible'
        )
    }
  ],
  [
    'hiding does not revoke an explicit hosting choice',
    () =>
      assert.equal(
        evaluatePolicy({ preference: 'hide', hosting: 'approved' }).hosting.value,
        'Approved to seed'
      )
  ],
  [
    'viewing does not grant hosting permission',
    () => assert.equal(evaluatePolicy({ preference: 'show' }).hosting.value, 'Ask before retaining')
  ],
  [
    'unknown does not mean safety certified',
    () => {
      const decision = evaluatePolicy({ scenario: 'unknown' })
      assert.match(decision.display.reason, /not a safety certification/)
      assert.equal(decision.hosting.value, 'Ask before retaining')
    }
  ],
  [
    'blocking contact does not make public posts private',
    () => {
      const decision = evaluatePolicy({ blockContact: true, scenario: 'opinion' })
      assert.equal(decision.contact.value, 'Contact blocked')
      assert.equal(decision.display.value, 'Visible')
    }
  ],
  [
    'invalid policy states fail explicitly',
    () => {
      assert.throws(() => evaluatePolicy({ scenario: 'missing' }), /Unknown/)
      assert.throws(() => evaluatePolicy({ audience: 'child-ish' }), /Invalid/)
      assert.throws(() => evaluatePolicy({ member: 'false' }), /Invalid/)
    }
  ],
  [
    'private report contains only selected messages',
    () => {
      const report = previewReport(['m2', 'm2'], 'community')
      assert.deepEqual(
        report.messages.map((message) => message.id),
        ['m2']
      )
      assert.equal(report.recipient, 'Room moderators')
      assert.deepEqual(report.attachments, [])
      assert.throws(() => previewReport(['made-up'], 'community'), /Unknown/)
      assert.throws(() => previewReport(['m2'], 'public-feed'), /valid/)
    }
  ],
  [
    'simulated disclosure requires evidence and explicit consent',
    () => {
      assert.throws(() => simulateReport([], 'operator', true), /Select/)
      assert.throws(() => simulateReport(['m2'], 'operator', false), /Confirm/)
      assert.equal(
        simulateReport(['m2'], 'operator', true).status,
        'Simulation complete — no report sent'
      )
    }
  ]
]
for (const [name, check] of cases) {
  check()
  console.log(`PASS ${name}`)
}
assert.deepEqual(defaults, {
  scenario: 'news',
  preference: 'warn',
  audience: 'adult',
  surface: 'public',
  label: 'trusted',
  communityRestricted: false,
  member: true,
  blockContact: false,
  hosting: 'unapproved'
})
console.log(
  `${cases.length} policy and disclosure checks passed. This is not a network security test.`
)
