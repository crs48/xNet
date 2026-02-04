/**
 * Smart welcome screen — detects existing passkeys from other devices
 * and offers a "Welcome back" flow instead of the new-user flow.
 */
import { useEffect, useState } from 'react'
import { discoverExistingPasskey } from '@xnet/identity'
import { useOnboarding } from '../OnboardingProvider'
import { getPlatformAuthName } from '../helpers'
import { WelcomeScreen } from './WelcomeScreen'

export function SmartWelcome(): JSX.Element {
  const { send } = useOnboarding()
  const [checking, setChecking] = useState(true)
  const [hasExisting, setHasExisting] = useState(false)

  useEffect(() => {
    let cancelled = false
    discoverExistingPasskey()
      .then((passkey) => {
        if (!cancelled) {
          setHasExisting(passkey !== null)
          setChecking(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChecking(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (checking) {
    return (
      <div className="onboarding-screen">
        <p className="spinner-text">Checking for existing identity...</p>
      </div>
    )
  }

  if (hasExisting) {
    const authName = getPlatformAuthName()
    return (
      <div className="onboarding-screen welcome-back">
        <h1>Welcome back!</h1>

        <p className="subtitle">We found your xNet identity. Use {authName} to sign in.</p>

        <button className="primary-button" onClick={() => send({ type: 'AUTHENTICATE' })}>
          Sign in with {authName}
        </button>

        <button className="text-button" onClick={() => send({ type: 'AUTHENTICATE' })}>
          Create a new identity instead
        </button>
      </div>
    )
  }

  return <WelcomeScreen />
}
