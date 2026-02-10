/**
 * BundledPluginInstaller - Installs bundled plugins on first run
 *
 * This component runs once when the app starts and installs any
 * bundled plugins that aren't already installed.
 */

import { useXNet } from '@xnet/react'
import { useEffect, useRef } from 'react'
import { BUNDLED_PLUGINS } from '../plugins'

export function BundledPluginInstaller() {
  const { pluginRegistry, nodeStoreReady } = useXNet()
  const installedRef = useRef(false)

  useEffect(() => {
    if (!pluginRegistry || !nodeStoreReady || installedRef.current) return

    installedRef.current = true

    const installBundledPlugins = async () => {
      for (const plugin of BUNDLED_PLUGINS) {
        try {
          if (pluginRegistry.has(plugin.id)) {
            await pluginRegistry.rehydrate(plugin)
          } else {
            await pluginRegistry.install(plugin)
          }
        } catch (err) {
          console.error(`[BundledPlugins] Failed to install '${plugin.name}':`, err)
        }
      }
    }

    installBundledPlugins()
  }, [pluginRegistry, nodeStoreReady])

  // This component doesn't render anything
  return null
}
