import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBody, MARKER } from '../comment.mjs'

const BASE = 'https://xnet.fyi/pr/7/visuals'

test('empty manifest yields the "no differences" body with the marker', () => {
  const body = buildBody({ stories: [], routes: [], flows: [] }, { baseUrl: BASE })
  assert.ok(body.startsWith(MARKER))
  assert.match(body, /No visual differences detected/)
})

test('unchanged stills are not rendered', () => {
  const body = buildBody(
    {
      stories: [{ id: 'a', title: 'A', name: 'X', status: 'unchanged', ssim: 1 }],
      routes: [],
      flows: []
    },
    { baseUrl: BASE }
  )
  assert.match(body, /No visual differences detected/)
})

test('a changed story renders before/after/diff images by URL', () => {
  const body = buildBody(
    {
      stories: [
        {
          id: 'ui-button--default',
          title: 'UI/Button',
          name: 'Default',
          status: 'changed',
          ssim: 0.96,
          before: 'before/stories/ui-button--default.png',
          after: 'stories/ui-button--default.png',
          diff: 'diff/stories/ui-button--default.png'
        }
      ],
      routes: [],
      flows: []
    },
    { baseUrl: BASE }
  )
  assert.match(body, /UI\/Button — Default/)
  assert.match(body, /before \| after \| diff/)
  assert.ok(body.includes(`${BASE}/stories/ui-button--default.png`))
  assert.ok(body.includes(`${BASE}/diff/stories/ui-button--default.png`))
  assert.match(body, /SSIM 0\.960/)
})

test('a new still renders a single image and the 🆕 marker', () => {
  const body = buildBody(
    {
      stories: [{ id: 'x', title: 'X', name: 'Y', status: 'new', after: 'stories/x.png' }],
      routes: [],
      flows: []
    },
    { baseUrl: BASE }
  )
  assert.match(body, /🆕/)
  assert.ok(body.includes(`${BASE}/stories/x.png`))
})

test('a flow renders the gif inline and links the mp4', () => {
  const body = buildBody(
    {
      stories: [],
      routes: [],
      flows: [
        {
          id: 'create-page',
          label: 'Create a page',
          gif: 'flows/create-page.gif',
          mp4: 'flows/create-page.mp4'
        }
      ]
    },
    { baseUrl: BASE }
  )
  assert.ok(body.includes(`${BASE}/flows/create-page.gif`))
  assert.match(body, /Watch MP4/)
})
