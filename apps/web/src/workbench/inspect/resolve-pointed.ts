/**
 * Turn a hovered DOM node into a {@link PointedElement} (exploration 0399).
 *
 * The overlay hands whatever the pointer is over; this walks up to find the
 * nearest owner of each kind so `resolveLane()` can pick a lane. Split out from
 * the component because it is the part with the interesting decisions — and the
 * part worth testing without rendering a shell.
 *
 * Deliberately conservative: every lookup returns `undefined` when it cannot
 * find a real answer. A guessed owner sends the user (and then an agent) at the
 * wrong file, which is worse than telling them the element is unmapped.
 */
import type { PointedElement } from '@xnetjs/devkit/blast-radius'
import { SOURCE_ATTR } from '../../dev/source-stamp'

export { SOURCE_ATTR }
/** Set by `PanelViewHost` on every registered slot view. */
export const SLOT_ATTR = 'data-slot-view'
/** Set where a workspace-plugin surface mounts (exploration 0331). */
export const PLUGIN_ATTR = 'data-xnet-plugin'

/** Injected lookups — the overlay passes the real registries, tests pass fakes. */
export interface PointedLookups {
  /** Human label for a slot id, e.g. `getSlotView(id)?.label`. */
  slotLabel?: (slotId: string) => string | undefined
  /** Human name for a plugin id. */
  pluginName?: (pluginId: string) => string | undefined
  /** Theme token backing this element's paint, if any. */
  tokenRef?: (element: Element) => string | undefined
}

/** Nearest ancestor (inclusive) carrying `attr`, and that attribute's value. */
function closestAttr(
  element: Element | null,
  attr: string
): { element: Element; value: string } | undefined {
  const found = element?.closest(`[${attr}]`)
  const value = found?.getAttribute(attr)
  return found && value ? { element: found, value } : undefined
}

/**
 * Resolve the pointed element's owners.
 *
 * Note that the SOURCE ref is taken from the nearest stamped ancestor, which is
 * usually a few nodes up from a text node or an icon `<svg>`. That is the right
 * answer — the JSX site that produced the visible box is what an edit would
 * touch — but it does mean pointing at a deeply nested span resolves to its
 * container, not to itself.
 */
export function resolvePointed(
  element: Element | null,
  lookups: PointedLookups = {}
): PointedElement {
  if (!element) return {}

  const source = closestAttr(element, SOURCE_ATTR)
  const slot = closestAttr(element, SLOT_ATTR)
  const plugin = closestAttr(element, PLUGIN_ATTR)

  return {
    source: source?.value,
    slotId: slot?.value,
    slotLabel: slot ? lookups.slotLabel?.(slot.value) : undefined,
    pluginId: plugin?.value,
    pluginName: plugin ? lookups.pluginName?.(plugin.value) : undefined,
    tokenRef: lookups.tokenRef?.(element)
  }
}

/**
 * Turns a token's declared value into the string a computed style would report.
 *
 * Needed because the two sides are written in different languages: xNet's tokens
 * hold bare HSL COMPONENTS (`0 0% 98%`) for use as `hsl(var(--surface-1))`,
 * while `getComputedStyle(el).backgroundColor` reports `rgb(250, 250, 250)`.
 * Comparing them directly never matches, which silently disables the whole
 * Lane 1 path.
 */
export type ColorNormalizer = (declaredValue: string) => string

/**
 * A normalizer that lets the browser do the conversion.
 *
 * Exact by construction — no hand-rolled HSL→RGB rounding to disagree with the
 * engine. Uses one reused probe element rather than one per call, and returns
 * the input unchanged for values the engine refuses (a token holding a shadow,
 * a font stack, or a number is not a colour and must not be indexed as one).
 */
export function browserColorNormalizer(): ColorNormalizer {
  let probe: HTMLElement | undefined
  return (declaredValue: string) => {
    if (typeof document === 'undefined') return declaredValue
    if (!probe) {
      probe = document.createElement('span')
      probe.style.display = 'none'
      document.body.append(probe)
    }
    // Only an HSL component triple needs wrapping; anything else is passed
    // through so an already-resolved colour still normalizes.
    const candidate = /^-?[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%$/.test(declaredValue)
      ? `hsl(${declaredValue})`
      : declaredValue
    probe.style.color = ''
    probe.style.color = candidate
    const resolved = getComputedStyle(probe).color
    return probe.style.color ? resolved : declaredValue
  }
}

/**
 * Build a value→token map from the custom properties declared on `:root`.
 *
 * This is how a hovered element gets attributed to a theme token without any
 * component opting in: read the computed custom properties once, normalize each
 * to the form a computed style reports, then match an element's resolved paint
 * back to whichever token carries that value.
 *
 * The inversion is inherently lossy — two tokens can hold the same colour — so
 * ties are broken by declaration order and the result is a *candidate*, shown
 * to the user for confirmation, never applied silently.
 */
export function buildTokenIndex(
  rootStyle: CSSStyleDeclaration,
  normalize: ColorNormalizer = (value) => value
): Map<string, string> {
  const index = new Map<string, string>()
  for (let i = 0; i < rootStyle.length; i += 1) {
    const name = rootStyle.item(i)
    if (!name.startsWith('--')) continue
    const declared = rootStyle.getPropertyValue(name).trim()
    if (!declared) continue
    // Index both forms: the declared value (so an already-rgb token matches)
    // and the normalized one (so an HSL triple matches a computed colour).
    for (const key of new Set([declared, normalize(declared)])) {
      if (key && !index.has(key)) index.set(key, name)
    }
  }
  return index
}

/** A colour that paints nothing. */
function isInvisible(value: string): boolean {
  return !value || value === 'rgba(0, 0, 0, 0)' || value === 'transparent'
}

/** Does this element actually draw a border? */
function hasBorder(style: CSSStyleDeclaration): boolean {
  for (const side of [
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width'
  ]) {
    if (Number.parseFloat(style.getPropertyValue(side)) > 0) return true
  }
  return false
}

/** Does this element render text of its own (not just its children's)? */
function hasOwnText(element: Element): boolean {
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3 && (node.textContent ?? '').trim()) return true
  }
  return false
}

/**
 * Find the theme token backing an element's paint, if any.
 *
 * Only attributes properties the element ACTUALLY PAINTS, which is a much
 * stricter test than "has a computed value" and the difference is the whole
 * feature working:
 *
 * - a transparent background is what almost every element in the tree has;
 * - Tailwind's preflight sets `border-color` on **every element** (with
 *   `border-width: 0`), so an unguarded border check made nearly everything
 *   claim to be a token change and hid Lanes 2 and 3 completely;
 * - `color` is inherited by everything, so it only means something on an
 *   element that renders its own text.
 *
 * Getting this wrong is not a cosmetic bug — it makes the overlay confidently
 * name the wrong owner, which is worse than naming none.
 */
export function tokenRefFor(
  element: Element,
  index: Map<string, string>,
  computed: (el: Element) => CSSStyleDeclaration
): string | undefined {
  const style = computed(element)

  const background = style.getPropertyValue('background-color').trim()
  if (!isInvisible(background)) {
    const token = index.get(background)
    if (token) return token
  }

  if (hasBorder(style)) {
    const border = style.getPropertyValue('border-color').trim()
    if (!isInvisible(border)) {
      const token = index.get(border)
      if (token) return token
    }
  }

  if (hasOwnText(element)) {
    const color = style.getPropertyValue('color').trim()
    if (!isInvisible(color)) {
      const token = index.get(color)
      if (token) return token
    }
  }

  return undefined
}
