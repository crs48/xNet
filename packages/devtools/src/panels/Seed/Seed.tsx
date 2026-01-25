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
        schemaId: 'xnet://xnet.dev/Page',
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
        for (const text of ['First bullet point', 'Second bullet point', 'Third bullet point']) {
          const li = new Y.XmlElement('listItem')
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(text)])
          li.insert(0, [p])
          bulletList.push([li])
        }
        fragment.push([bulletList])

        // Numbered List
        const orderedList = new Y.XmlElement('orderedList')
        for (const text of ['First numbered item', 'Second numbered item']) {
          const li = new Y.XmlElement('listItem')
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(text)])
          li.insert(0, [p])
          orderedList.push([li])
        }
        fragment.push([orderedList])

        // Task List
        const taskList = new Y.XmlElement('taskList')
        const tasks = [
          { text: 'Unchecked task', checked: false },
          { text: 'Completed task', checked: true }
        ]
        for (const { text, checked } of tasks) {
          const task = new Y.XmlElement('taskItem')
          task.setAttribute('checked', String(checked))
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(text)])
          task.insert(0, [p])
          taskList.push([task])
        }
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
        metaMap.set('_schemaId', 'xnet://xnet.dev/Page')
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
        schemaId: 'xnet://xnet.dev/Database',
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

        // Define columns - one for each supported property type
        // Column names are the property type for easy identification
        const columns = [
          { id: 'text', name: 'Text', type: 'text' },
          { id: 'number', name: 'Number', type: 'number' },
          { id: 'checkbox', name: 'Checkbox', type: 'checkbox' },
          { id: 'date', name: 'Date', type: 'date' },
          {
            id: 'select',
            name: 'Select',
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
            name: 'Multi-Select',
            type: 'multiSelect',
            config: {
              options: [
                { id: 'tag_1', name: 'Tag 1', color: '#f59e0b' },
                { id: 'tag_2', name: 'Tag 2', color: '#8b5cf6' },
                { id: 'tag_3', name: 'Tag 3', color: '#ec4899' }
              ]
            }
          },
          { id: 'url', name: 'URL', type: 'url' },
          { id: 'email', name: 'Email', type: 'email' },
          { id: 'phone', name: 'Phone', type: 'phone' }
        ]

        dataMap.set('columns', columns)

        // Create sample rows demonstrating filled and empty states
        const rows = [
          // Row 1: All fields populated
          {
            id: generateId(),
            text: 'Fully populated row',
            number: 42.5,
            checkbox: true,
            date: '2024-06-15',
            select: 'opt_a',
            multiSelect: ['tag_1', 'tag_2'],
            url: 'https://example.com',
            email: 'hello@example.com',
            phone: '+1 (555) 123-4567'
          },
          // Row 2: Different values
          {
            id: generateId(),
            text: 'Another row with data',
            number: 100,
            checkbox: false,
            date: '2024-12-25',
            select: 'opt_b',
            multiSelect: ['tag_3'],
            url: 'https://xnet.dev',
            email: 'test@xnet.dev',
            phone: '+44 20 7946 0958'
          },
          // Row 3: Minimal data (some empty)
          {
            id: generateId(),
            text: 'Sparse row',
            number: 0,
            checkbox: false,
            date: '',
            select: 'opt_c',
            multiSelect: [],
            url: '',
            email: '',
            phone: ''
          },
          // Row 4: Negative number, all tags
          {
            id: generateId(),
            text: 'Negative number test',
            number: -99.9,
            checkbox: true,
            date: '2020-01-01',
            select: '',
            multiSelect: ['tag_1', 'tag_2', 'tag_3'],
            url: 'https://github.com',
            email: 'dev@github.com',
            phone: ''
          },
          // Row 5: Empty row (all fields undefined/empty)
          {
            id: generateId(),
            text: '',
            number: null,
            checkbox: false,
            date: '',
            select: '',
            multiSelect: [],
            url: '',
            email: '',
            phone: ''
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
        metaMap.set('_schemaId', 'xnet://xnet.dev/Database')
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
            <strong>Sample Database:</strong> 9 columns (Text, Number, Checkbox, Date, Select,
            Multi-Select, URL, Email, Phone) with 5 rows showing filled, partial, and empty states.
          </div>
        </div>
      </div>
    </div>
  )
}
