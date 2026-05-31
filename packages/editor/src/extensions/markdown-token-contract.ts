/**
 * @xnetjs/editor - Markdown token editing contract
 *
 * Defines the source-token behavior that live Markdown editing must preserve.
 */

export type MarkdownTokenKind =
  | 'heading'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'codeFence'
  | 'inlineMark'

export type MarkdownTokenRevealPolicy =
  | 'virtualPrefix'
  | 'activeBlockSource'
  | 'inlineBoundaryReveal'
  | 'sourceModeOnly'

export type MarkdownTokenBehavior =
  | 'inputRule'
  | 'boundaryReveal'
  | 'backspaceStep'
  | 'undoableStep'
  | 'compositionSafe'
  | 'clipboardRoundTrip'

export type MarkdownTokenTestCase = {
  readonly id: string
  readonly token: MarkdownTokenKind
  readonly fixture: string
  readonly expectation: string
  readonly status: 'covered' | 'planned'
}

export type MarkdownTokenContract = {
  readonly kind: MarkdownTokenKind
  readonly label: string
  readonly syntax: readonly string[]
  readonly nodeNames: readonly string[]
  readonly revealPolicy: MarkdownTokenRevealPolicy
  readonly behaviors: readonly MarkdownTokenBehavior[]
  readonly backspaceSteps: readonly string[]
  readonly testIds: readonly string[]
}

export const MARKDOWN_TOKEN_CONTRACTS = [
  {
    kind: 'heading',
    label: 'Heading source prefix',
    syntax: ['# ', '## ', '### ', '#### ', '##### ', '###### '],
    nodeNames: ['heading', 'paragraph'],
    revealPolicy: 'virtualPrefix',
    behaviors: [
      'inputRule',
      'backspaceStep',
      'undoableStep',
      'compositionSafe',
      'clipboardRoundTrip'
    ],
    backspaceSteps: ['H6 -> H5', 'H3 -> H2', 'H2 -> H1', 'H1 -> paragraph'],
    testIds: [
      'heading-input-h1',
      'heading-input-h2',
      'heading-input-h3',
      'heading-backspace-step',
      'heading-undo-redo'
    ]
  },
  {
    kind: 'blockquote',
    label: 'Blockquote source prefix',
    syntax: ['> '],
    nodeNames: ['blockquote', 'paragraph'],
    revealPolicy: 'virtualPrefix',
    behaviors: [
      'inputRule',
      'backspaceStep',
      'undoableStep',
      'compositionSafe',
      'clipboardRoundTrip'
    ],
    backspaceSteps: ['blockquote heading -> heading step', 'blockquote paragraph -> paragraph'],
    testIds: ['blockquote-input', 'blockquote-backspace-step']
  },
  {
    kind: 'bulletList',
    label: 'Bullet list marker',
    syntax: ['- ', '* '],
    nodeNames: ['bulletList', 'listItem', 'paragraph'],
    revealPolicy: 'virtualPrefix',
    behaviors: [
      'inputRule',
      'backspaceStep',
      'undoableStep',
      'compositionSafe',
      'clipboardRoundTrip'
    ],
    backspaceSteps: ['nested list item -> parent level', 'top-level list item -> paragraph'],
    testIds: ['bullet-input', 'bullet-backspace-step']
  },
  {
    kind: 'orderedList',
    label: 'Ordered list marker',
    syntax: ['1. '],
    nodeNames: ['orderedList', 'listItem', 'paragraph'],
    revealPolicy: 'virtualPrefix',
    behaviors: [
      'inputRule',
      'backspaceStep',
      'undoableStep',
      'compositionSafe',
      'clipboardRoundTrip'
    ],
    backspaceSteps: ['top-level ordered item -> paragraph'],
    testIds: ['ordered-input', 'ordered-backspace-step']
  },
  {
    kind: 'taskList',
    label: 'Task list checkbox marker',
    syntax: ['- [ ] ', '- [x] '],
    nodeNames: ['taskList', 'taskItem', 'paragraph'],
    revealPolicy: 'virtualPrefix',
    behaviors: [
      'inputRule',
      'backspaceStep',
      'undoableStep',
      'compositionSafe',
      'clipboardRoundTrip'
    ],
    backspaceSteps: ['top-level task item -> paragraph'],
    testIds: ['task-input', 'task-backspace-step']
  },
  {
    kind: 'codeFence',
    label: 'Code fence marker',
    syntax: ['```', '```typescript'],
    nodeNames: ['codeBlock', 'paragraph'],
    revealPolicy: 'activeBlockSource',
    behaviors: [
      'inputRule',
      'backspaceStep',
      'undoableStep',
      'compositionSafe',
      'clipboardRoundTrip'
    ],
    backspaceSteps: ['language fence -> plaintext fence', 'plaintext fence -> paragraphs'],
    testIds: ['code-fence-input', 'code-fence-backspace-step']
  },
  {
    kind: 'inlineMark',
    label: 'Inline mark delimiters',
    syntax: ['**bold**', '*italic*', '~~strike~~', '`code`'],
    nodeNames: ['text', 'bold', 'italic', 'strike', 'code'],
    revealPolicy: 'inlineBoundaryReveal',
    behaviors: ['inputRule', 'boundaryReveal', 'clipboardRoundTrip'],
    backspaceSteps: ['no delimiter Backspace interception in live mode'],
    testIds: ['inline-mark-boundary-reveal', 'inline-mark-selection-policy']
  }
] as const satisfies readonly MarkdownTokenContract[]

