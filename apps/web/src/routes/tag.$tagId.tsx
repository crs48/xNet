/**
 * Tag surface route (exploration 0169): the tag detail page — tagged
 * content grouped by type plus tag management.
 */
import { createFileRoute } from '@tanstack/react-router'
import { TagView } from '../components/TagView'

export const Route = createFileRoute('/tag/$tagId')({
  component: TagPage
})

function TagPage() {
  const { tagId } = Route.useParams()
  return <TagView tagId={tagId} />
}
