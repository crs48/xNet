/**
 * Shim (0406): canonical module lives in @xnetjs/workbench (the inspect
 * overlay moved there with the shell chrome). The dev JSX runtime shim next
 * door and the stamp guard keep importing this path.
 */
export {
  SOURCE_ATTR,
  shouldStamp,
  repoRelative,
  formatSource,
  stampProps,
  type JsxSource
} from '@xnetjs/workbench'
