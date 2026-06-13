import { dmChannelId } from '@xnetjs/comms'
import { describe, expect, it } from 'vitest'
import { hasMutualWave, isFirstContact } from './first-contact'

const me = 'did:key:me'
const them = 'did:key:them'

describe('first-contact gating', () => {
  it('detects a mutual wave only when both sides waved', () => {
    expect(hasMutualWave([{ fromDid: me, toDid: them }], me, them)).toBe(false)
    expect(
      hasMutualWave(
        [
          { fromDid: me, toDid: them },
          { fromDid: them, toDid: me }
        ],
        me,
        them
      )
    ).toBe(true)
  })

  it('is first-contact with no channel and no mutual wave', () => {
    expect(isFirstContact({ me, them, waves: [], knownChannelIds: new Set() })).toBe(true)
  })

  it('is not first-contact when a DM channel already exists', () => {
    const known = new Set([dmChannelId([me, them])])
    expect(isFirstContact({ me, them, waves: [], knownChannelIds: known })).toBe(false)
  })

  it('is not first-contact after a mutual wave', () => {
    const waves = [
      { fromDid: me, toDid: them },
      { fromDid: them, toDid: me }
    ]
    expect(isFirstContact({ me, them, waves, knownChannelIds: new Set() })).toBe(false)
  })

  it('is never first-contact with yourself', () => {
    expect(isFirstContact({ me, them: me, waves: [], knownChannelIds: new Set() })).toBe(false)
  })
})
