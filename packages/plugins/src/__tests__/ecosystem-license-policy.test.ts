/**
 * Paid-plugin license policy (exploration 0196).
 */

import { describe, it, expect } from 'vitest'
import {
  ALLOWED_PLUGIN_LICENSES,
  DEFAULT_PLUGIN_LICENSE,
  isAllowedPluginLicense,
  pluginLicenseText
} from '../ecosystem/license-policy'

describe('isAllowedPluginLicense', () => {
  it('accepts the pre-approved set and rejects others', () => {
    for (const spdx of ALLOWED_PLUGIN_LICENSES) {
      expect(isAllowedPluginLicense(spdx)).toBe(true)
    }
    expect(isAllowedPluginLicense('Proprietary')).toBe(false)
    expect(isAllowedPluginLicense('BUSL-1.1')).toBe(false)
    expect(isAllowedPluginLicense('')).toBe(false)
  })

  it('defaults to FSL-1.1-MIT', () => {
    expect(DEFAULT_PLUGIN_LICENSE).toBe('FSL-1.1-MIT')
    expect(isAllowedPluginLicense(DEFAULT_PLUGIN_LICENSE)).toBe(true)
  })
})

describe('pluginLicenseText', () => {
  it('renders FSL-1.1-MIT with the MIT future license', () => {
    const text = pluginLicenseText('FSL-1.1-MIT', 2026, 'Acme Inc')
    expect(text).toContain('Functional Source License, Version 1.1, MIT Future License')
    expect(text).toContain('FSL-1.1-MIT')
    expect(text).toContain('Copyright 2026 Acme Inc')
    expect(text).toContain('grant you an additional license to use the Software under\nthe MIT')
  })

  it('renders FSL-1.1-Apache-2.0 with the Apache future license', () => {
    const text = pluginLicenseText('FSL-1.1-Apache-2.0', 2026, 'Acme Inc')
    expect(text).toContain('ALv2 Future License')
    expect(text).toContain('Apache License, Version 2.0')
  })

  it('renders a standard MIT license', () => {
    const text = pluginLicenseText('MIT', 2026, 'Acme Inc')
    expect(text).toContain('MIT License')
    expect(text).toContain('Copyright (c) 2026 Acme Inc')
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  })

  it('returns null for licenses with no bundled template', () => {
    expect(pluginLicenseText('Apache-2.0', 2026, 'Acme')).toBeNull()
    expect(pluginLicenseText('GPL-3.0-only', 2026, 'Acme')).toBeNull()
  })
})
