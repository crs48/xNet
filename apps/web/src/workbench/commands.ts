/**
 * Core workbench keyboard map (exploration 0166).
 *
 * Every shell action is a CommandRegistry command so the palette can
 * list it with its chord. Cmd+K (palette) lives in GlobalSearch;
 * Cmd+T / Cmd+W / Ctrl+Tab / Cmd+1/2 are registered by the editor
 * area where tab context lives.
 */
import { getCommandRegistry } from '@xnetjs/plugins'
import { useEffect } from 'react'
import { useWorkbench } from './state'

export function useWorkbenchCommands(): void {
  useEffect(() => {
    const registry = getCommandRegistry()
    const wb = () => useWorkbench.getState()

    const disposables = [
      registry.register({
        id: 'workbench.toggleLeftPanel',
        title: 'Toggle left panel',
        key: 'Mod-B',
        allowInInput: true,
        run: () => wb().togglePanel('left')
      }),
      registry.register({
        id: 'workbench.toggleRightPanel',
        title: 'Toggle right panel',
        key: 'Mod-\\',
        allowInInput: true,
        run: () => wb().togglePanel('right')
      }),
      registry.register({
        id: 'workbench.toggleBottomPanel',
        title: 'Toggle bottom panel',
        key: 'Mod-J',
        allowInInput: true,
        run: () => wb().togglePanel('bottom')
      }),
      registry.register({
        id: 'workbench.focus',
        title: 'View: Focus mode (hide chrome)',
        key: 'Mod-.',
        allowInInput: true,
        run: () => wb().toggleFocus()
      }),
      registry.register({
        id: 'workbench.switchLayout',
        title: 'View: Switch layout (Calm ↔ Workbench)',
        run: () => wb().toggleLayout()
      }),
      // Quiet-surface posture (0273): both directions get explicit palette
      // entries so either posture is one ⌘K away from the other.
      registry.register({
        id: 'workbench.quietChrome',
        title: 'View: Quiet chrome (surface first)',
        when: () => useWorkbench.getState().chrome !== 'quiet',
        run: () => wb().setChrome('quiet')
      }),
      registry.register({
        id: 'workbench.pinnedChrome',
        title: 'View: Pinned chrome',
        when: () => useWorkbench.getState().chrome !== 'pinned',
        run: () => wb().setChrome('pinned')
      }),
      registry.register({
        id: 'workbench.showExplorer',
        title: 'Show explorer',
        run: () => wb().showPanelView('left', 'explorer')
      }),
      registry.register({
        id: 'workbench.showTasksPanel',
        title: 'Show tasks panel',
        run: () => wb().showPanelView('left', 'tasks')
      }),
      registry.register({
        id: 'workbench.showDataPanel',
        title: 'Show data panel',
        run: () => wb().showPanelView('left', 'data')
      }),
      registry.register({
        id: 'workbench.setStartupTab',
        title: 'Use current tab at startup',
        when: () => {
          const state = useWorkbench.getState()
          const group = state.groups.find((g) => g.id === state.activeGroupId)
          return Boolean(group?.activeTabId)
        },
        run: () => {
          const state = wb()
          const group = state.groups.find((g) => g.id === state.activeGroupId)
          const tab = group?.tabs.find((t) => t.id === group.activeTabId)
          if (tab) state.setStartupTab({ nodeType: tab.nodeType, nodeId: tab.nodeId })
        }
      }),
      registry.register({
        id: 'workbench.clearStartupTab',
        title: 'Clear startup tab',
        when: () => Boolean(useWorkbench.getState().startupTab),
        run: () => wb().setStartupTab(null)
      })
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
  }, [])
}

/**
 * The pinned frame's Esc ladder (0280 phase 4, extending 0273): each Esc
 * closes ONE open dock — bottom, then right, then left — walking the
 * disclosure ladder down to the bare surface. Runs only when nothing
 * closer to the keystroke claimed it (palette, dialogs, editors all
 * preventDefault first) and never steals Esc from text inputs.
 */
export function useShellEscape(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        target &&
        (target.closest('input, textarea, [contenteditable="true"]') || target.isContentEditable)
      ) {
        return
      }
      const state = useWorkbench.getState()
      // Focus mode (0284): a single Esc restores the chrome.
      if (state.focus) {
        event.preventDefault()
        state.setFocus(false)
        return
      }
      if (state.chrome === 'quiet' || state.mode === 'zen') return
      const side = (['bottom', 'right', 'left'] as const).find((s) => state[s].open)
      if (!side) return
      event.preventDefault()
      state.setPanelOpen(side, false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

/** Exit zen with Esc Esc (two presses within 500ms), preserving layout. */
export function useZenEscape(): void {
  const mode = useWorkbench((state) => state.mode)

  useEffect(() => {
    if (mode !== 'zen') return

    let lastEscape = 0
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const now = Date.now()
      if (now - lastEscape < 500) {
        event.preventDefault()
        useWorkbench.getState().toggleZen()
        lastEscape = 0
      } else {
        lastEscape = now
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode])
}
