import { describe, expect, it } from 'vitest'
import { uaFamilyOnly } from './ua-family'

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0'

describe('uaFamilyOnly', () => {
  it('reduces a full UA string to coarse browser + OS family', () => {
    expect(uaFamilyOnly(CHROME_MAC)).toBe('Chrome 137 / macOS')
    expect(uaFamilyOnly(FIREFOX_LINUX)).toBe('Firefox 139 / Linux')
    expect(uaFamilyOnly(SAFARI_IOS)).toBe('Safari 18 / iOS')
    expect(uaFamilyOnly(EDGE_WIN)).toBe('Edge 137 / Windows')
  })

  it('never echoes the input on unknown agents', () => {
    expect(uaFamilyOnly('SomeBot/9.9 (Contraption 3000)')).toBe('Unknown / Unknown')
  })
})
