/**
 * People candidates for comment @mention typeahead (exploration 0170).
 *
 * Durable profiles plus self, shaped as TaskPersonOption for the shared
 * MentionTextArea. The picker inserts DID-form mentions, which the
 * comment pipeline already extracts into structured mentions
 * (commentReferences.ts / useComments).
 */
import type { TaskPersonOption } from '@xnetjs/ui'
import { useIdentity } from '@xnetjs/react'
import { useMemo } from 'react'
import { useProfiles } from '../comms/hooks'

export function useCommentPeople(): TaskPersonOption[] {
  const profiles = useProfiles()
  const { did } = useIdentity()

  return useMemo(() => {
    const people: TaskPersonOption[] = profiles.map((profile) => ({
      did: profile.did,
      name: profile.name,
      handle: profile.handle,
      isSelf: profile.did === did
    }))
    if (did && !people.some((person) => person.did === did)) {
      people.unshift({ did, isSelf: true })
    }
    return people
  }, [profiles, did])
}
