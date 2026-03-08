/**
 * Center-panel host for the local OpenCode web UI.
 */

import type { SessionSummaryNode } from './state/active-session'
import type { OpenCodeHostOutputEvent, OpenCodeHostStatus } from '../../shared/opencode-host'
import { useTelemetry } from '@xnetjs/telemetry'
import { Badge, Button } from '@xnetjs/ui'
import { Code2, LoaderCircle, RefreshCcw, SquareTerminal } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OPENCODE_INSTALL_URL } from '../../shared/opencode-host'

type OpenCodePanelProps = {
  activeSession: SessionSummaryNode | null
}

function badgeVariantForStatus(state: OpenCodeHostStatus['state']) {
  switch (state) {
    case 'ready':
      return 'success'
    case 'starting':
      return 'secondary'
    case 'missing-binary':
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

function getLastOutputLine(event: OpenCodeHostOutputEvent): string {
  const trimmed = event.data.trim()
  if (!trimmed) {
    return ''
  }

  const segments = trimmed
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
  return segments.at(-1) ?? trimmed
}

export function OpenCodePanel({ activeSession }: OpenCodePanelProps): React.ReactElement {
  const telemetry = useTelemetry({ component: 'electron.workspace.opencode' })
  const [status, setStatus] = useState<OpenCodeHostStatus | null>(null)
  const [lastOutput, setLastOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const ensureStartRef = useRef<number | null>(null)
  const reportedStateRef = useRef<OpenCodeHostStatus['state'] | null>(null)

  const ensureHost = useCallback(async (): Promise<OpenCodeHostStatus | null> => {
    setBusy(true)
    ensureStartRef.current = performance.now()

    try {
      const nextStatus = await window.xnetOpenCode.ensure()
      setStatus(nextStatus)
      return nextStatus
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      setLastOutput(normalized.message)
      telemetry.reportCrash(normalized, {
        codeNamespace: 'electron.workspace',
        codeFunction: 'workspace.opencode.ensure'
      })
      return null
    } finally {
      setBusy(false)
    }
  }, [telemetry])

  useEffect(() => {
    let active = true

    void window.xnetOpenCode.status().then((nextStatus) => {
      if (!active) {
        return
      }

      setStatus(nextStatus)
    })

    void ensureHost()

    const stopStatus = window.xnetOpenCode.onStatusChange((nextStatus) => {
      if (!active) {
        return
      }

      setStatus(nextStatus)
    })

    const stopOutput = window.xnetOpenCode.onOutput((event) => {
      if (!active) {
        return
      }

      const nextLine = getLastOutputLine(event)
      if (nextLine) {
        setLastOutput(nextLine)
      }
    })

    return () => {
      active = false
      stopStatus()
      stopOutput()
    }
  }, [ensureHost])

  useEffect(() => {
    if (!status) {
      return
    }

    if (status.state === reportedStateRef.current) {
      return
    }

    reportedStateRef.current = status.state

    if (status.state === 'ready' && ensureStartRef.current !== null) {
      const duration = performance.now() - ensureStartRef.current
      telemetry.reportPerformance('workspace.opencode.ready', duration, 'electron.workspace')
      if (duration > 50) {
        telemetry.reportUsage('workspace.opencode.ready.slow', 1)
      }
      ensureStartRef.current = null
      return
    }

    if (status.state === 'missing-binary') {
      telemetry.reportUsage('workspace.opencode.missing_binary', 1)
      return
    }

    if (status.state === 'error') {
      telemetry.reportCrash(new Error(status.error), {
        codeNamespace: 'electron.workspace',
        codeFunction: 'workspace.opencode.ready'
      })
    }
  }, [status, telemetry])

  const chrome = useMemo(() => {
    if (!status) {
      return {
        heading: 'Starting OpenCode',
        body: 'Preparing the local OpenCode web host for the center panel.'
      }
    }

    if (status.state === 'ready') {
      return {
        heading: activeSession?.title ?? 'OpenCode is ready',
        body: activeSession
          ? `${activeSession.branch ?? 'no-branch'} · ${activeSession.worktreePath ?? 'pending worktree'}`
          : 'Select a session from the rail to tie this chat surface to a worktree.'
      }
    }

    if (status.state === 'missing-binary') {
      return {
        heading: 'Install OpenCode to continue',
        body: status.error
      }
    }

    if (status.state === 'error') {
      return {
        heading: 'OpenCode host needs attention',
        body: status.error
      }
    }

    return {
      heading: 'Preparing OpenCode',
      body: lastOutput || 'Waiting for the local host to become ready.'
    }
  }, [activeSession, lastOutput, status])

  return (
    <section className="flex h-full flex-col bg-background/75 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <SquareTerminal className="h-3.5 w-3.5" />
            OpenCode
          </div>
          <p className="truncate text-sm font-semibold text-foreground">{chrome.heading}</p>
          <p className="truncate text-xs text-muted-foreground">{chrome.body}</p>
        </div>

        <div className="flex items-center gap-2">
          {status ? (
            <Badge variant={badgeVariantForStatus(status.state)} className="capitalize">
              {status.state}
            </Badge>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={busy}
            leftIcon={!busy ? <RefreshCcw /> : undefined}
            onClick={() => {
              void ensureHost()
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        {!status || status.state === 'starting' || status.state === 'stopped' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-border/70 bg-background/70 px-8 text-center">
            <LoaderCircle className="h-7 w-7 animate-spin text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Booting the local coding agent</p>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                {lastOutput ||
                  'OpenCode Web will stay mounted here so session switching does not thrash the chat UI.'}
              </p>
            </div>
          </div>
        ) : status.state === 'missing-binary' ? (
          <div className="flex h-full flex-col items-start justify-center gap-4 rounded-[28px] border border-destructive/30 bg-destructive/5 p-6">
            <Badge variant="destructive">OpenCode missing</Badge>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">{status.error}</p>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">{status.recovery}</p>
            </div>
            <div className="flex gap-3">
              <Button type="button" asChild>
                <a href={OPENCODE_INSTALL_URL} target="_blank" rel="noreferrer">
                  <Code2 />
                  Install OpenCode
                </a>
              </Button>
              <Button type="button" variant="outline" onClick={() => void ensureHost()}>
                Retry host
              </Button>
            </div>
          </div>
        ) : status.state === 'error' ? (
          <div className="flex h-full flex-col items-start justify-center gap-4 rounded-[28px] border border-destructive/30 bg-destructive/5 p-6">
            <Badge variant="destructive">Host error</Badge>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">{status.error}</p>
              {status.recovery ? (
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                  {status.recovery}
                </p>
              ) : null}
              {status.lastOutput || lastOutput ? (
                <pre className="overflow-x-auto rounded-2xl bg-background/80 p-3 text-xs text-muted-foreground">
                  {status.lastOutput || lastOutput}
                </pre>
              ) : null}
            </div>
            <Button type="button" variant="outline" onClick={() => void ensureHost()}>
              Retry host
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-2xl shadow-black/10">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {activeSession?.title ?? 'Shared chat surface'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {status.baseUrl}
                  {status.requiresAuth ? ' · local auth enabled' : ' · no local auth'}
                </p>
              </div>
              {lastOutput ? (
                <span className="truncate text-[11px] text-muted-foreground">{lastOutput}</span>
              ) : null}
            </div>
            <iframe
              title="OpenCode"
              src={status.baseUrl}
              className="min-h-0 flex-1 border-0 bg-white"
            />
          </div>
        )}
      </div>
    </section>
  )
}
