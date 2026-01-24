/**
 * Screen reader announcer for live regions.
 *
 * Creates an aria-live region and announces messages to screen readers
 * without visual disruption.
 */

export type AnnouncerPriority = 'polite' | 'assertive'

export interface AnnounceOptions {
  /** Priority of the announcement. Default: 'polite' */
  priority?: AnnouncerPriority
  /** Delay before clearing the message (ms). Default: 1000 */
  clearDelay?: number
}

/**
 * ScreenReaderAnnouncer manages an invisible aria-live region for
 * announcing state changes to assistive technology.
 */
export class ScreenReaderAnnouncer {
  private politeEl: HTMLElement | null = null
  private assertiveEl: HTMLElement | null = null
  private clearTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Create and mount the announcer elements to the DOM.
   * Call this once when the editor mounts.
   */
  mount(container?: HTMLElement): void {
    const parent = container || document.body

    this.politeEl = this.createRegion('polite')
    this.assertiveEl = this.createRegion('assertive')

    parent.appendChild(this.politeEl)
    parent.appendChild(this.assertiveEl)
  }

  /**
   * Remove the announcer elements from the DOM.
   * Call this when the editor unmounts.
   */
  destroy(): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer)
      this.clearTimer = null
    }
    this.politeEl?.remove()
    this.assertiveEl?.remove()
    this.politeEl = null
    this.assertiveEl = null
  }

  /**
   * Announce a message to screen readers.
   *
   * @param message - The text to announce
   * @param options - Priority and timing options
   */
  announce(message: string, options: AnnounceOptions = {}): void {
    const { priority = 'polite', clearDelay = 1000 } = options
    const el = priority === 'assertive' ? this.assertiveEl : this.politeEl

    if (!el) return

    // Clear previous timer
    if (this.clearTimer) {
      clearTimeout(this.clearTimer)
    }

    // Reset content to trigger announcement (screen readers need a change)
    el.textContent = ''

    // Use requestAnimationFrame to ensure the empty content is processed first
    requestAnimationFrame(() => {
      el.textContent = message

      this.clearTimer = setTimeout(() => {
        el.textContent = ''
        this.clearTimer = null
      }, clearDelay)
    })
  }

  /**
   * Check if the announcer is currently mounted.
   */
  get isMounted(): boolean {
    return this.politeEl !== null && this.assertiveEl !== null
  }

  private createRegion(priority: AnnouncerPriority): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', priority)
    el.setAttribute('aria-atomic', 'true')
    el.className = 'sr-only'
    // Visually hidden but accessible to screen readers
    Object.assign(el.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      borderWidth: '0'
    })
    return el
  }
}

/**
 * Convenience function to create and mount a ScreenReaderAnnouncer.
 */
export function createAnnouncer(container?: HTMLElement): ScreenReaderAnnouncer {
  const announcer = new ScreenReaderAnnouncer()
  announcer.mount(container)
  return announcer
}
