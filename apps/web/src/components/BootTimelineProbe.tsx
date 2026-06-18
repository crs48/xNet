/**
 * Boot timeline probe (exploration 0204).
 *
 * Renders nothing. Lives inside <XNetProvider> so it can observe the two
 * boot phases that only exist in context — the data bridge becoming ready
 * (`store:ready`) and the hub reaching `connected` (`hub:connected`) — and
 * mark them on the shared boot timeline. On the first `connected` it logs
 * the full timeline (dev, or when `xnet:boot:debug` is set), turning the
 * previously-unexplained "connecting" window into attributable numbers.
 */
import { useXNet } from '@xnetjs/react'
import { useEffect } from 'react'
import { bootMark, logBootTimeline } from '../lib/boot-timeline'

export function BootTimelineProbe(): null {
  const { nodeStoreReady, hubStatus } = useXNet()

  useEffect(() => {
    if (nodeStoreReady) bootMark('store:ready')
  }, [nodeStoreReady])

  useEffect(() => {
    if (hubStatus === 'connected') {
      bootMark('hub:connected')
      logBootTimeline('hub:connected')
    }
  }, [hubStatus])

  return null
}
