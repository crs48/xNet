import type { Editor } from '@tiptap/core'

/**
 * A single command in the slash menu
 */
export interface SlashCommandItem {
  /** Display title */
  title: string
  /** Short description */
  description: string
  /** Icon (text/emoji) */
  icon: string
  /** Alternative search terms */
  searchTerms?: string[]
  /** Command to execute */
  command: (props: { editor: Editor; range: { from: number; to: number } }) => void
}

/**
 * A group of related commands
 */
export interface SlashCommandGroup {
  name: string
  items: SlashCommandItem[]
}

/**
 * All available slash commands, organized by group
 */
export const COMMAND_GROUPS: SlashCommandGroup[] = [
  {
    name: 'Basic Blocks',
    items: [
      {
        title: 'Text',
        description: 'Plain text paragraph',
        icon: 'Aa',
        searchTerms: ['paragraph', 'p', 'plain'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setParagraph().run()
        }
      },
      {
        title: 'Heading 1',
        description: 'Large section heading',
        icon: 'H1',
        searchTerms: ['h1', 'title', 'large', 'header'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
        }
      },
      {
        title: 'Heading 2',
        description: 'Medium section heading',
        icon: 'H2',
        searchTerms: ['h2', 'subtitle', 'medium', 'header'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
        }
      },
      {
        title: 'Heading 3',
        description: 'Small section heading',
        icon: 'H3',
        searchTerms: ['h3', 'small', 'header'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
        }
      }
    ]
  },
  {
    name: 'Lists',
    items: [
      {
        title: 'Bullet List',
        description: 'Unordered list with bullets',
        icon: '\u2022',
        searchTerms: ['ul', 'unordered', 'bullets', 'points'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run()
        }
      },
      {
        title: 'Numbered List',
        description: 'Ordered list with numbers',
        icon: '1.',
        searchTerms: ['ol', 'ordered', 'numbers', 'sequence'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run()
        }
      },
      {
        title: 'Task List',
        description: 'Checklist with checkboxes',
        icon: '[]',
        searchTerms: ['todo', 'checkbox', 'tasks', 'checklist'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleTaskList().run()
        }
      }
    ]
  },
  {
    name: 'Blocks',
    items: [
      {
        title: 'Quote',
        description: 'Blockquote for citations',
        icon: '\u201C',
        searchTerms: ['blockquote', 'citation', 'pullquote'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleBlockquote().run()
        }
      },
      {
        title: 'Code Block',
        description: 'Code with syntax highlighting',
        icon: '</>',
        searchTerms: ['code', 'pre', 'snippet', 'programming'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
        }
      },
      {
        title: 'Divider',
        description: 'Horizontal line separator',
        icon: '\u2014',
        searchTerms: ['hr', 'horizontal', 'rule', 'line', 'separator'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHorizontalRule().run()
        }
      }
    ]
  },
  {
    name: 'Media',
    items: [
      {
        title: 'Image',
        description: 'Upload or embed an image',
        icon: '\uD83D\uDDBC\uFE0F',
        searchTerms: ['img', 'picture', 'photo', 'upload'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).run()

          // Open file picker
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return

            const imageExt = editor.extensionManager.extensions.find((ext) => ext.name === 'image')
            const onUpload = imageExt?.options?.onUpload as
              | ((
                  f: File
                ) => Promise<{ src: string; width?: number; height?: number; cid?: string }>)
              | undefined

            if (onUpload) {
              // Insert placeholder
              editor.commands.setImage({
                src: '',
                alt: file.name,
                uploadProgress: 0
              })

              try {
                const result = await onUpload(file)
                // Find and update the placeholder
                editor.state.doc.descendants((node, pos) => {
                  if (node.type.name === 'image' && node.attrs.uploadProgress !== null) {
                    editor.view.dispatch(
                      editor.state.tr.setNodeMarkup(pos, undefined, {
                        src: result.src,
                        width: result.width || null,
                        height: result.height || null,
                        cid: result.cid || null,
                        alt: file.name,
                        alignment: 'center',
                        uploadProgress: null
                      })
                    )
                    return false
                  }
                })
              } catch (err) {
                // Remove placeholder on error
                editor.state.doc.descendants((node, pos) => {
                  if (node.type.name === 'image' && node.attrs.uploadProgress !== null) {
                    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
                    return false
                  }
                })
              }
            } else {
              // No upload handler - insert with object URL as fallback
              const url = URL.createObjectURL(file)
              editor.commands.setImage({
                src: url,
                alt: file.name
              })
            }
          }
          input.click()
        }
      },
      {
        title: 'File',
        description: 'Upload a file attachment',
        icon: '\uD83D\uDCCE',
        searchTerms: ['file', 'attachment', 'upload', 'document'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).run()

          const input = document.createElement('input')
          input.type = 'file'
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return

            const fileExt = editor.extensionManager.extensions.find((ext) => ext.name === 'file')
            const onUpload = fileExt?.options?.onUpload as
              | ((
                  f: File
                ) => Promise<{ cid: string; name: string; mimeType: string; size: number }>)
              | undefined

            if (onUpload) {
              // Insert placeholder with upload progress
              editor.commands.insertContent({
                type: 'file',
                attrs: {
                  name: file.name,
                  mimeType: file.type || 'application/octet-stream',
                  size: file.size,
                  uploadProgress: 0
                }
              })

              try {
                const result = await onUpload(file)
                // Find and update the placeholder
                editor.state.doc.descendants((node, pos) => {
                  if (node.type.name === 'file' && node.attrs.uploadProgress !== null) {
                    editor.view.dispatch(
                      editor.state.tr.setNodeMarkup(pos, undefined, {
                        cid: result.cid,
                        name: result.name,
                        mimeType: result.mimeType,
                        size: result.size,
                        uploadProgress: null
                      })
                    )
                    return false
                  }
                })
              } catch (err) {
                // Remove placeholder on error
                editor.state.doc.descendants((node, pos) => {
                  if (node.type.name === 'file' && node.attrs.uploadProgress !== null) {
                    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
                    return false
                  }
                })
              }
            }
          }
          input.click()
        }
      },
      {
        title: 'Embed',
        description: 'Embed from URL (YouTube, Spotify, etc.)',
        icon: '\uD83D\uDD17',
        searchTerms: ['embed', 'youtube', 'video', 'spotify', 'vimeo', 'iframe', 'media'],
        command: ({ editor, range }) => {
          // Insert empty embed node - the node view will show an input field
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: 'embed',
              attrs: { url: null, provider: null, embedId: null, embedUrl: null }
            })
            .run()
        }
      }
    ]
  },
  {
    name: 'Callouts',
    items: [
      {
        title: 'Info',
        description: 'Blue info callout',
        icon: '\u2139\uFE0F',
        searchTerms: ['callout', 'info', 'block'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setCallout('info').run()
        }
      },
      {
        title: 'Tip',
        description: 'Green tip callout',
        icon: '\uD83D\uDCA1',
        searchTerms: ['callout', 'tip', 'hint', 'suggestion'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setCallout('tip').run()
        }
      },
      {
        title: 'Warning',
        description: 'Yellow warning callout',
        icon: '\u26A0\uFE0F',
        searchTerms: ['callout', 'warning', 'alert', 'attention'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setCallout('warning').run()
        }
      },
      {
        title: 'Caution',
        description: 'Red caution callout',
        icon: '\uD83D\uDEA8',
        searchTerms: ['callout', 'caution', 'danger', 'error'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setCallout('caution').run()
        }
      },
      {
        title: 'Note',
        description: 'Gray note callout',
        icon: '\uD83D\uDCDD',
        searchTerms: ['callout', 'note', 'aside'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setCallout('note').run()
        }
      }
    ]
  },
  {
    name: 'Toggles',
    items: [
      {
        title: 'Toggle',
        description: 'Collapsible section',
        icon: '\u25B6\uFE0F',
        searchTerms: ['toggle', 'collapse', 'expand', 'details', 'summary', 'accordion'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setToggle().run()
        }
      }
    ]
  },

  {
    name: 'Data',
    items: [
      {
        title: 'Database',
        description: 'Embed a linked database view',
        icon: '\uD83D\uDCCA',
        searchTerms: ['database', 'table', 'board', 'view', 'data', 'spreadsheet'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).run()

          const dbExt = editor.extensionManager.extensions.find(
            (ext) => ext.name === 'databaseEmbed'
          )
          const onSelectDatabase = dbExt?.options?.onSelectDatabase as
            | (() => Promise<string | null>)
            | undefined

          if (onSelectDatabase) {
            onSelectDatabase().then((databaseId) => {
              if (databaseId) {
                editor.commands.setDatabaseEmbed({ databaseId })
              }
            })
          } else {
            // Fallback: prompt for database ID
            const databaseId = window.prompt('Database ID:')
            if (databaseId?.trim()) {
              editor.commands.setDatabaseEmbed({ databaseId: databaseId.trim() })
            }
          }
        }
      },
      {
        title: 'Task View',
        description: 'Embed a filtered task view',
        icon: '\u2705',
        searchTerms: ['task', 'tasks', 'list', 'assignee', 'due', 'view'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setTaskViewEmbed().run()
        }
      }
    ]
  }
]

/**
 * Get all command items as a flat array
 */
export function getAllCommands(): SlashCommandItem[] {
  return COMMAND_GROUPS.flatMap((group) => group.items)
}

/**
 * Filter commands by search query
 */
export function filterCommands(query: string): SlashCommandItem[] {
  const search = query.toLowerCase().trim()

  if (!search) {
    return getAllCommands()
  }

  return getAllCommands().filter((item) => {
    if (item.title.toLowerCase().includes(search)) return true
    if (item.searchTerms?.some((term) => term.includes(search))) return true
    if (item.description.toLowerCase().includes(search)) return true
    return false
  })
}
