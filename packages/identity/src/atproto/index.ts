/**
 * ATProto identity bridge (explorations 0301/0322/0337): foreign-DID
 * representation and the `net.x.identity.binding` record. Represent-only —
 * nothing here signs xNet data with a foreign key.
 */
export {
  isAtprotoDid,
  isXNetDid,
  parseAnyDid,
  normalizeAtprotoHandle,
  isValidAtprotoHandle,
  type AnyDid,
  type AtprotoDid,
  type XNetDid,
  type ParsedAnyDid
} from './did'
export {
  ATPROTO_BINDING_COLLECTION,
  ATPROTO_BINDING_RKEY,
  bindingMessage,
  createAtprotoBinding,
  verifyAtprotoBinding,
  type AtprotoBindingRecord,
  type BindingVerification
} from './binding'
