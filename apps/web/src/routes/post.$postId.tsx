/**
 * Community topic route — thin wrapper over PostView (0359).
 */
import { createFileRoute } from '@tanstack/react-router'
import { PostView } from '../components/community/PostView'

export const Route = createFileRoute('/post/$postId')({
  component: PostPage
})

function PostPage() {
  const { postId } = Route.useParams()

  return <PostView postId={postId} />
}
