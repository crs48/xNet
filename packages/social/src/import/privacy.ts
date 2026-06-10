/**
 * Privacy classification for social archive entries.
 */

import type { SocialPrivacyClass, SocialVisibility } from '../schemas/constants'

const accountSecurityPatterns = [
  /auth/i,
  /api[_-]?key/i,
  /session/i,
  /security/i,
  /login/i,
  /password/i,
  /device_information/i,
  /possible_emails/i,
  /payment/i,
  /checkout/i
]

const billingPatterns = [/billing/i, /invoice/i, /payment_quote/i, /subscription/i]
const adsPatterns = [/ads?_information/i, /advertiser/i, /ad_preferences/i, /topics/i]
const messagePatterns = [/messages\//i, /direct/i, /conversation/i, /prod-grok-backend\.json/i]

export function classifySocialEntryPrivacy(path: string): SocialPrivacyClass {
  if (billingPatterns.some((pattern) => pattern.test(path))) return 'billing'
  if (accountSecurityPatterns.some((pattern) => pattern.test(path))) return 'account-security'
  if (adsPatterns.some((pattern) => pattern.test(path))) return 'ads'
  if (messagePatterns.some((pattern) => pattern.test(path))) return 'third-party-private'
  return 'public'
}

export function isSensitivePrivacyClass(privacyClass: SocialPrivacyClass): boolean {
  return (
    privacyClass === 'private' ||
    privacyClass === 'third-party-private' ||
    privacyClass === 'account-security' ||
    privacyClass === 'billing'
  )
}

export function getPrivacyVisibility(privacyClass: SocialPrivacyClass): SocialVisibility {
  return privacyClass === 'public' ? 'private' : 'private'
}

export function getBucketDefaultSelected(privacyClass: SocialPrivacyClass): boolean {
  return privacyClass === 'public'
}
