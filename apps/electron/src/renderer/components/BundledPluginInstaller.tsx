/**
 * BundledPluginInstaller - Installs bundled plugins on first run
 *
 * This component runs once when the app starts and installs any
 * bundled plugins that aren't already installed.
 */

import { useEffect, useRef } from 'react'
import { useXNet } from '@xnet/react'
import { BUNDLED_PLUGINS } from '../plugins'

export function BundledPluginInstaller() {
  const { pluginRegistry } = useXNet()
  const installedRef = useRef(false)

  useEffect(() => {
    if (!pluginRegistry || installedRef.current) return

    // Mark as installed to prevent re-running
    installedRef.current = true

    const installBundledPlugins = async () => {
      for (const plugin of BUNDLED_PLUGINS) {
        // Skip if already installed
        if (pluginRegistry.has(plugin.id)) {
          continue
        }

        try {
          await pluginRegistry.install(plugin)
        } catch (err) {
          console.error(`[BundledPlugins] Failed to install '${plugin.name}':`, err)
        }
      }
    }

    installBundledPlugins()
  }, [pluginRegistry])

  // This component doesn't render anything
  return null
}
