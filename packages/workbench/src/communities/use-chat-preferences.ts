import { useCallback, useEffect, useRef, useState } from 'react'
import { parseChatPreferences, type ChatPreferences, type ChatPreference } from './chat-inbox'

export function useChatPreferences(did: string | null) {
  const key = `xnet:chat-preferences:v1:${did ?? ''}`
  const [state, setState] = useState<{ key: string; chats: ChatPreferences; error: string }>({
    key: '',
    chats: {},
    error: ''
  })
  const current = useRef(state)
  const saveState = useCallback((next: typeof state) => {
    current.current = next
    setState(next)
  }, [])
  useEffect(() => {
    if (!did) return
    try {
      saveState({ key, chats: parseChatPreferences(localStorage.getItem(key)), error: '' })
    } catch {
      saveState({
        key,
        chats: {},
        error:
          'Chat preferences could not be loaded. Your saved preferences have not been overwritten.'
      })
    }
  }, [did, key, saveState])
  const update = useCallback(
    (id: string, change: (previous: ChatPreference) => ChatPreference) => {
      const previous = current.current
      if (previous.key !== key || previous.error || !did) return
      const next = change(previous.chats[id] ?? {})
      if (JSON.stringify(next) === JSON.stringify(previous.chats[id] ?? {})) return
      const chats = { ...previous.chats, [id]: next }
      try {
        localStorage.setItem(key, JSON.stringify({ version: 1, chats }))
        saveState({ key, chats, error: '' })
      } catch {
        saveState({
          ...previous,
          error: 'Chat preferences could not be saved. Check this device’s available storage.'
        })
      }
    },
    [did, key, saveState]
  )
  return {
    chats: state.key === key ? state.chats : {},
    error: state.key === key ? state.error : '',
    ready: state.key === key && !state.error,
    update
  }
}
