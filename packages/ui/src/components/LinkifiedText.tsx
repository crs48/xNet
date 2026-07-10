/**
 * LinkifiedText - renders plain user text with detected URLs, email
 * addresses, and (optionally) phone numbers as clickable links (0171).
 *
 * Detection is render-time only: the stored value is never rewritten, so a
 * detection improvement or bug fix applies retroactively to all content.
 * Phone detection is opt-in because it lazy-loads libphonenumber metadata.
 */
import * as React from 'react'
import { useEffect, useMemo, useState, Fragment } from 'react'
import {
  findLinkTokens,
  mergeLinkTokens,
  segmentText,
  type LinkToken,
  type TextSegment
} from '../utils/linkify'

export interface LinkifiedTextProps {
  /** Plain text to render */
  value: string
  /** Class applied to the wrapping span */
  className?: string
  /** Class applied to each detected link */
  linkClassName?: string
  /**
   * Detect phone numbers too. Lazy-loads the phone metadata bundle on first
   * use; links appear once detection resolves.
   */
  detectPhones?: boolean
}

const DEFAULT_LINK_CLASS = 'text-blue-600 dark:text-blue-400 hover:underline'

const EMPTY_TOKENS: LinkToken[] = []

/**
 * Resolve phone tokens for a text value via the lazily-loaded detector.
 * Returns an empty list until detection resolves (or when disabled).
 */
function usePhoneTokens(value: string, enabled: boolean): LinkToken[] {
  const [tokens, setTokens] = useState<LinkToken[]>(EMPTY_TOKENS)

  useEffect(() => {
    if (!enabled || !value) {
      setTokens(EMPTY_TOKENS)
      return
    }
    let cancelled = false
    void import('../utils/phone-links').then(async ({ findPhoneTokens }) => {
      const found = await findPhoneTokens(value)
      if (!cancelled) setTokens(found)
    })
    return () => {
      cancelled = true
    }
  }, [value, enabled])

  return tokens
}

function LinkSegment({ token, linkClassName }: { token: LinkToken; linkClassName: string }) {
  // mailto:/tel: don't navigate the tab, so no target="_blank" for them
  const external = token.type === 'url'
  return (
    <a
      href={token.href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={linkClassName}
      onClick={(e) => e.stopPropagation()}
    >
      {token.text}
    </a>
  )
}

function renderSegment(segment: TextSegment, index: number, linkClassName: string) {
  if (segment.token) {
    return <LinkSegment key={index} token={segment.token} linkClassName={linkClassName} />
  }
  return <Fragment key={index}>{segment.text}</Fragment>
}

export function LinkifiedText({
  value,
  className,
  linkClassName = DEFAULT_LINK_CLASS,
  detectPhones = false
}: LinkifiedTextProps) {
  // Callers render raw property values from untyped stores, so `value` can
  // arrive as a number/object despite the prop type. Coerce once here —
  // linkify-it and segmentText both require a real string.
  const text = typeof value === 'string' ? value : value == null ? '' : String(value)
  const baseTokens = useMemo(() => findLinkTokens(text), [text])
  const phoneTokens = usePhoneTokens(text, detectPhones)
  const segments = useMemo(
    () => segmentText(text, mergeLinkTokens(baseTokens, phoneTokens)),
    [text, baseTokens, phoneTokens]
  )
  return (
    <span className={className}>
      {segments.map((segment, index) => renderSegment(segment, index, linkClassName))}
    </span>
  )
}
