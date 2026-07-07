/**
 * Route ↔ mode reconciliation (0250, shared since 0280).
 *
 * The route is authoritative for the active calm mode (deep links and
 * back/forward keep the List and ModeSwitch honest); modeless surfaces
 * (settings) fall back to the last real mode, persisted so it survives
 * navigation. Extracted from CalmShell so the ShellFrame reconciles the
 * same way without duplicating the effect.
 */
import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useWorkbench, type CalmMode } from '../state'
import { modeForPath } from './modes'

export function useActiveCalmMode(): CalmMode {
  const { pathname } = useLocation()
  const storedMode = useWorkbench((state) => state.calmMode)
  const setCalmMode = useWorkbench((state) => state.setCalmMode)
  const routeMode = modeForPath(pathname)
  useEffect(() => {
    if (routeMode && routeMode !== storedMode) setCalmMode(routeMode)
  }, [routeMode, storedMode, setCalmMode])
  return routeMode ?? storedMode
}
