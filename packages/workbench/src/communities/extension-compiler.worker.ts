import { EXTENSION_SOURCE_LIMIT, EXTENSION_CODE_LIMIT } from './extension-desktop-contract'
import init, { parseSync, transformSync } from '@swc/wasm-web'
import wasmUrl from '@swc/wasm-web/wasm_bg.wasm?url'
import { inspectExtensionAccess } from './extension-access-intent'
self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    if (typeof event.data !== 'string' || event.data.length > EXTENSION_SOURCE_LIMIT)
      throw new Error('Source exceeds the preview limit.')
    await init({ module_or_path: wasmUrl })
    const code = transformSync(event.data, {
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        target: 'es2022',
        transform: { react: { runtime: 'automatic' } }
      },
      module: { type: 'commonjs' }
    }).code
    if (code.length > EXTENSION_CODE_LIMIT)
      throw new Error('Compiled source exceeds the preview limit.')
    const access = inspectExtensionAccess(
      parseSync(event.data, { syntax: 'typescript', tsx: true })
    )
    self.postMessage({ code, access })
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : String(cause) })
  }
}
