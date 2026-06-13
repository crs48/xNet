/**
 * MessageActions (exploration 0176) — per-message safety menu.
 *
 * Report a specific message (a synced AbuseReport targeting the message node),
 * and, for your own messages, mark it sensitive after the fact. Complements the
 * person-level PersonActions menu.
 */
import { AbuseReportSchema } from '@xnetjs/data'
import { useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { Popover } from '@xnetjs/ui'
import { MoreHorizontal } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { ReportDialog } from './ReportDialog'
import { SelfLabelControl } from './SelfLabelControl'

type ReportCategory =
  | 'harassment'
  | 'spam'
  | 'scam'
  | 'impersonation'
  | 'sexual'
  | 'porn'
  | 'graphic-media'
  | 'malware'

export function MessageActions({ targetId, isOwn }: { targetId: string; isOwn: boolean }) {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const me = authorDID ?? ''
  const [reportOpen, setReportOpen] = useState(false)

  const report = async ({ category, reason }: { category: string; reason: string }) => {
    if (!bridge || !me) return
    await bridge.create(AbuseReportSchema, {
      target: targetId,
      targetSchema: 'ChatMessage',
      reporter: me as `did:key:${string}`,
      category: category as ReportCategory,
      reason,
      status: 'open'
    })
  }

  const trigger: ReactElement = (
    <button
      type="button"
      aria-label="Message actions"
      className="flex h-5 w-5 items-center justify-center rounded text-ink-3 opacity-0 hover:bg-surface-2 hover:text-ink-1 group-hover:opacity-100"
    >
      <MoreHorizontal size={12} />
    </button>
  )

  return (
    <>
      <Popover trigger={trigger} side="bottom" align="end">
        <div className="flex w-44 flex-col gap-1">
          {isOwn && <SelfLabelControl targetId={targetId} />}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-accent/50"
          >
            Report message…
          </button>
        </div>
      </Popover>
      {reportOpen && (
        <ReportDialog
          subjectLabel="this message"
          onSubmit={report}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  )
}
