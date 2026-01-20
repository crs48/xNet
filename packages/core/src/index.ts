/**
 * @xnet/core - Core types, schemas, and content addressing
 */

// Content ID types
export type ContentId = `cid:blake3:${string}`
export type DID = `did:key:${string}`
export type DocumentPath = `xnet://${DID}/workspace/${string}/doc/${string}`

// Re-export when implementations are added
export {}
