/**
 * PWA install-prompt plumbing, extracted from App.tsx: captures the deferred
 * `beforeinstallprompt` event, tracks standalone/installed state, and exposes
 * a `promptInstall` action.
 */
import { useState, useCallback, useEffect } from 'react'

export type BeforeInstallPromptUserChoice = {
  outcome: 'accepted' | 'dismissed'
  platform: string
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<BeforeInstallPromptUserChoice>
}

export function isStandaloneWebApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function useWebInstallPrompt(): {
  canInstall: boolean
  isInstalled: boolean
  promptInstall: () => Promise<BeforeInstallPromptUserChoice | null>
} {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneWebApp())

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)')
    const handleDisplayModeChange = () => setIsInstalled(isStandaloneWebApp())

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<BeforeInstallPromptUserChoice | null> => {
    if (!installPrompt) {
      return null
    }

    const prompt = installPrompt
    setInstallPrompt(null)
    await prompt.prompt()
    const userChoice = await prompt.userChoice.catch(() => null)

    if (userChoice?.outcome === 'accepted') {
      setIsInstalled(true)
    }

    return userChoice
  }, [installPrompt])

  return {
    canInstall: Boolean(installPrompt),
    isInstalled,
    promptInstall
  }
}
