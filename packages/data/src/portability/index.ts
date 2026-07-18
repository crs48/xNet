/**
 * Portability — first-class export/import of the change log as `.xnetpack`
 * bundles (exploration 0344). Export is sync-to-disk; import is
 * verify-then-replay. See types.ts for the bundle layout.
 */

export {
  XNETPACK_FORMAT_VERSION,
  BUNDLE_ENTRY,
  FRONTIER_HEADS_CAP,
  type XnetpackManifest,
  type BundleScope,
  type BundleFrontier,
  type PortableChangeRecord,
  type PortableBlobRecord,
  type PortableYjsDocRecord,
  type BundleSink,
  type BundleSource,
  type BundleBlobPort,
  type BundleYjsPort,
  type BundleVerifyIssue,
  type BundleVerifyReport,
  type BundleApplyReport,
  type QuarantinedRecord,
  type ApplyBundleOptions,
  type WriteBundleOptions
} from './types'
export {
  toPortableChangeRecord,
  fromPortableChangeRecord,
  canonicalManifestBytes
} from './serialize'
export { writeBundle, blobEntryPath } from './write'
export { verifyBundle } from './verify'
export { applyBundle, readBundleManifest, BundleImportError } from './apply'
export { MemoryBundleSink, MemoryBundleSource } from './memory-bundle'
export { createStoreYjsPort } from './store-yjs-port'
