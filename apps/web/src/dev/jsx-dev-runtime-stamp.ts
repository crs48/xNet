/**
 * Dev-only JSX runtime shim that stamps source refs onto host elements
 * (exploration 0399).
 *
 * `vite.config.ts` points `jsxImportSource` at `xnet-jsx` in dev, so esbuild
 * emits `import { jsxDEV } from "xnet-jsx/jsx-dev-runtime"` and the
 * `sourceStampPlugin` alias resolves that to this file. We read the `source`
 * argument esbuild already passes, fold it into props as `data-xnet-src`, and
 * hand everything on to React untouched.
 *
 * This file must never be reachable from a production build. It is imported
 * only through the dev-only alias, never by name.
 */
import { jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime'
import { stampProps, type JsxSource } from './source-stamp'

export { Fragment } from 'react/jsx-dev-runtime'

/**
 * The stamping `jsxDEV`.
 *
 * Signature mirrors React's dev runtime exactly, including the trailing
 * `self` argument: dropping a parameter React may use would change behaviour
 * for every element in the app, which is not a trade a debugging aid gets to
 * make.
 */
export function jsxDEV(
  type: unknown,
  props: Record<string, unknown>,
  key: unknown,
  isStaticChildren: boolean,
  source: JsxSource | undefined,
  self: unknown
): unknown {
  return (reactJsxDEV as (...args: unknown[]) => unknown)(
    type,
    stampProps(type, props, source),
    key,
    isStaticChildren,
    source,
    self
  )
}
