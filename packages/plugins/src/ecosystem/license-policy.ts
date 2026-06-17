/**
 * @xnetjs/plugins — paid-plugin license policy (exploration 0196).
 *
 * The marketplace pre-approves a small, fixed set of licenses so a paid plugin
 * needs no per-listing legal review. The default is **FSL-1.1-MIT** — source-
 * available, forbids only a competing marketplace, and auto-converts to MIT two
 * years after each version ships (mirrors `@xnetjs/cloud`'s FSL). Plain OSI
 * licenses are allowed too. This module is the single source of truth for the
 * allowed set and for generating the `LICENSE` file the scaffolder emits;
 * `scripts/check-plugin-licenses.sh` enforces the same set in CI.
 */

/** SPDX ids a paid plugin may declare. */
export const ALLOWED_PLUGIN_LICENSES = [
  'FSL-1.1-MIT',
  'FSL-1.1-Apache-2.0',
  'MIT',
  'Apache-2.0',
  'AGPL-3.0-only'
] as const

export type AllowedPluginLicense = (typeof ALLOWED_PLUGIN_LICENSES)[number]

/** The default license suggested by the scaffolder for a new plugin. */
export const DEFAULT_PLUGIN_LICENSE: AllowedPluginLicense = 'FSL-1.1-MIT'

/** True if `spdx` is one of the marketplace-approved licenses. */
export function isAllowedPluginLicense(spdx: string): spdx is AllowedPluginLicense {
  return (ALLOWED_PLUGIN_LICENSES as readonly string[]).includes(spdx)
}

/** The "future license" an FSL variant converts to, or null for non-FSL. */
function fslFutureLicense(spdx: string): 'MIT' | 'Apache License, Version 2.0' | null {
  if (spdx === 'FSL-1.1-MIT') return 'MIT'
  if (spdx === 'FSL-1.1-Apache-2.0') return 'Apache License, Version 2.0'
  return null
}

function mitLicenseText(year: number, holder: string): string {
  return `MIT License

Copyright (c) ${year} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`
}

function fslLicenseText(spdx: string, future: string, year: number, holder: string): string {
  const abbrev = spdx === 'FSL-1.1-MIT' ? 'FSL-1.1-MIT' : 'FSL-1.1-ALv2'
  const heading =
    spdx === 'FSL-1.1-MIT'
      ? 'Functional Source License, Version 1.1, MIT Future License'
      : 'Functional Source License, Version 1.1, ALv2 Future License'
  return `# ${heading}

## Abbreviation

${abbrev}

## Notice

Copyright ${year} ${holder}

## Terms and Conditions

### Licensor ("We")

The party offering the Software under these Terms and Conditions.

### The Software

The "Software" is each version of the software that we make available under
these Terms and Conditions, as indicated by our inclusion of these Terms and
Conditions with the Software.

### License Grant

Subject to your compliance with this License Grant and the Patents,
Redistribution and Trademark clauses below, we hereby grant you the right to
use, copy, modify, create derivative works, publicly perform, publicly display
and redistribute the Software for any Permitted Purpose identified below.

### Permitted Purpose

A Permitted Purpose is any purpose other than a Competing Use. A Competing Use
means making the Software available to others in a commercial product or
service that:

1. substitutes for the Software;

2. substitutes for any other product or service we offer using the Software
   that exists as of the date we make the Software available; or

3. offers the same or substantially similar functionality as the Software.

Permitted Purposes specifically include using the Software:

1. for your internal use and access;

2. for non-commercial education;

3. for non-commercial research; and

4. in connection with professional services that you provide to a licensee
   using the Software in accordance with these Terms and Conditions.

### Redistribution

The Terms and Conditions apply to all copies, modifications and derivatives of
the Software. If you redistribute any copies, modifications or derivatives of
the Software, you must include a copy of or a link to these Terms and
Conditions and not remove any copyright notices provided in or with the
Software.

### Disclaimer

THE SOFTWARE IS PROVIDED "AS IS" AND WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF FITNESS FOR A PARTICULAR
PURPOSE, MERCHANTABILITY, TITLE OR NON-INFRINGEMENT.

## Grant of Future License

We hereby irrevocably grant you an additional license to use the Software under
the ${future} that is effective on the second anniversary of the date we make
the Software available. On or after that date, you may use the Software under
the ${future}.
`
}

/**
 * Generate the `LICENSE` file body for a plugin, or `null` for an unrecognized
 * license (the scaffolder then omits the file and the author supplies their own).
 */
export function pluginLicenseText(spdx: string, year: number, holder: string): string | null {
  const future = fslFutureLicense(spdx)
  if (future) return fslLicenseText(spdx, future, year, holder)
  if (spdx === 'MIT') return mitLicenseText(year, holder)
  return null
}
