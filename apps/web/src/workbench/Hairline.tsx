/**
 * Hairline resize separator — structure felt, not seen (0166).
 */
import { Separator, type SeparatorProps } from 'react-resizable-panels'

export function Hairline(props: SeparatorProps & { orientation: 'horizontal' | 'vertical' }) {
  const { orientation, ...rest } = props
  return (
    <Separator
      {...rest}
      className={
        orientation === 'horizontal'
          ? 'relative w-px shrink-0 bg-hairline transition-colors after:absolute after:-inset-x-1 after:inset-y-0 hover:bg-border-emphasis data-[dragging]:bg-accent-ink'
          : 'relative h-px shrink-0 bg-hairline transition-colors after:absolute after:-inset-y-1 after:inset-x-0 hover:bg-border-emphasis data-[dragging]:bg-accent-ink'
      }
    />
  )
}