export const MARKDOWN_TOKEN_TEST_MATRIX = [
  {
    id: 'heading-input-h1',
    token: 'heading',
    fixture: '# ',
    expectation: 'Creates an H1 node without keeping literal # text.',
    status: 'covered'
  },
  {
    id: 'heading-input-h2',
    token: 'heading',
    fixture: '## ',
    expectation: 'Creates an H2 node without keeping literal ## text.',
    status: 'covered'
  },
  {
    id: 'heading-input-h3',
    token: 'heading',
    fixture: '### ',
    expectation: 'Creates an H3 node without keeping literal ### text.',
    status: 'covered'
  },
  {
    id: 'heading-backspace-step',
    token: 'heading',
    fixture: '### Heading text',
    expectation: 'Backspace demotes one # at a time before returning to paragraph.',
    status: 'covered'
  },
  {
    id: 'heading-undo-redo',
    token: 'heading',
    fixture: '### Heading text',
    expectation: 'Undo and redo restore one token step per command.',
    status: 'covered'
  },
  {
    id: 'blockquote-input',
    token: 'blockquote',
    fixture: '> ',
    expectation: 'Creates a blockquote without keeping literal > text.',
    status: 'covered'
  },
  {
    id: 'blockquote-backspace-step',
    token: 'blockquote',
    fixture: '> Quote text',
    expectation: 'Backspace unwraps the quote token at the first text position.',
    status: 'covered'
  },
  {
    id: 'bullet-input',
    token: 'bulletList',
    fixture: '- ',
    expectation: 'Creates a bullet list item with editable paragraph content.',
    status: 'covered'
  },
  {
    id: 'bullet-backspace-step',
    token: 'bulletList',
    fixture: '- Bullet text',
    expectation: 'Backspace lifts or exits the item without deleting content.',
    status: 'covered'
  },
  {
    id: 'ordered-input',
    token: 'orderedList',
    fixture: '1. ',
    expectation: 'Creates an ordered list item and preserves list numbering.',
    status: 'covered'
  },
  {
    id: 'ordered-backspace-step',
    token: 'orderedList',
    fixture: '1. Ordered text',
    expectation: 'Backspace exits the item without deleting content.',
    status: 'covered'
  },
  {
    id: 'task-input',
    token: 'taskList',
    fixture: '- [ ] ',
    expectation: 'Creates an unchecked task item with a keyboard reachable checkbox.',
    status: 'covered'
  },
  {
    id: 'task-backspace-step',
    token: 'taskList',
    fixture: '- [ ] Task text',
    expectation: 'Backspace exits the task item without deleting content.',
    status: 'covered'
  },
  {
    id: 'code-fence-input',
    token: 'codeFence',
    fixture: '```ts ',
    expectation: 'Creates a code block and stores the language separately.',
    status: 'covered'
  },
  {
    id: 'code-fence-backspace-step',
    token: 'codeFence',
    fixture: '```ts\\nconst value = 1\\n```',
    expectation: 'Backspace clears language before exiting the code block.',
    status: 'covered'
  },
  {
    id: 'inline-mark-boundary-reveal',
    token: 'inlineMark',
    fixture: '**bold**, *italic*, ~~strike~~, `code`',
    expectation:
      'Inline delimiters reveal at both active mark boundaries for bold, italic, strike, and code.',
    status: 'covered'
  },
  {
    id: 'inline-mark-selection-policy',
    token: 'inlineMark',
    fixture: '**bold**',
    expectation:
      'Inline delimiter widgets opt out of selection syncing and allow relaxed caret sides.',
    status: 'covered'
  }
] as const satisfies readonly MarkdownTokenTestCase[]

export function getMarkdownTokenContract(kind: MarkdownTokenKind): MarkdownTokenContract | null {
  return MARKDOWN_TOKEN_CONTRACTS.find((contract) => contract.kind === kind) ?? null
}
