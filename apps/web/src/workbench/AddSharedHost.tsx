/**
 * AddSharedHost — makes "Add shared…" reachable from anywhere (0288).
 *
 * The Explorer opened `AddSharedDialog` inline; the canonical New menu (top
 * island) lives elsewhere, so the dialog is hosted at the shell and opened via
 * the `share.addShared` command. Mounted once by the floating frame.
 */
import { getCommandRegistry } from '@xnetjs/plugins'
import { useEffect, useState } from 'react'
import { AddSharedDialog } from '../components/AddSharedDialog'

export function AddSharedHost() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const disposable = getCommandRegistry().register({
      id: 'share.addShared',
      title: 'Add shared…',
      run: () => setOpen(true)
    })
    return () => disposable.dispose()
  }, [])

  return <AddSharedDialog isOpen={open} onClose={() => setOpen(false)} />
}
