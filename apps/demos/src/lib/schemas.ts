/**
 * Demo schemas — each picks its sync lane deliberately (exploration 0314):
 *
 * - DemoRoom carries a Y.Doc; its Awareness is the ephemeral lane for
 *   cursors and live positions (nothing persisted).
 * - C4Move rides the persisted change log ON PURPOSE: a Connect Four game is
 *   ~40 small moves, each signed and hash-chained — cheat-evident history.
 *   The board itself is NEVER stored; it's a deterministic fold over moves.
 * - DemoTodo is ordinary structured data (useQuery/useMutate).
 *
 * The anti-pattern to avoid: driving high-frequency state through
 * useMutate — that's what bloated the change log in exploration 0249.
 */
import { checkbox, defineSchema, number, text } from '@xnetjs/data'
import { presets } from '@xnetjs/data/auth'

const NAMESPACE = 'xnet://demos.xnet.fyi/'

export const DemoRoom = defineSchema({
  name: 'DemoRoom',
  namespace: NAMESPACE,
  properties: {
    title: text({})
  },
  document: 'yjs',
  authorization: presets.open()
})

export const C4Move = defineSchema({
  name: 'C4Move',
  namespace: NAMESPACE,
  properties: {
    room: text({ required: true }),
    seq: number({ required: true }),
    column: number({ required: true })
  },
  // Moves are immutable creates: anyone may read, only the author ever writes.
  authorization: presets.publicRead()
})

export const DemoTodo = defineSchema({
  name: 'DemoTodo',
  namespace: NAMESPACE,
  properties: {
    room: text({ required: true }),
    title: text({ required: true }),
    done: checkbox({})
  },
  // Wiki-style: anyone in the room can toggle anyone's todo.
  authorization: presets.open()
})
