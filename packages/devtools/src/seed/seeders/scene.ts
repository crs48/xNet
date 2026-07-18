/**
 * Scene seeder (exploration 0352) — a scene, not a corp.
 *
 * "Night Bloom Records" is a small record-archiving collective: crates as a
 * database, liner notes as pages, a pressing-quality checklist the members
 * hold each other to. It demonstrates the same primitives as the Acme Inc
 * profile through a community fiction — the demo's answer to docs/VIBE.md's
 * "vibe belongs to the scene". Acme stays alongside for business evaluation;
 * this space shows what a niche that loves its subject looks like on xNet.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { FolderSchema, PageSchema, SpaceMembershipSchema, SpaceSchema } from '@xnetjs/data'
import { buildRichPageDoc, type RichBlock } from '../docs/rich-pages'
import { seedId } from '../seed-ids'
import { databaseDrafts, DATABASE_SCHEMA_IDS, databaseId } from './database-drafts'

export const SCENE_SPACE_ID = seedId('space', 'night-bloom')
const sceneFolderId = seedId('folder', 'night-bloom')
const CRATES_SLUG = 'crates'

export const sceneSeeder: SeederModule = {
  domain: 'scene',
  label: 'Scene — Night Bloom Records',
  schemaIds: [
    SpaceSchema._schemaId,
    SpaceMembershipSchema._schemaId,
    FolderSchema._schemaId,
    PageSchema._schemaId,
    ...DATABASE_SCHEMA_IDS
  ],
  seed: ({ authorDID, people, fixtures }) => {
    const drafts: DeterministicNodeImportDraft[] = []

    // ─── The scene: a community space with its own colour ────────────────
    drafts.push({
      id: SCENE_SPACE_ID,
      schemaId: SpaceSchema._schemaId,
      properties: {
        name: 'Night Bloom Records',
        kind: 'community',
        visibility: 'private',
        owners: [authorDID],
        description:
          'A small record-archiving collective. Crates, liner notes, and a ' +
          'quality bar we hold together.',
        icon: '🌸',
        color: 'pink'
      }
    })
    drafts.push({
      id: seedId('membership', SCENE_SPACE_ID, authorDID),
      schemaId: SpaceMembershipSchema._schemaId,
      properties: { space: SCENE_SPACE_ID, member: authorDID, role: 'owner' }
    })
    // Every demo person is in the scene — everyone is doing something.
    people.forEach((person, i) => {
      drafts.push({
        id: seedId('membership', SCENE_SPACE_ID, person.did),
        schemaId: SpaceMembershipSchema._schemaId,
        properties: {
          space: SCENE_SPACE_ID,
          member: person.did,
          role: i === 0 ? 'admin' : 'member'
        }
      })
    })

    drafts.push({
      id: sceneFolderId,
      schemaId: FolderSchema._schemaId,
      properties: { name: 'Night Bloom', icon: '🌸' }
    })

    // ─── The crates: one database, tended like a record store ────────────
    drafts.push(
      ...databaseDrafts({
        slug: CRATES_SLUG,
        title: 'Crates',
        icon: '🎵',
        space: SCENE_SPACE_ID,
        folder: sceneFolderId,
        defaultView: 'table',
        fields: [
          { key: 'release', name: 'Release', type: 'text', isTitle: true, width: 240 },
          { key: 'artist', name: 'Artist', type: 'text', width: 180 },
          {
            key: 'format',
            name: 'Format',
            type: 'select',
            options: [
              { key: 'lp', name: 'LP', color: 'purple' },
              { key: 'ep', name: 'EP', color: 'blue' },
              { key: 'seven', name: '7"', color: 'green' },
              { key: 'tape', name: 'Tape', color: 'orange' }
            ]
          },
          {
            key: 'condition',
            name: 'Condition',
            type: 'select',
            options: [
              { key: 'mint', name: 'Mint', color: 'green' },
              { key: 'vg', name: 'VG+', color: 'blue' },
              { key: 'good', name: 'Good', color: 'yellow' },
              { key: 'rough', name: 'Rough but loved', color: 'red' }
            ]
          },
          { key: 'year', name: 'Year', type: 'number', width: 90 },
          { key: 'spinDate', name: 'Next listening night', type: 'date', width: 160 },
          { key: 'notes', name: 'Notes', type: 'text', width: 280 }
        ],
        rows: [
          {
            release: 'Midnight Garden EP',
            artist: 'The Night Blooms',
            format: 'ep',
            condition: 'mint',
            year: 2019,
            spinDate: '2026-08-07',
            notes: 'First pressing, translucent pink. The one that named the scene.'
          },
          {
            release: 'Sodium Light',
            artist: 'Vera Lux',
            format: 'lp',
            condition: 'vg',
            year: 1987,
            spinDate: '2026-08-14',
            notes: 'Found in a Rotterdam flea market. Sleeve worn, groove perfect.'
          },
          {
            release: 'Petrichor / Bloom',
            artist: 'Greenhouse Choir',
            format: 'seven',
            condition: 'good',
            year: 2003,
            spinDate: '2026-08-21',
            notes: 'B-side is the keeper. Needs a rip before it wears further.'
          },
          {
            release: 'Field Recordings, Vol. 3',
            artist: 'Anonymous',
            format: 'tape',
            condition: 'rough',
            year: 1994,
            notes: 'Dawn chorus + tram bells. Digitize first, argue about provenance later.'
          }
        ],
        views: [
          {
            slug: 'table',
            name: 'All crates',
            type: 'table',
            sorts: [{ key: 'year', direction: 'asc' }]
          },
          {
            slug: 'by-format',
            name: 'By format',
            type: 'board',
            groupByKey: 'format',
            colorByKey: 'condition'
          },
          {
            slug: 'listening-nights',
            name: 'Listening nights',
            type: 'calendar',
            dateKey: 'spinDate',
            colorByKey: 'format'
          }
        ]
      })
    )

    // ─── Liner notes: a page that loves its subject ───────────────────────
    const linerId = seedId('page', 'scene', 'liner-notes')
    drafts.push({
      id: linerId,
      schemaId: PageSchema._schemaId,
      properties: {
        title: 'Liner Notes — Midnight Garden EP',
        icon: '🌙',
        space: SCENE_SPACE_ID,
        folder: sceneFolderId,
        tags: [fixtures.tag('docs')]
      }
    })
    const linerBlocks: RichBlock[] = [
      { kind: 'h', level: 1, text: 'Liner Notes — Midnight Garden EP' },
      {
        kind: 'quote',
        text: 'Four tracks recorded in a greenhouse after closing time, one microphone, no overdubs.'
      },
      {
        kind: 'p',
        text:
          'What makes this pressing special is the room: you can hear the glass ' +
          'flex when the bass comes in on track two. The scene keeps the master ' +
          'rip alongside these notes so the context travels with the music.'
      },
      { kind: 'h', level: 2, text: 'Track notes' },
      {
        kind: 'bullets',
        items: [
          'Night Bloom — the title track; listen for the watering can at 2:14',
          'Sodium — a Vera Lux cover, slowed to greenhouse tempo',
          'Petrichor — the crowd favourite at listening nights',
          'Last Tram Home — field recording outro, see Field Recordings Vol. 3'
        ]
      },
      {
        kind: 'callout',
        type: 'info',
        text: 'Next listening night: first Friday of the month. Bring one record and one story.'
      }
    ]

    // ─── The quality bar: cultural, held by people, never a score ─────────
    const checklistId = seedId('page', 'scene', 'pressing-checklist')
    drafts.push({
      id: checklistId,
      schemaId: PageSchema._schemaId,
      properties: {
        title: 'Pressing-Quality Checklist',
        icon: '✅',
        space: SCENE_SPACE_ID,
        folder: sceneFolderId,
        tags: [fixtures.tag('docs')]
      }
    })
    const checklistBlocks: RichBlock[] = [
      { kind: 'h', level: 1, text: 'Pressing-Quality Checklist' },
      {
        kind: 'p',
        text:
          'Before a rip goes in the crates, it passes this list. The bar is ' +
          'high because we care, not because anyone keeps score.'
      },
      {
        kind: 'tasks',
        items: [
          { text: 'Clean transfer — no clipping, no lossy source', checked: true },
          { text: 'Sleeve scanned front and back', checked: true },
          { text: 'Liner notes page written or linked', checked: false },
          { text: 'Provenance noted (where found, prior owners if known)', checked: false }
        ]
      },
      {
        kind: 'callout',
        type: 'warning',
        text: 'If a better transfer arrives later, it replaces this one — thank the contributor, keep both stories.'
      }
    ]

    return {
      drafts,
      docs: [
        {
          nodeId: linerId,
          build: () =>
            buildRichPageDoc(
              linerId,
              PageSchema._schemaId,
              'Liner Notes — Midnight Garden EP',
              '🌙',
              linerBlocks
            )
        },
        {
          nodeId: checklistId,
          build: () =>
            buildRichPageDoc(
              checklistId,
              PageSchema._schemaId,
              'Pressing-Quality Checklist',
              '✅',
              checklistBlocks
            )
        }
      ]
    }
  }
}

/** Stable id of the scene's crates database (for cross-links from other seeders). */
export const sceneCratesDatabaseId = (): string => databaseId(CRATES_SLUG)
