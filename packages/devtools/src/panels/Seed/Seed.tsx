/**
 * Seed panel - Create sample data for testing
 *
 * Provides buttons to quickly seed the database with:
 * - A sample Page with all supported block types
 * - A sample Database with all supported property types
 */

import { CommentSchema, DatabaseSchema, PageSchema } from '@xnet/data'
import { useState } from 'react'
import * as Y from 'yjs'
import { useDevTools } from '../../provider/useDevTools'

const PAGE_SCHEMA_ID = PageSchema._schemaId
const DATABASE_SCHEMA_ID = DatabaseSchema._schemaId
const COMMENT_SCHEMA_ID = CommentSchema._schemaId

// Generate a simple ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/** Encode a Uint8Array to Base64 string */
function uint8ArrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
}

/**
 * Create a TextAnchor JSON string for a text range within a Y.XmlFragment.
 * Walks the Yjs tree to find the actual Y.XmlText node containing the target
 * text, then creates RelativePositions on that text node — matching what
 * y-tiptap's absolutePositionToRelativePosition does internally (it walks
 * into child nodes and creates positions on the Y.XmlText node, not the
 * root fragment).
 *
 * @param fragment - The Y.XmlFragment containing the document content
 * @param searchText - The text substring to anchor to
 * @param occurrence - Which occurrence to match (0-based, default 0)
 * @returns JSON-encoded TextAnchor, or null if text not found
 */
function createTextAnchor(
  fragment: Y.XmlFragment,
  searchText: string,
  occurrence = 0
): string | null {
  let found = 0

  // Walk the tree to find the Y.XmlText node containing the search text
  function findTextNode(
    el: Y.XmlElement | Y.XmlFragment
  ): { textNode: Y.XmlText; offsetInNode: number } | null {
    const children =
      el instanceof Y.XmlFragment && !(el instanceof Y.XmlElement)
        ? el.toArray()
        : (el as Y.XmlElement).toArray()
    for (const child of children) {
      if (child instanceof Y.XmlElement) {
        const result = findTextNode(child)
        if (result) return result
      } else if (child instanceof Y.XmlText) {
        const text = child.toString()
        const idx = text.indexOf(searchText)
        if (idx !== -1 && found === occurrence) {
          return { textNode: child, offsetInNode: idx }
        }
        if (idx !== -1) found++
      }
    }
    return null
  }

  const result = findTextNode(fragment)
  if (!result) return null

  // Create RelativePositions directly on the Y.XmlText node.
  // y-tiptap's absolutePositionToRelativePosition walks the tree and creates
  // positions on the text node it reaches, not on the root fragment. The assoc
  // parameter -1 matches what y-tiptap uses for left-biased positions.
  const startRelPos = Y.createRelativePositionFromTypeIndex(
    result.textNode,
    result.offsetInNode,
    -1
  )
  const endRelPos = Y.createRelativePositionFromTypeIndex(
    result.textNode,
    result.offsetInNode + searchText.length,
    -1
  )

  return JSON.stringify({
    startRelative: uint8ArrayToBase64(Y.encodeRelativePosition(startRelPos)),
    endRelative: uint8ArrayToBase64(Y.encodeRelativePosition(endRelPos)),
    quotedText: searchText
  })
}

