/**
 * Seed panel - Create sample data for testing
 *
 * Provides buttons to quickly seed the database with:
 * - A sample Page with all supported block types
 * - A sample Database with all supported property types
 */

import { useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import * as Y from 'yjs'

// Generate a simple ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export function Seed() {
  const { store, yDocRegistry } = useDevTools()
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
        schemaId: 'xnet://xnet.fyi/Page',
        properties: {
          title: 'Sample Page - All Block Types',
          icon: '📄'
        }
      })

      // Create a Y.Doc and populate with sample content
      const ydoc = new Y.Doc({ guid: node.id })

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

        // Toggle (collapsible section)
        const toggle = new Y.XmlElement('details')
        const summary = new Y.XmlElement('detailsSummary')
        const summaryPara = new Y.XmlElement('paragraph')
        summaryPara.insert(0, [new Y.XmlText('Click to expand this toggle section')])
        summary.insert(0, [summaryPara])
        const detailsContent = new Y.XmlElement('detailsContent')
        const contentPara = new Y.XmlElement('paragraph')
        contentPara.insert(0, [
          new Y.XmlText(
            'This is the hidden content inside the toggle. It can contain any other block types.'
          )
        ])
        detailsContent.insert(0, [contentPara])
        toggle.insert(0, [summary, detailsContent])
        fragment.push([toggle])

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
        metaMap.set('_schemaId', 'xnet://xnet.fyi/Page')
        metaMap.set('title', 'Sample Page - All Block Types')
        metaMap.set('icon', '📄')
      })

      // Save the document content
      const content = Y.encodeStateAsUpdate(ydoc)
      await store.setDocumentContent(node.id, content)

      // Register with devtools for inspection
      yDocRegistry.register(node.id, ydoc)

      setStatus(`Created sample page: ${node.id}`)
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
        schemaId: 'xnet://xnet.fyi/Database',
        properties: {
          title: 'Sample Database - All Property Types',
          icon: '📊',
          defaultView: 'table'
        }
      })

      // Create Y.Doc for storing the database data
      const ydoc = new Y.Doc({ guid: node.id })

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
            config: { targetSchema: 'xnet://xnet.fyi/Page' }
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
            id: generateId(),
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
            id: generateId(),
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
            id: generateId(),
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
            id: generateId(),
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
            id: generateId(),
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
        metaMap.set('_schemaId', 'xnet://xnet.fyi/Database')
        metaMap.set('title', 'Sample Database - All Property Types')
        metaMap.set('icon', '📊')
        metaMap.set('defaultView', 'table')
      })

      // Save the document content
      const content = Y.encodeStateAsUpdate(ydoc)
      await store.setDocumentContent(node.id, content)

      // Register with devtools for inspection
      yDocRegistry.register(node.id, ydoc)

      setStatus(`Created sample database: ${node.id}`)
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
            code block, horizontal rule, all callout types, and toggle sections.
          </div>
          <div>
            <strong>Sample Database:</strong> 15 columns covering all property types (text, number,
            checkbox, date, dateRange, select, multiSelect, person, relation, url, email, phone,
            file, created, updated, createdBy) with 5 rows showing filled, partial, and empty
            states.
          </div>
        </div>
      </div>
    </div>
  )
}
