/**
 * People-matching hooks (exploration 0174).
 *
 * `useMatchmaker` gathers consented candidates (active intents joined to enabled
 * ConnectableProfiles), builds a social adjacency from the wave graph, and ranks
 * with the pure `rankMatches`. `useWave` performs the double-opt-in: it records a
 * wave and, when it finds the reverse wave, opens a DM (the reveal).
 */
import { ensureDmChannel } from '@xnetjs/comms'
import { ProfileSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import {
  ConnectableProfileSchema,
  ConnectionIntentSchema,
  ConnectionWaveSchema,
  buildAdjacency,
  buildIntroCard,
  friendsOfFriends,
  isMutualPair,
  rankMatches,
  waveCommitment,
  type CandidateProfile,
  type ConnectionIntentKind,
  type IntentReach,
  type MatchResult
} from '@xnetjs/social/connect'
import { useCallback, useMemo } from 'react'

type Row = Record<string, unknown>

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export type MatchListing = MatchResult & {
  displayName: string
  handle?: string
}

export interface MatchmakerState {
  matches: MatchListing[]
  loading: boolean
}

export function useMatchmaker(intent: ConnectionIntentKind): MatchmakerState {
  const { authorDID } = useXNet()
  const me = authorDID ?? ''

  const { data: intents, loading: intentsLoading } = useQuery(ConnectionIntentSchema, {
    where: { kind: intent, active: true }
  })
  const { data: profiles, loading: profilesLoading } = useQuery(ConnectableProfileSchema, {
    where: { enabled: true }
  })
  const { data: waves } = useQuery(ConnectionWaveSchema, {})
  const { data: people } = useQuery(ProfileSchema, {})
  const { data: myProfiles } = useQuery(ConnectableProfileSchema, {
    where: { did: me as `did:key:${string}` }
  })

  const matches = useMemo<MatchListing[]>(() => {
    if (!me) return []

    const profileById = new Map<string, Row>()
    for (const profile of (profiles ?? []) as unknown as Row[]) {
      const id = str(profile.id)
      if (id) profileById.set(id, profile)
    }

    const personByDid = new Map<string, Row>()
    for (const person of (people ?? []) as unknown as Row[]) {
      const did = str(person.did)
      if (did) personByDid.set(did, person)
    }

    // Adjacency from the wave graph (people who have waved form edges).
    const edges: [string, string][] = []
    for (const wave of (waves ?? []) as unknown as Row[]) {
      const from = str(wave.fromDid)
      const to = str(wave.toDid)
      if (from && to) edges.push([from, to])
    }
    const adjacency = buildAdjacency(edges)
    const fofSet = new Set(friendsOfFriends(adjacency, me).map((entry) => entry.did))

    const myProfile = (myProfiles ?? [])[0] as unknown as Row | undefined

    const candidates: CandidateProfile[] = []
    for (const intentRow of (intents ?? []) as unknown as Row[]) {
      const profileId = str(intentRow.profile)
      const profile = profileId ? profileById.get(profileId) : undefined
      const did = profile ? str(profile.did) : undefined
      if (!profile || !did || did === me) continue
      candidates.push({
        did,
        affinityVector: str(profile.affinityVector),
        interests: strArray(profile.interests),
        geohashCell: str(profile.geohashCell),
        reach: (str(intentRow.reach) as IntentReach | undefined) ?? 'public',
        source: fofSet.has(did) ? 'local' : 'hub'
      })
    }

    const ranked = rankMatches({
      me: {
        did: me,
        affinityVector: myProfile ? str(myProfile.affinityVector) : undefined,
        interests: myProfile ? strArray(myProfile.interests) : [],
        geohashCell: myProfile ? str(myProfile.geohashCell) : undefined
      },
      candidates,
      adjacency,
      intent
    })

    return ranked.map((match) => {
      const person = personByDid.get(match.did)
      return {
        ...match,
        displayName: (person && str(person.displayName)) ?? `${match.did.slice(0, 16)}…`,
        handle: person ? str(person.handle) : undefined
      }
    })
  }, [me, intents, profiles, waves, people, myProfiles, intent])

  return { matches, loading: intentsLoading || profilesLoading }
}

export interface WaveController {
  wave: (toDid: string, intent: ConnectionIntentKind) => Promise<{ matched: boolean }>
}

export function useWave(): WaveController {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const me = authorDID ?? ''
  const { data: waves } = useQuery(ConnectionWaveSchema, {})

  const wave = useCallback(
    async (toDid: string, intent: ConnectionIntentKind) => {
      if (!bridge || !me || toDid === me) return { matched: false }

      const commitment = waveCommitment({
        fromDid: me,
        toDid,
        intentKind: intent,
        salt: [me, toDid].sort().join(':')
      })

      // Find an existing reverse wave (the other side already waved at me).
      const reverse = ((waves ?? []) as unknown as Row[]).find(
        (row) =>
          isMutualPair(
            { fromDid: me, toDid, intentKind: intent },
            {
              fromDid: str(row.fromDid) ?? '',
              toDid: str(row.toDid) ?? '',
              intentKind: (str(row.intentKind) as ConnectionIntentKind) ?? intent
            }
          )
      )

      const matched = reverse !== undefined

      await bridge.create(ConnectionWaveSchema, {
        fromDid: me as `did:key:${string}`,
        toDid: toDid as `did:key:${string}`,
        intentKind: intent,
        commitment,
        status: matched ? 'mutual' : 'pending'
      })

      if (matched) {
        const { channelId } = await ensureDmChannel(bridge, [me, toDid])
        const card = buildIntroCard({ intent, sharedInterests: [] })
        await bridge.update(String(reverse.id), { status: 'mutual' })
        void channelId
        void card
      }

      return { matched }
    },
    [bridge, me, waves]
  )

  return { wave }
}
