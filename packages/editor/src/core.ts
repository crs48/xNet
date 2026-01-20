/**
 * @xnet/editor - Core editor logic
 *
 * Framework-agnostic editor that binds to a Yjs document.
 * Can be used directly with vanilla JS/DOM or wrapped by framework bindings.
 */
import * as Y from 'yjs'
import type {
  EditorConfig,
  EditorState,
  Selection,
  EditorEventType,
  EditorEventHandler
} from './types'

/**
 * Core editor class - framework agnostic
 */
export class Editor {
  private ydoc: Y.Doc
  private ytext: Y.Text
  private field: string
  private placeholder: string
  private readOnly: boolean
  private listeners: Map<EditorEventType, Set<EditorEventHandler>>
  private state: EditorState

  constructor(config: EditorConfig) {
    this.ydoc = config.ydoc
    this.field = config.field ?? 'content'
    this.placeholder = config.placeholder ?? ''
    this.readOnly = config.readOnly ?? false
    this.listeners = new Map()

    // Get or create the Y.Text field
    this.ytext = this.ydoc.getText(this.field)

    // Initialize state
    this.state = {
      content: this.ytext.toString(),
      selection: null,
      focused: false,
      readOnly: this.readOnly
    }

    // Set up event handlers from config
    if (config.onChange) {
      this.on('change', config.onChange)
    }
    if (config.onSelectionChange) {
      this.on('selection', config.onSelectionChange)
    }

    // Observe Yjs changes
    this.ytext.observe(this.handleYjsChange)
  }

  /**
   * Get current content
   */
  getContent(): string {
    return this.ytext.toString()
  }

  /**
   * Get current state
   */
  getState(): EditorState {
    return { ...this.state }
  }

  /**
   * Get the Y.Text instance for direct manipulation
   */
  getYText(): Y.Text {
    return this.ytext
  }

  /**
   * Get the Y.Doc instance
   */
  getYDoc(): Y.Doc {
    return this.ydoc
  }

  /**
   * Set content (replaces all content)
   */
  setContent(content: string): void {
    if (this.readOnly) return

    this.ydoc.transact(() => {
      this.ytext.delete(0, this.ytext.length)
      this.ytext.insert(0, content)
    })
  }

  /**
   * Insert text at position
   */
  insert(index: number, text: string): void {
    if (this.readOnly) return
    this.ytext.insert(index, text)
  }

  /**
   * Delete text at range
   */
  delete(index: number, length: number): void {
    if (this.readOnly) return
    this.ytext.delete(index, length)
  }

  /**
   * Apply a delta (insert/delete at current selection)
   */
  applyDelta(oldText: string, newText: string, selectionStart: number): void {
    if (this.readOnly) return

    // Find the difference and apply minimal changes
    const currentContent = this.getContent()

    // Simple diff: find common prefix and suffix
    let prefixLen = 0
    while (
      prefixLen < oldText.length &&
      prefixLen < newText.length &&
      oldText[prefixLen] === newText[prefixLen]
    ) {
      prefixLen++
    }

    let oldSuffixLen = 0
    let newSuffixLen = 0
    while (
      oldSuffixLen < oldText.length - prefixLen &&
      newSuffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - oldSuffixLen] === newText[newText.length - 1 - newSuffixLen]
    ) {
      oldSuffixLen++
      newSuffixLen++
    }

    const deleteStart = prefixLen
    const deleteLen = oldText.length - prefixLen - oldSuffixLen
    const insertText = newText.slice(prefixLen, newText.length - newSuffixLen)

    this.ydoc.transact(() => {
      if (deleteLen > 0) {
        this.ytext.delete(deleteStart, deleteLen)
      }
      if (insertText.length > 0) {
        this.ytext.insert(deleteStart, insertText)
      }
    })
  }

  /**
   * Update selection state
   */
  setSelection(selection: Selection | null): void {
    this.state.selection = selection
    this.emit('selection', selection)
  }

  /**
   * Set focus state
   */
  setFocused(focused: boolean): void {
    this.state.focused = focused
    this.emit(focused ? 'focus' : 'blur', undefined)
  }

  /**
   * Set read-only mode
   */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly
    this.state.readOnly = readOnly
  }

  /**
   * Add event listener
   */
  on<T = unknown>(event: EditorEventType, handler: EditorEventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as EditorEventHandler)

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler as EditorEventHandler)
    }
  }

  /**
   * Remove event listener
   */
  off(event: EditorEventType, handler: EditorEventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  /**
   * Emit event
   */
  private emit<T>(event: EditorEventType, data: T): void {
    this.listeners.get(event)?.forEach(handler => handler(data))
  }

  /**
   * Handle Yjs changes
   */
  private handleYjsChange = (_event: Y.YTextEvent, transaction: Y.Transaction): void => {
    const newContent = this.ytext.toString()
    this.state.content = newContent

    // Only emit if change was from remote (not local)
    if (!transaction.local) {
      this.emit('remote-update', newContent)
    }

    this.emit('change', newContent)
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.ytext.unobserve(this.handleYjsChange)
    this.listeners.clear()
  }
}

/**
 * Create a new editor instance
 */
export function createEditor(config: EditorConfig): Editor {
  return new Editor(config)
}
