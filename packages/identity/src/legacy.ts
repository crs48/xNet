/**
 * @xnetjs/identity/legacy - Deprecated compatibility entrypoint
 */

export {
  deriveKeyBundle,
  generateKeyBundle,
  serializeKeyBundle,
  deserializeKeyBundle
} from './keys'
export { type PasskeyStorage, BrowserPasskeyStorage, MemoryPasskeyStorage } from './passkey'
