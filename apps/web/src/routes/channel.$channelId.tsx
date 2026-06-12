/**
 * Channel surface route (exploration 0167): chat channels, DMs, and
 * voice rooms all render the ChannelView tab.
 */
import { createFileRoute } from '@tanstack/react-router'
import { ChannelView } from '../comms/ChannelView'

export const Route = createFileRoute('/channel/$channelId')({
  component: ChannelPage
})

function ChannelPage() {
  const { channelId } = Route.useParams()
  return <ChannelView channelId={channelId} />
}
