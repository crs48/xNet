/**
 * Plugin contributions → workbench wiring (exploration 0166).
 *
 * Containers vs items, the VS Code model: plugins contribute items
 * (rail entries, panel views, status items, commands) into the
 * shell's fixed regions. SidebarContributions become rail items (and
 * left-panel views when they carry a panel component);
 * StatusBarContributions render in the status bar; commands mirror
 * into the CommandRegistry so the palette lists them with chords.
 */
import {
  getCommandRegistry,
  type SidebarContribution,
  type StatusBarContribution
} from '@xnetjs/plugins'
import { usePluginRegistryOptional } from '@xnetjs/react'
import { frameSourceRegistry } from '@xnetjs/views'
import { useEffect, useState } from 'react'
import { registerPanelView } from './PanelViewHost'

interface WorkbenchContributions {
  railItems: SidebarContribution[]
  statusItems: StatusBarContribution[]
}

const EMPTY: WorkbenchContributions = { railItems: [], statusItems: [] }

export function useWorkbenchContributions(): WorkbenchContributions {
  const pluginRegistry = usePluginRegistryOptional()
  const [contributions, setContributions] = useState<WorkbenchContributions>(EMPTY)

  useEffect(() => {
    if (!pluginRegistry) return

    const registry = pluginRegistry.getContributions()
    const commandRegistry = getCommandRegistry()
    const panelDisposers = new Map<string, () => void>()
    const commandDisposers = new Map<string, () => void>()

    // Sidebar contributions with a panel become left-panel views.
    const bridgePanels = (railItems: SidebarContribution[]) => {
      for (const item of railItems) {
        if (item.panel && !panelDisposers.has(item.id)) {
          panelDisposers.set(
            item.id,
            registerPanelView('left', {
              id: `plugin:${item.id}`,
              title: item.name,
              component: item.panel
            })
          )
        }
      }
    }

    // Plugin commands surface in the palette with their keybindings.
    const bridgeCommands = () => {
      for (const command of registry.commands.getAll()) {
        if (commandDisposers.has(command.id)) continue
        const disposable = commandRegistry.register({
          id: command.id,
          title: command.name,
          key: command.keybinding,
          when: command.when,
          run: () => command.execute()
        })
        commandDisposers.set(command.id, () => disposable.dispose())
      }
    }

    // Plugin frame renderers (0346) bridge into the frame source
    // registry. The own-views-only rule is enforced at registration
    // (namespaced ids in PluginContext.registerFrameRenderer); here we
    // additionally never let a plugin renderer shadow a first-party one.
    const frameDisposers = new Map<string, () => void>()
    const bridgeFrameRenderers = () => {
      for (const renderer of registry.frameRenderers.getAll()) {
        if (frameDisposers.has(renderer.id) || frameSourceRegistry.has(renderer.id)) continue
        const disposable = frameSourceRegistry.register({
          id: renderer.id,
          supportedSchemas: renderer.supportedSchemas as never,
          component: renderer.component as never
        })
        frameDisposers.set(renderer.id, () => disposable.dispose())
      }
    }

    const sync = () => {
      const railItems = registry.sidebar.getAll()
      const statusItems = registry.statusBar.getAll()
      bridgePanels(railItems)
      bridgeCommands()
      bridgeFrameRenderers()
      setContributions({ railItems, statusItems })
    }

    sync()
    const unsubscribers = [
      registry.sidebar.onChange(sync),
      registry.statusBar.onChange(sync),
      registry.commands.onChange(sync),
      registry.frameRenderers.onChange(sync)
    ]

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
      for (const dispose of panelDisposers.values()) dispose()
      for (const dispose of commandDisposers.values()) dispose()
      for (const dispose of frameDisposers.values()) dispose()
    }
  }, [pluginRegistry])

  return contributions
}

export function statusContributionText(item: StatusBarContribution): string {
  return typeof item.text === 'function' ? item.text() : item.text
}
