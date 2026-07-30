import { describe, expect, it } from 'vitest'
import {
  blockInlineText,
  extractMentionDids,
  extractTagIds,
  getPageTasksSnapshot,
  mentionsFromDoc,
  pageTaskIdForBlock,
  tagsFromDoc,
  type BlockLike
} from './doc-utils'

const DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

function paragraph(content: unknown[]): BlockLike {
  return { id: 'p1', type: 'paragraph', props: {}, content, children: [] }
}

describe('mention extraction (0168 contract)', () => {
  it('extracts deduped DIDs from mention pills', () => {
    const blocks: BlockLike[] = [
      paragraph([
        { type: 'mention', props: { id: DID, label: 'Ada' } },
        { type: 'text', text: ' hi ' },
        { type: 'mention', props: { id: DID, label: 'Ada again' } }
      ])
    ]
    expect(extractMentionDids(blocks)).toEqual([DID])
    expect(mentionsFromDoc(blocks)).toEqual({ dids: [DID] })
  })

  it('ignores non-DID mention ids and body text @s', () => {
    const blocks: BlockLike[] = [
      paragraph([
        { type: 'mention', props: { id: 'not-a-did', label: 'X' } },
        { type: 'text', text: '@ada in plain text' }
      ])
    ]
    expect(extractMentionDids(blocks)).toEqual([])
    expect(mentionsFromDoc(blocks)).toBeUndefined()
  })

  it('finds mentions in nested children blocks', () => {
    const blocks: BlockLike[] = [
      {
        id: 'outer',
        type: 'bulletListItem',
        content: [],
        children: [paragraph([{ type: 'mention', props: { id: DID, label: 'Ada' } }])]
      }
    ]
    expect(extractMentionDids(blocks)).toEqual([DID])
  })
})

describe('hashtag extraction (0169 contract)', () => {
  it('extracts deduped tag ids in walk order', () => {
    const blocks: BlockLike[] = [
      paragraph([
        { type: 'hashtag', props: { id: 'tag-b', name: 'beta' } },
        { type: 'hashtag', props: { id: 'tag-a', name: 'alpha' } },
        { type: 'hashtag', props: { id: 'tag-b', name: 'beta' } }
      ])
    ]
    expect(extractTagIds(blocks)).toEqual(['tag-b', 'tag-a'])
    expect(tagsFromDoc([])).toBeUndefined()
  })
})

describe('blockInlineText', () => {
  it('renders chips as readable text', () => {
    const block = paragraph([
      { type: 'text', text: 'ask ' },
      { type: 'mention', props: { id: DID, label: 'Ada' } },
      { type: 'text', text: ' re ' },
      { type: 'hashtag', props: { id: 't', name: 'urgent' } },
      { type: 'wikilink', props: { href: 'n1', title: 'Roadmap' } }
    ])
    expect(blockInlineText(block)).toBe('ask @Ada re #urgentRoadmap')
  })
})

describe('page task snapshots (block-id keyed, 0312)', () => {
  it('snapshots checkListItem blocks with stable derived task ids', () => {
    const blocks: BlockLike[] = [
      {
        id: 'blk-1',
        type: 'checkListItem',
        props: { checked: true },
        content: [{ type: 'text', text: 'Ship it' }],
        children: [
          {
            id: 'blk-2',
            type: 'checkListItem',
            props: { checked: false },
            content: [{ type: 'text', text: 'Write tests' }],
            children: []
          }
        ]
      }
    ]
    const tasks = getPageTasksSnapshot(blocks, 'page-9')
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({
      taskId: pageTaskIdForBlock('page-9', 'blk-1'),
      blockId: 'blk-1',
      title: 'Ship it',
      completed: true,
      parentTaskId: null
    })
    expect(tasks[1]).toMatchObject({
      taskId: pageTaskIdForBlock('page-9', 'blk-2'),
      title: 'Write tests',
      completed: false,
      parentTaskId: pageTaskIdForBlock('page-9', 'blk-1')
    })
    expect(tasks[0].sortKey < tasks[1].sortKey).toBe(true)
  })

  it('returns an empty list for docs without checklists', () => {
    expect(getPageTasksSnapshot([paragraph([{ type: 'text', text: 'x' }])], 'p')).toEqual([])
  })
})