export function Seed() {
  const { store, yDocRegistry, documentHistory } = useDevTools()
  const [status, setStatus] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const createSamplePage = async () => {
    if (!store) {
      setStatus('Error: Store not connected')
      return
    }

    setIsCreating(true)
    setStatus('Creating sample page...')

    try {
      // Create the page node
      const node = await store.create({
        schemaId: PAGE_SCHEMA_ID,
        properties: {
          title: 'Sample Page - All Block Types',
          icon: '📄'
        }
      })

      // Create a Y.Doc and populate with sample content
      const ydoc = new Y.Doc({ guid: node.id, gc: false })

      // The RichTextEditor uses 'content' as the fragment name
      const fragment = ydoc.getXmlFragment('content')

      ydoc.transact(() => {
        // Heading 1
        const h1 = new Y.XmlElement('heading')
        h1.setAttribute('level', '1')
        h1.insert(0, [new Y.XmlText('Heading 1 - Main Title')])
        fragment.push([h1])

        // Paragraph
        const para1 = new Y.XmlElement('paragraph')
        para1.insert(0, [
          new Y.XmlText(
            'This is a sample page demonstrating all supported block types in the xNet editor.'
          )
        ])
        fragment.push([para1])

        // Heading 2
        const h2 = new Y.XmlElement('heading')
        h2.setAttribute('level', '2')
        h2.insert(0, [new Y.XmlText('Heading 2 - Section')])
        fragment.push([h2])

        // Heading 3
        const h3 = new Y.XmlElement('heading')
        h3.setAttribute('level', '3')
        h3.insert(0, [new Y.XmlText('Heading 3 - Subsection')])
        fragment.push([h3])

        // Bullet List
        const bulletList = new Y.XmlElement('bulletList')
        const bulletItems: Y.XmlElement[] = []
        for (const text of ['First bullet point', 'Second bullet point', 'Third bullet point']) {
          const li = new Y.XmlElement('listItem')
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(text)])
          li.insert(0, [p])
          bulletItems.push(li)
        }
        bulletList.insert(0, bulletItems)
        fragment.push([bulletList])

        // Numbered List
        const orderedList = new Y.XmlElement('orderedList')
        const orderedItems: Y.XmlElement[] = []
        for (const text of ['First numbered item', 'Second numbered item']) {
          const li = new Y.XmlElement('listItem')
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(text)])
          li.insert(0, [p])
          orderedItems.push(li)
        }
        orderedList.insert(0, orderedItems)
        fragment.push([orderedList])

        // Task List
        const taskList = new Y.XmlElement('taskList')
        const tasks = [
          { text: 'Unchecked task', checked: false },
          { text: 'Completed task', checked: true }
        ]
        const taskItems: Y.XmlElement[] = []
        for (const { text, checked } of tasks) {
          const task = new Y.XmlElement('taskItem')
          task.setAttribute('checked', String(checked))
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(text)])
          task.insert(0, [p])
          taskItems.push(task)
        }
        taskList.insert(0, taskItems)
        fragment.push([taskList])

        // Blockquote
        const quote = new Y.XmlElement('blockquote')
        const quotePara = new Y.XmlElement('paragraph')
        quotePara.insert(0, [
          new Y.XmlText('This is a blockquote. It can contain multiple lines of quoted text.')
        ])
        quote.insert(0, [quotePara])
        fragment.push([quote])

        // Code Block
        const codeBlock = new Y.XmlElement('codeBlock')
        codeBlock.setAttribute('language', 'typescript')
        codeBlock.insert(0, [
          new Y.XmlText('function greet(name: string): string {\n  return `Hello, ${name}!`;\n}')
        ])
        fragment.push([codeBlock])

        // Horizontal Rule
        const hr = new Y.XmlElement('horizontalRule')
        fragment.push([hr])

        // Callouts (all types)
        const calloutTypes = [
          { type: 'info', text: 'This is an info callout - use it for general information.' },
          { type: 'tip', text: 'This is a tip callout - use it for helpful suggestions.' },
          { type: 'warning', text: 'This is a warning callout - use it for important notices.' },
          { type: 'caution', text: 'This is a caution callout - use it for dangerous operations.' },
          { type: 'note', text: 'This is a note callout - use it for side notes.' }
        ]

        for (const { type, text } of calloutTypes) {
          const callout = new Y.XmlElement('callout')
          callout.setAttribute('type', type)
          const calloutPara = new Y.XmlElement('paragraph')
          calloutPara.insert(0, [new Y.XmlText(text)])
          callout.insert(0, [calloutPara])
          fragment.push([callout])
        }

        // Toggle (collapsible section) - uses 'toggle' node name to match ToggleExtension
        const toggle = new Y.XmlElement('toggle')
        toggle.setAttribute('summary', 'Click to expand this toggle section')
        toggle.setAttribute('open', 'true')
        const contentPara = new Y.XmlElement('paragraph')
        contentPara.insert(0, [
          new Y.XmlText(
            'This is the hidden content inside the toggle. It can contain any other block types.'
          )
        ])
        toggle.insert(0, [contentPara])
        fragment.push([toggle])

        // Mermaid diagram
        const mermaidHeading = new Y.XmlElement('heading')
        mermaidHeading.setAttribute('level', '2')
        mermaidHeading.insert(0, [new Y.XmlText('Mermaid Diagrams')])
        fragment.push([mermaidHeading])

        const mermaidIntro = new Y.XmlElement('paragraph')
        mermaidIntro.insert(0, [
          new Y.XmlText(
            'Mermaid diagrams render flowcharts, sequence diagrams, and more from text.'
          )
        ])
        fragment.push([mermaidIntro])

        const mermaid = new Y.XmlElement('mermaid')
        mermaid.setAttribute(
          'code',
          `flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
    C --> E[Ship it!]`
        )
        mermaid.setAttribute('theme', 'default')
        fragment.push([mermaid])

        // Placeholder paragraphs for media types
        const placeholders = [
          '[Image placeholder - use /image command to insert]',
          '[File placeholder - use /file command to attach]',
          '[Embed placeholder - use /embed command for YouTube, Spotify, etc.]'
        ]
        for (const text of placeholders) {
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(text)])
          fragment.push([p])
        }

        // Also populate the meta map with title
        const metaMap = ydoc.getMap('meta')
        metaMap.set('_schemaId', PAGE_SCHEMA_ID)
        metaMap.set('title', 'Sample Page - All Block Types')
        metaMap.set('icon', '📄')
      })

      // Save the document content
      const content = Y.encodeStateAsUpdate(ydoc)
      await store.setDocumentContent(node.id, content)

      // Capture Yjs snapshot for document time travel
      if (documentHistory) {
        await documentHistory.forceCapture(node.id, ydoc)
      }

      // Register with devtools for inspection
      yDocRegistry.register(node.id, ydoc)

      // ─── Create sample comments ──────────────────────────────────────
      // Comments are separate nodes that reference text positions via Yjs
      // RelativePositions. The editor's restoreCommentMarks() will apply
      // the visual highlights when the page is opened.

      const pageSchemaId = PAGE_SCHEMA_ID
      const commentSchemaId = COMMENT_SCHEMA_ID
      let rootComment: { id: string } | null = null

      // Comment 1: On the intro paragraph text (active, with a reply thread)
      const anchor1 = createTextAnchor(fragment, 'all supported block types')
      if (anchor1) {
        rootComment = await store.create({
          schemaId: commentSchemaId,
          properties: {
            target: node.id,
            targetSchema: pageSchemaId,
            anchorType: 'text',
            anchorData: anchor1,
            content:
              'This page is a great reference for testing. Should we add an embed example too?',
            resolved: false,
            edited: false
          }
        })

        // Reply to comment 1
        await store.create({
          schemaId: commentSchemaId,
          properties: {
            target: node.id,
            targetSchema: pageSchemaId,
            inReplyTo: rootComment.id,
            anchorType: 'text',
            anchorData: anchor1,
            content: 'Good idea! The embed placeholder at the bottom covers that for now.',
            resolved: false,
            edited: false
          }
        })
      }

      // Comment 2: On the blockquote text (active, standalone)
      const anchor2 = createTextAnchor(fragment, 'multiple lines of quoted text')
      if (anchor2) {
        await store.create({
          schemaId: commentSchemaId,
          properties: {
            target: node.id,
            targetSchema: pageSchemaId,
            anchorType: 'text',
            anchorData: anchor2,
            content: 'Consider adding a multi-paragraph blockquote example here.',
            resolved: false,
            edited: false
          }
        })
      }

      // Comment 3: On a callout (resolved thread)
      const anchor3 = createTextAnchor(fragment, 'important notices')
      if (anchor3) {
        await store.create({
          schemaId: commentSchemaId,
          properties: {
            target: node.id,
            targetSchema: pageSchemaId,
            anchorType: 'text',
            anchorData: anchor3,
            content: 'Typo fixed in the warning callout text.',
            resolved: true,
            edited: false
          }
        })
      }

      // ─── Create history (multiple updates) ─────────────────────────
      // These updates build a realistic change history for testing the
      // History devtools panel: timeline scrubbing, diff, blame, etc.

      await store.update(node.id, {
        properties: { title: 'Sample Page - Draft' }
      })

      await store.update(node.id, {
        properties: { icon: '📝' }
      })

      await store.update(node.id, {
        properties: { title: 'Sample Page - All Block Types' }
      })

      await store.update(node.id, {
        properties: { icon: '📄' }
      })

      // ─── Comment history (edits, resolve, reopen) ──────────────────
      // Give the first root comment a realistic edit history
      if (anchor1 && rootComment) {
        // Edit the root comment
        await store.update(rootComment.id, {
          properties: {
            content:
              'This page is a great reference for testing! Should we add an embed example too? (edited for clarity)',
            edited: true,
            editedAt: Date.now()
          }
        })
      }

      // Resolve then reopen comment 2 to show resolve/reopen history
      if (anchor2) {
        const comment2List = (await store.list()).filter(
          (n) =>
            n.properties?.target === node.id &&
            n.properties?.anchorData === anchor2 &&
            n.schemaId === commentSchemaId
        )
        if (comment2List.length > 0) {
          const c2 = comment2List[0]
          await store.update(c2.id, {
            properties: { resolved: true, resolvedAt: Date.now() }
          })
          await store.update(c2.id, {
            properties: { resolved: false, resolvedAt: null }
          })
        }
      }

      setStatus(`Created sample page: ${node.id} (5 changes + comment history)`)
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCreating(false)
    }
  }

  /**
   * Create two related databases: Projects and Tasks
   * - Projects has: name, status, priority, owner, tasks (relation to Tasks), budget, deadline
   * - Tasks has: title, status, priority, assignee, project (relation to Projects), due date, estimated hours, completed
   * - Rollup: Project shows task count and total estimated hours
   * - Formula: Tasks show days until due
   */
  const createRelatedDatabases = async () => {
    if (!store) {
      setStatus('Error: Store not connected')
      return
    }

    setIsCreating(true)
    setStatus('Creating related databases (Projects + Tasks)...')

    try {
      const now = Date.now()
      const DAY = 86400000

      // ─── Create Projects Database ─────────────────────────────────────
      const projectsDb = await store.create({
        schemaId: DATABASE_SCHEMA_ID,
        properties: {
          title: 'Projects',
          icon: '📁',
          defaultView: 'table'
        }
      })

      // ─── Create Tasks Database ────────────────────────────────────────
      const tasksDb = await store.create({
        schemaId: DATABASE_SCHEMA_ID,
        properties: {
          title: 'Tasks',
          icon: '✅',
          defaultView: 'table'
        }
      })

      // Pre-generate IDs for rows
      const projectIds = [generateId(), generateId(), generateId()]
      const taskIds = [
        generateId(),
        generateId(),
        generateId(),
        generateId(),
        generateId(),
        generateId(),
        generateId(),
        generateId()
      ]

      // ─── Setup Projects Y.Doc ─────────────────────────────────────────
      const projectsYdoc = new Y.Doc({ guid: projectsDb.id, gc: false })

      projectsYdoc.transact(() => {
        const dataMap = projectsYdoc.getMap('data')

        const columns = [
          { id: 'name', name: 'Project Name', type: 'text', isTitle: true },
          {
            id: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [
                { id: 'planning', name: 'Planning', color: 'gray' },
                { id: 'active', name: 'Active', color: 'blue' },
                { id: 'on_hold', name: 'On Hold', color: 'yellow' },
                { id: 'completed', name: 'Completed', color: 'green' }
              ]
            }
          },
          {
            id: 'priority',
            name: 'Priority',
            type: 'select',
            config: {
              options: [
                { id: 'low', name: 'Low', color: 'gray' },
                { id: 'medium', name: 'Medium', color: 'yellow' },
                { id: 'high', name: 'High', color: 'orange' },
                { id: 'critical', name: 'Critical', color: 'red' }
              ]
            }
          },
          { id: 'owner', name: 'Owner', type: 'person' },
          {
            id: 'tasks',
            name: 'Tasks',
            type: 'relation',
            config: { targetDatabase: tasksDb.id, allowMultiple: true }
          },
          {
            id: 'taskCount',
            name: 'Task Count',
            type: 'rollup',
            config: { relationColumn: 'tasks', targetColumn: 'title', aggregation: 'count' }
          },
          {
            id: 'totalHours',
            name: 'Total Hours',
            type: 'rollup',
            config: { relationColumn: 'tasks', targetColumn: 'estimatedHours', aggregation: 'sum' }
          },
          {
            id: 'budget',
            name: 'Budget',
            type: 'number',
            config: { format: 'currency', currency: 'USD' }
          },
          { id: 'deadline', name: 'Deadline', type: 'date' },
          {
            id: 'tags',
            name: 'Tags',
            type: 'multiSelect',
            config: {
              options: [
                { id: 'frontend', name: 'Frontend', color: 'blue' },
                { id: 'backend', name: 'Backend', color: 'green' },
                { id: 'design', name: 'Design', color: 'purple' },
                { id: 'devops', name: 'DevOps', color: 'orange' }
              ]
            }
          },
          { id: 'created', name: 'Created', type: 'created' },
          { id: 'updated', name: 'Updated', type: 'updated' }
        ]

        dataMap.set('columns', columns)

        const rows = [
          {
            id: projectIds[0],
            name: 'Website Redesign',
            status: 'active',
            priority: 'high',
            owner: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            tasks: [taskIds[0], taskIds[1], taskIds[2]],
            budget: 50000,
            deadline: '2025-03-31',
            tags: ['frontend', 'design'],
            created: now - DAY * 30,
            updated: now
          },
          {
            id: projectIds[1],
            name: 'API Migration',
            status: 'active',
            priority: 'critical',
            owner: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
            tasks: [taskIds[3], taskIds[4], taskIds[5]],
            budget: 75000,
            deadline: '2025-02-28',
            tags: ['backend', 'devops'],
            created: now - DAY * 45,
            updated: now - DAY * 2
          },
          {
            id: projectIds[2],
            name: 'Mobile App v2',
            status: 'planning',
            priority: 'medium',
            owner: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            tasks: [taskIds[6], taskIds[7]],
            budget: 120000,
            deadline: '2025-06-30',
            tags: ['frontend', 'backend', 'design'],
            created: now - DAY * 7,
            updated: now - DAY * 1
          }
        ]

        dataMap.set('rows', rows)

        // Views
        const columnIds = columns.map((c) => c.id)
        dataMap.set('tableView', {
          id: 'default-table',
          name: 'All Projects',
          type: 'table',
          visibleProperties: columnIds,
          propertyWidths: { name: 200, status: 120, priority: 120, tasks: 150, budget: 120 },
          sorts: [{ propertyId: 'priority', direction: 'desc' }]
        })

        dataMap.set('boardView', {
          id: 'board-by-status',
          name: 'By Status',
          type: 'board',
          visibleProperties: ['name', 'priority', 'owner', 'deadline'],
          groupByProperty: 'status'
        })

        // Meta
        const metaMap = projectsYdoc.getMap('meta')
        metaMap.set('_schemaId', DATABASE_SCHEMA_ID)
        metaMap.set('title', 'Projects')
        metaMap.set('icon', '📁')
      })

      // Save Projects doc
      await store.setDocumentContent(projectsDb.id, Y.encodeStateAsUpdate(projectsYdoc))
      if (documentHistory) await documentHistory.forceCapture(projectsDb.id, projectsYdoc)
      yDocRegistry.register(projectsDb.id, projectsYdoc)

      // ─── Setup Tasks Y.Doc ────────────────────────────────────────────
      const tasksYdoc = new Y.Doc({ guid: tasksDb.id, gc: false })

      tasksYdoc.transact(() => {
        const dataMap = tasksYdoc.getMap('data')

        const columns = [
          { id: 'title', name: 'Task', type: 'text', isTitle: true },
          {
            id: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [
                { id: 'todo', name: 'To Do', color: 'gray' },
                { id: 'in_progress', name: 'In Progress', color: 'blue' },
                { id: 'review', name: 'In Review', color: 'purple' },
                { id: 'done', name: 'Done', color: 'green' }
              ]
            }
          },
          {
            id: 'priority',
            name: 'Priority',
            type: 'select',
            config: {
              options: [
                { id: 'low', name: 'Low', color: 'gray' },
                { id: 'medium', name: 'Medium', color: 'yellow' },
                { id: 'high', name: 'High', color: 'orange' },
                { id: 'urgent', name: 'Urgent', color: 'red' }
              ]
            }
          },
          { id: 'assignee', name: 'Assignee', type: 'person' },
          {
            id: 'project',
            name: 'Project',
            type: 'relation',
            config: { targetDatabase: projectsDb.id, allowMultiple: false }
          },
          { id: 'dueDate', name: 'Due Date', type: 'date' },
          {
            id: 'estimatedHours',
            name: 'Est. Hours',
            type: 'number',
            config: { format: 'number', precision: 1 }
          },
          { id: 'completed', name: 'Completed', type: 'checkbox' },
          {
            id: 'labels',
            name: 'Labels',
            type: 'multiSelect',
            config: {
              options: [
                { id: 'bug', name: 'Bug', color: 'red' },
                { id: 'feature', name: 'Feature', color: 'blue' },
                { id: 'docs', name: 'Docs', color: 'gray' },
                { id: 'refactor', name: 'Refactor', color: 'purple' },
                { id: 'testing', name: 'Testing', color: 'green' }
              ]
            }
          },
          { id: 'url', name: 'Link', type: 'url' },
          { id: 'created', name: 'Created', type: 'created' },
          { id: 'updated', name: 'Updated', type: 'updated' }
        ]

        dataMap.set('columns', columns)

        const rows = [
          // Website Redesign tasks
          {
            id: taskIds[0],
            title: 'Design new homepage mockups',
            status: 'done',
            priority: 'high',
            assignee: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            project: [projectIds[0]],
            dueDate: '2025-02-01',
            estimatedHours: 16,
            completed: true,
            labels: ['feature', 'docs'],
            url: 'https://figma.com/file/abc123',
            created: now - DAY * 28,
            updated: now - DAY * 5
          },
          {
            id: taskIds[1],
            title: 'Implement responsive navigation',
            status: 'in_progress',
            priority: 'high',
            assignee: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
            project: [projectIds[0]],
            dueDate: '2025-02-15',
            estimatedHours: 24,
            completed: false,
            labels: ['feature'],
            url: '',
            created: now - DAY * 20,
            updated: now - DAY * 1
          },
          {
            id: taskIds[2],
            title: 'Fix mobile menu animation bug',
            status: 'todo',
            priority: 'medium',
            assignee: '',
            project: [projectIds[0]],
            dueDate: '2025-02-20',
            estimatedHours: 4,
            completed: false,
            labels: ['bug'],
            url: 'https://github.com/issues/456',
            created: now - DAY * 10,
            updated: now - DAY * 10
          },
          // API Migration tasks
          {
            id: taskIds[3],
            title: 'Document existing API endpoints',
            status: 'done',
            priority: 'high',
            assignee: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
            project: [projectIds[1]],
            dueDate: '2025-01-15',
            estimatedHours: 20,
            completed: true,
            labels: ['docs'],
            url: '',
            created: now - DAY * 40,
            updated: now - DAY * 25
          },
          {
            id: taskIds[4],
            title: 'Setup new GraphQL schema',
            status: 'in_progress',
            priority: 'urgent',
            assignee: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
            project: [projectIds[1]],
            dueDate: '2025-02-10',
            estimatedHours: 40,
            completed: false,
            labels: ['feature', 'refactor'],
            url: '',
            created: now - DAY * 30,
            updated: now
          },
          {
            id: taskIds[5],
            title: 'Write migration tests',
            status: 'review',
            priority: 'high',
            assignee: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            project: [projectIds[1]],
            dueDate: '2025-02-12',
            estimatedHours: 16,
            completed: false,
            labels: ['testing'],
            url: '',
            created: now - DAY * 15,
            updated: now - DAY * 2
          },
          // Mobile App v2 tasks
          {
            id: taskIds[6],
            title: 'Research competitor apps',
            status: 'in_progress',
            priority: 'medium',
            assignee: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            project: [projectIds[2]],
            dueDate: '2025-02-28',
            estimatedHours: 12,
            completed: false,
            labels: ['docs'],
            url: '',
            created: now - DAY * 5,
            updated: now - DAY * 1
          },
          {
            id: taskIds[7],
            title: 'Create wireframes',
            status: 'todo',
            priority: 'low',
            assignee: '',
            project: [projectIds[2]],
            dueDate: '2025-03-15',
            estimatedHours: 20,
            completed: false,
            labels: ['feature'],
            url: '',
            created: now - DAY * 3,
            updated: now - DAY * 3
          }
        ]

        dataMap.set('rows', rows)

        // Views
        const columnIds = columns.map((c) => c.id)
        dataMap.set('tableView', {
          id: 'default-table',
          name: 'All Tasks',
          type: 'table',
          visibleProperties: columnIds,
          propertyWidths: {
            title: 250,
            status: 120,
            priority: 100,
            assignee: 150,
            project: 150,
            dueDate: 120
          },
          sorts: [{ propertyId: 'dueDate', direction: 'asc' }]
        })

        dataMap.set('boardView', {
          id: 'board-by-status',
          name: 'Kanban',
          type: 'board',
          visibleProperties: ['title', 'priority', 'assignee', 'dueDate', 'labels'],
          groupByProperty: 'status'
        })

        dataMap.set('calendarView', {
          id: 'calendar-due',
          name: 'Calendar',
          type: 'calendar',
          visibleProperties: ['title', 'status', 'priority'],
          dateProperty: 'dueDate'
        })

        // Meta
        const metaMap = tasksYdoc.getMap('meta')
        metaMap.set('_schemaId', DATABASE_SCHEMA_ID)
        metaMap.set('title', 'Tasks')
        metaMap.set('icon', '✅')
      })

      // Save Tasks doc
      await store.setDocumentContent(tasksDb.id, Y.encodeStateAsUpdate(tasksYdoc))
      if (documentHistory) await documentHistory.forceCapture(tasksDb.id, tasksYdoc)
      yDocRegistry.register(tasksDb.id, tasksYdoc)

      // ─── Create comments ──────────────────────────────────────────────
      const commentSchemaId = COMMENT_SCHEMA_ID
      const dbSchemaId = DATABASE_SCHEMA_ID

      // Comment on Projects database
      await store.create({
        schemaId: commentSchemaId,
        properties: {
          target: projectsDb.id,
          targetSchema: dbSchemaId,
          anchorType: 'cell',
          anchorData: JSON.stringify({ rowId: projectIds[1], propertyKey: 'priority' }),
          content: 'This migration is blocking other work - keep it critical priority.',
          resolved: false,
          edited: false
        }
      })

      // Comment on Tasks database
      await store.create({
        schemaId: commentSchemaId,
        properties: {
          target: tasksDb.id,
          targetSchema: dbSchemaId,
          anchorType: 'row',
          anchorData: JSON.stringify({ rowId: taskIds[4] }),
          content: 'Need help with the resolver patterns here. Can we pair on this?',
          resolved: false,
          edited: false
        }
      })

      setStatus(
        `Created: Projects (${projectsDb.id.slice(0, 8)}...) with ${projectIds.length} projects, ` +
          `Tasks (${tasksDb.id.slice(0, 8)}...) with ${taskIds.length} tasks - fully linked via relations!`
      )
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCreating(false)
    }
  }

  const createSampleDatabase = async () => {
    if (!store) {
      setStatus('Error: Store not connected')
      return
    }

    setIsCreating(true)
    setStatus('Creating sample database...')

    try {
      // Create the database node
      const node = await store.create({
        schemaId: DATABASE_SCHEMA_ID,
        properties: {
          title: 'Sample Database - All Property Types',
          icon: '📊',
          defaultView: 'table'
        }
      })

      // Create Y.Doc for storing the database data
      const ydoc = new Y.Doc({ guid: node.id, gc: false })

      // Pre-generate row IDs so we can reference them in comment anchors
      const rowIds = [generateId(), generateId(), generateId(), generateId(), generateId()]

      ydoc.transact(() => {
        const dataMap = ydoc.getMap('data')

        // Define columns - one for each of the 15 usable property types
        // (excludes rollup and formula which are "not yet implemented")
        // Column names match the property type for easy identification
        const columns = [
          // Basic types (3)
          { id: 'text', name: 'text', type: 'text' },
          { id: 'number', name: 'number', type: 'number' },
          { id: 'checkbox', name: 'checkbox', type: 'checkbox' },

          // Temporal types (2)
          { id: 'date', name: 'date', type: 'date' },
          {
            id: 'dateRange',
            name: 'dateRange',
            type: 'dateRange'
          },

          // Selection types (2)
          {
            id: 'select',
            name: 'select',
            type: 'select',
            config: {
              options: [
                { id: 'opt_a', name: 'Option A', color: '#ef4444' },
                { id: 'opt_b', name: 'Option B', color: '#3b82f6' },
                { id: 'opt_c', name: 'Option C', color: '#22c55e' }
              ]
            }
          },
          {
            id: 'multiSelect',
            name: 'multiSelect',
            type: 'multiSelect',
            config: {
              options: [
                { id: 'tag_1', name: 'Tag 1', color: '#f59e0b' },
                { id: 'tag_2', name: 'Tag 2', color: '#8b5cf6' },
                { id: 'tag_3', name: 'Tag 3', color: '#ec4899' }
              ]
            }
          },

          // Reference types (2)
          { id: 'person', name: 'person', type: 'person' },
          {
            id: 'relation',
            name: 'relation',
            type: 'relation',
            config: { targetSchema: PAGE_SCHEMA_ID }
          },

          // Rich types (4)
          { id: 'url', name: 'url', type: 'url' },
          { id: 'email', name: 'email', type: 'email' },
          { id: 'phone', name: 'phone', type: 'phone' },
          { id: 'file', name: 'file', type: 'file', config: { accept: ['*/*'] } },

          // Auto-populated types (3) - read-only, auto-filled on create/update
          { id: 'created', name: 'created', type: 'created' },
          { id: 'updated', name: 'updated', type: 'updated' },
          { id: 'createdBy', name: 'createdBy', type: 'createdBy' }
        ]

        dataMap.set('columns', columns)

        // Create sample rows demonstrating filled and empty states for all 15 types
        const now = Date.now()
        const rows = [
          // Row 1: All fields populated
          {
            id: rowIds[0],
            text: 'Fully populated row',
            number: 42.5,
            checkbox: true,
            date: '2024-06-15',
            dateRange: { start: '2024-06-01', end: '2024-06-30' },
            select: 'opt_a',
            multiSelect: ['tag_1', 'tag_2'],
            person: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            relation: 'node_abc123',
            url: 'https://example.com',
            email: 'hello@example.com',
            phone: '+1 (555) 123-4567',
            file: {
              cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
              name: 'document.pdf',
              size: 102400
            },
            created: now - 86400000 * 7, // 7 days ago
            updated: now,
            createdBy: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
          },
          // Row 2: Different values
          {
            id: rowIds[1],
            text: 'Another row with data',
            number: 100,
            checkbox: false,
            date: '2024-12-25',
            dateRange: { start: '2024-12-20', end: '2025-01-05' },
            select: 'opt_b',
            multiSelect: ['tag_3'],
            person: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
            relation: 'node_def456',
            url: 'https://xnet.fyi',
            email: 'test@xnet.fyi',
            phone: '+44 20 7946 0958',
            file: {
              cid: 'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4',
              name: 'image.png',
              size: 51200
            },
            created: now - 86400000 * 3, // 3 days ago
            updated: now - 3600000,
            createdBy: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
          },
          // Row 3: Sparse data (some empty)
          {
            id: rowIds[2],
            text: 'Sparse row',
            number: 0,
            checkbox: false,
            date: '',
            dateRange: null,
            select: 'opt_c',
            multiSelect: [],
            person: '',
            relation: '',
            url: '',
            email: '',
            phone: '',
            file: null,
            created: now - 86400000,
            updated: now - 86400000,
            createdBy: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
          },
          // Row 4: Edge cases (negative number, all tags, no select)
          {
            id: rowIds[3],
            text: 'Edge cases row',
            number: -99.9,
            checkbox: true,
            date: '2020-01-01',
            dateRange: { start: '2020-01-01', end: '2020-01-01' }, // Same day range
            select: '',
            multiSelect: ['tag_1', 'tag_2', 'tag_3'],
            person: '',
            relation: 'node_ghi789',
            url: 'https://github.com',
            email: 'dev@github.com',
            phone: '',
            file: null,
            created: now - 86400000 * 30,
            updated: now - 86400000 * 15,
            createdBy: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
          },
          // Row 5: Empty row (all user-editable fields empty)
          {
            id: rowIds[4],
            text: '',
            number: null,
            checkbox: false,
            date: '',
            dateRange: null,
            select: '',
            multiSelect: [],
            person: '',
            relation: '',
            url: '',
            email: '',
            phone: '',
            file: null,
            created: now,
            updated: now,
            createdBy: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
          }
        ]

        dataMap.set('rows', rows)

        // Store view configs
        const columnIds = columns.map((c) => c.id)
        const propertyWidths: Record<string, number> = {}
        columns.forEach((c) => {
          propertyWidths[c.id] = c.type === 'text' ? 180 : c.type === 'multiSelect' ? 150 : 120
        })

        dataMap.set('tableView', {
          id: 'default-table',
          name: 'Table View',
          type: 'table',
          visibleProperties: columnIds,
          propertyWidths,
          sorts: [],
          groupByProperty: 'select'
        })

        dataMap.set('boardView', {
          id: 'default-board',
          name: 'Board View',
          type: 'board',
          visibleProperties: columnIds,
          sorts: [],
          groupByProperty: 'select'
        })

        // Also populate meta map
        const metaMap = ydoc.getMap('meta')
        metaMap.set('_schemaId', DATABASE_SCHEMA_ID)
        metaMap.set('title', 'Sample Database - All Property Types')
        metaMap.set('icon', '📊')
        metaMap.set('defaultView', 'table')
      })

      // Save the document content
      const content = Y.encodeStateAsUpdate(ydoc)
      await store.setDocumentContent(node.id, content)

      // Capture Yjs snapshot for document time travel
      if (documentHistory) {
        await documentHistory.forceCapture(node.id, ydoc)
      }

      // Register with devtools for inspection
      yDocRegistry.register(node.id, ydoc)

      // ─── Create database comments ──────────────────────────────────
      const dbSchemaId = DATABASE_SCHEMA_ID
      const commentSchemaId = COMMENT_SCHEMA_ID

      // Comment on a cell (text column, row 1)
      const cellComment = await store.create({
        schemaId: commentSchemaId,
        properties: {
          target: node.id,
          targetSchema: dbSchemaId,
          anchorType: 'cell',
          anchorData: JSON.stringify({ rowId: rowIds[0], propertyKey: 'text' }),
          content: 'This row has all fields populated - great for screenshot demos.',
          resolved: false,
          edited: false
        }
      })

      // Reply to the cell comment
      await store.create({
        schemaId: commentSchemaId,
        properties: {
          target: node.id,
          targetSchema: dbSchemaId,
          inReplyTo: cellComment.id,
          anchorType: 'node',
          anchorData: '{}',
          content: 'Agreed, we should keep this row as the primary example.',
          resolved: false,
          edited: false
        }
      })

      // Comment on a row (row 3 - sparse data)
      await store.create({
        schemaId: commentSchemaId,
        properties: {
          target: node.id,
          targetSchema: dbSchemaId,
          anchorType: 'row',
          anchorData: JSON.stringify({ rowId: rowIds[2] }),
          content:
            'Should we fill in more fields here, or keep it sparse for testing empty states?',
          resolved: false,
          edited: false
        }
      })

      // Resolved comment on a column
      await store.create({
        schemaId: commentSchemaId,
        properties: {
          target: node.id,
          targetSchema: dbSchemaId,
          anchorType: 'column',
          anchorData: JSON.stringify({ propertyKey: 'dateRange' }),
          content: 'Fixed: dateRange column now correctly handles same-day ranges.',
          resolved: true,
          edited: false
        }
      })

      // ─── Create database history ──────────────────────────────────
      await store.update(node.id, {
        properties: { title: 'Property Types DB' }
      })

      await store.update(node.id, {
        properties: { defaultView: 'board' }
      })

      await store.update(node.id, {
        properties: { title: 'Sample Database - All Property Types', defaultView: 'table' }
      })

      await store.update(node.id, {
        properties: { icon: '🗄️' }
      })

      await store.update(node.id, {
        properties: { icon: '📊' }
      })

      // Edit the cell comment to show comment history
      await store.update(cellComment.id, {
        properties: {
          content:
            'This row has all 15 fields populated - great for screenshot demos and integration testing.',
          edited: true,
          editedAt: Date.now()
        }
      })

      setStatus(`Created sample database: ${node.id} (6 changes + comments)`)
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="text-xs text-zinc-400">
        Create sample data to test the application. Each button creates a node with comprehensive
        test content.
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={createSamplePage}
          disabled={!store || isCreating}
          className={`
            px-4 py-2 text-xs font-medium rounded
            ${
              store && !isCreating
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }
          `}
        >
          Create Sample Page
        </button>

        <button
          onClick={createSampleDatabase}
          disabled={!store || isCreating}
          className={`
            px-4 py-2 text-xs font-medium rounded
            ${
              store && !isCreating
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }
          `}
        >
          Create Sample Database
        </button>

        <button
          onClick={createRelatedDatabases}
          disabled={!store || isCreating}
          className={`
            px-4 py-2 text-xs font-medium rounded
            ${
              store && !isCreating
                ? 'bg-purple-600 hover:bg-purple-500 text-white'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }
          `}
        >
          Create Projects + Tasks
        </button>
      </div>

      {!store && (
        <div className="text-xs text-yellow-500">Store not connected. Buttons disabled.</div>
      )}

      {status && (
        <div
          className={`text-xs p-2 rounded ${
            status.startsWith('Error') ? 'bg-red-900/30 text-red-400' : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          {status}
        </div>
      )}

      <div className="mt-auto border-t border-zinc-800 pt-4">
        <div className="text-[10px] text-zinc-600 space-y-1">
          <div>
            <strong>Sample Page:</strong> H1-H3, paragraph, bullet/numbered/task lists, blockquote,
            code block, horizontal rule, all callout types, toggle sections, Mermaid diagram,
            comments (active thread with reply, standalone, resolved), and change history (5
            changes: create + title/icon updates).
          </div>
          <div>
            <strong>Sample Database:</strong> 15 columns covering all property types with 5 rows,
            comments (cell thread with reply, row comment, resolved column comment), and change
            history (6 changes: create + title/view/icon updates).
          </div>
          <div>
            <strong>Projects + Tasks:</strong> Two linked databases demonstrating relations.
            Projects has 3 rows with status, priority, budget, tags, and links to Tasks. Tasks has 8
            rows with status, priority, assignee, due dates, labels, and links back to Projects.
            Includes rollup columns (task count, total hours), table/board/calendar views, and
            comments.
          </div>
        </div>
      </div>
    </div>
  )
}
