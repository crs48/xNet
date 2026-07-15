/**
 * /requests (exploration 0176/0177) — the message-request inbox.
 *
 * First contact from someone you haven't connected with lands here, not in your
 * DMs. Accept opens a DM; decline silently drops it; block (via PersonActions)
 * severs contact. Media on the request is blurred until you accept.
 */
import { createFileRoute } from '@tanstack/react-router'
import { DIDAvatar } from '@xnetjs/ui'
import { DraftReviewRequests } from '../components/DraftReviewRequests'
import { PersonActions } from '../components/PersonActions'
import { useMessageRequests } from '../hooks/useDmOpen'

export const Route = createFileRoute('/requests')({
  component: RequestsPage
})

function RequestsPage() {
  const { requests, accept, decline } = useMessageRequests()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Message requests</h1>
        <p className="text-sm text-muted-foreground">
          People you haven't connected with reach you here first. Accepting opens a chat; declining
          drops it silently.
        </p>
      </header>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending requests.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <DIDAvatar did={request.sender} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{request.displayName}</div>
                {request.preview && (
                  <div className="truncate text-xs text-muted-foreground">{request.preview}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void accept(request.id, request.sender)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => void decline(request.id)}
                className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50"
              >
                Decline
              </button>
              <PersonActions did={request.sender} label={request.displayName} hideWave />
            </li>
          ))}
        </ul>
      )}

      {/* Open drafts flagged for review (exploration 0329 P4 support). */}
      <DraftReviewRequests />
    </div>
  )
}
