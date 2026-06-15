import { describe, expect, it } from 'vitest'
import { parseVCard, toVCard, toVCards } from './vcard'

describe('vCard round-trip', () => {
  it('serializes the fields a Contact cares about', () => {
    const card = toVCard({
      displayName: 'Maria Reyes',
      firstName: 'Maria',
      lastName: 'Reyes',
      email: 'maria@acme.com',
      phone: '+1 415 555 1234',
      org: 'Acme Inc',
      title: 'CTO',
      note: 'Met at the conference',
      birthday: '1990-04-12'
    })
    expect(card).toContain('BEGIN:VCARD')
    expect(card).toContain('FN:Maria Reyes')
    expect(card).toContain('N:Reyes;Maria;;;')
    expect(card).toContain('EMAIL;TYPE=INTERNET:maria@acme.com')
    expect(card).toContain('END:VCARD')
  })

  it('parses what it serializes', () => {
    const input = {
      displayName: 'Maria Reyes',
      firstName: 'Maria',
      lastName: 'Reyes',
      email: 'maria@acme.com',
      phone: '+14155551234',
      org: 'Acme Inc',
      title: 'CTO',
      note: 'Met at the conference',
      birthday: '1990-04-12'
    }
    const [parsed] = parseVCard(toVCard(input))
    expect(parsed).toEqual(input)
  })

  it('parses multiple cards and unfolds wrapped lines', () => {
    const doc = toVCards([
      { displayName: 'A One', email: 'a@x.com' },
      { displayName: 'B Two', email: 'b@x.com' }
    ])
    expect(parseVCard(doc)).toHaveLength(2)

    const folded = 'BEGIN:VCARD\r\nVERSION:3.0\r\nNOTE:hello \r\n world\r\nFN:Folded Name\r\nEND:VCARD'
    const [c] = parseVCard(folded)
    expect(c.displayName).toBe('Folded Name')
    expect(c.note).toBe('hello world')
  })

  it('falls back to N when FN is absent and skips empty cards', () => {
    const doc = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;Jane;;;\r\nEND:VCARD\r\nBEGIN:VCARD\r\nEND:VCARD'
    const parsed = parseVCard(doc)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].displayName).toBe('Jane Doe')
  })

  it('preserves commas/semicolons via escaping', () => {
    const [c] = parseVCard(toVCard({ displayName: 'Smith, John', note: 'a; b, c' }))
    expect(c.displayName).toBe('Smith, John')
    expect(c.note).toBe('a; b, c')
  })
})
