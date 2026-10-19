import init, { transformSync } from '@swc/wasm-web'
import wasmUrl from '@swc/wasm-web/wasm_bg.wasm?url'
self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    if (typeof event.data !== 'string' || event.data.length > 24000)
      throw new Error('Source exceeds the preview limit.')
    await init({ module_or_path: wasmUrl })
    const code = transformSync(event.data, {
      jsc: { parser: { syntax: 'typescript', tsx: false }, target: 'es2022' },
      module: { type: 'es6' }
    }).code
    if (code.length > 100000) throw new Error('Compiled source exceeds the preview limit.')
    self.postMessage({ code })
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : String(cause) })
  }
}
