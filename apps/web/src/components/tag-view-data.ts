/**
 * Shim (0406): canonical module lives in @xnetjs/workbench. New code
 * imports the package directly.
 */
export {
  filterTagged,
  mergeTagOps,
  rankTagsByUsage,
  type TaggedRef,
  type TagUpdateOp,
  type RankableTag
} from '@xnetjs/workbench'
