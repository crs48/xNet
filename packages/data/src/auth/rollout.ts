export interface AuthFeatureFlags {
  enforceLocal: boolean
  enforceRemote: boolean
  enforceHub: boolean
  enforceEncryption: boolean
  logDecisions: boolean
}

export const AUTH_FEATURE_FLAGS: AuthFeatureFlags = {
  enforceLocal: false,
  enforceRemote: false,
  enforceHub: false,
  enforceEncryption: false,
  logDecisions: true
}
