/**
 * WebView-based rich text editor for React Native
 *
 * Uses a WebView to render TipTap editor with full rich text support.
 * Communicates with React Native via postMessage.
 */
import React, { useRef, useCallback, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'

interface WebViewEditorProps {
  /** Initial HTML content */
  initialContent?: string
  /** Placeholder text */
  placeholder?: string
  /** Called when content changes */
  onContentChange?: (html: string) => void
  /** Called when a wikilink is clicked */
  onNavigate?: (docId: string) => void
  /** Whether the editor is read-only */
  readOnly?: boolean
}

// Message types for RN <-> WebView communication
type MessageToWebView =
  | { type: 'setContent'; content: string }
  | { type: 'setReadOnly'; readOnly: boolean }
  | { type: 'focus' }

type MessageFromWebView =
  | { type: 'contentChange'; content: string }
  | { type: 'navigate'; docId: string }
  | { type: 'ready' }

export function WebViewEditor({
  initialContent = '',
  placeholder = 'Start writing...',
  onContentChange,
  onNavigate,
  readOnly = false
}: WebViewEditorProps) {
  const webViewRef = useRef<WebView>(null)
  const isReady = useRef(false)
  const pendingContent = useRef<string | null>(initialContent)

  // Send message to WebView
  const sendMessage = useCallback((message: MessageToWebView) => {
    if (webViewRef.current && isReady.current) {
      webViewRef.current.postMessage(JSON.stringify(message))
    }
  }, [])

  // Handle messages from WebView
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message: MessageFromWebView = JSON.parse(event.nativeEvent.data)

        switch (message.type) {
          case 'ready':
            isReady.current = true
            // Send initial content if we have it
            if (pendingContent.current) {
              sendMessage({ type: 'setContent', content: pendingContent.current })
              pendingContent.current = null
            }
            sendMessage({ type: 'setReadOnly', readOnly })
            break

          case 'contentChange':
            onContentChange?.(message.content)
            break

          case 'navigate':
            onNavigate?.(message.docId)
            break
        }
      } catch (e) {
        console.error('WebViewEditor: Failed to parse message', e)
      }
    },
    [onContentChange, onNavigate, readOnly, sendMessage]
  )

  // Update content when prop changes
  useEffect(() => {
    if (isReady.current) {
      sendMessage({ type: 'setContent', content: initialContent })
    } else {
      pendingContent.current = initialContent
    }
  }, [initialContent, sendMessage])

  // Update readOnly when prop changes
  useEffect(() => {
    sendMessage({ type: 'setReadOnly', readOnly })
  }, [readOnly, sendMessage])

  // The HTML that runs inside the WebView
  const editorHTML = getEditorHTML(placeholder)

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: editorHTML }}
        onMessage={handleMessage}
        style={styles.webview}
        scrollEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        // Disable bouncing for better UX
        bounces={false}
        // Allow keyboard to show
        keyboardDisplayRequiresUserAction={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent'
  }
})

/**
 * Generate the HTML for the WebView editor.
 * This is a self-contained page that loads TipTap from CDN.
 */
function getEditorHTML(placeholder: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 16px;
      -webkit-font-smoothing: antialiased;
    }
    
    .ProseMirror {
      outline: none;
      min-height: 200px;
    }
    
    .ProseMirror p {
      margin-bottom: 1em;
    }
    
    .ProseMirror h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 1.5em 0 0.5em 0;
    }
    
    .ProseMirror h2 {
      font-size: 22px;
      font-weight: 600;
      margin: 1.3em 0 0.5em 0;
    }
    
    .ProseMirror h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 1.2em 0 0.5em 0;
    }
    
    .ProseMirror ul, .ProseMirror ol {
      padding-left: 1.5em;
      margin-bottom: 1em;
    }
    
    .ProseMirror li {
      margin: 0.25em 0;
    }
    
    .ProseMirror blockquote {
      border-left: 3px solid #646cff;
      padding-left: 1em;
      margin: 1em 0;
      color: #666;
    }
    
    .ProseMirror pre {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 14px;
    }
    
    .ProseMirror code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 14px;
    }
    
    .ProseMirror pre code {
      padding: 0;
      background: transparent;
    }
    
    .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      color: #999;
      pointer-events: none;
      height: 0;
    }
    
    .wikilink {
      color: #646cff;
      cursor: pointer;
      text-decoration: none;
      border-bottom: 1px dashed #646cff;
    }
    
    /* Task list styles */
    ul[data-type="taskList"] {
      list-style: none;
      padding-left: 0;
    }
    
    ul[data-type="taskList"] li {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    
    ul[data-type="taskList"] li[data-checked="true"] > div {
      text-decoration: line-through;
      color: #999;
    }
  </style>
</head>
<body>
  <div id="editor"></div>
  
  <!-- Load TipTap from CDN -->
  <script src="https://unpkg.com/@tiptap/core@2.1.13/dist/index.umd.js"></script>
  <script src="https://unpkg.com/@tiptap/starter-kit@2.1.13/dist/index.umd.js"></script>
  <script src="https://unpkg.com/@tiptap/extension-placeholder@2.1.13/dist/index.umd.js"></script>
  <script src="https://unpkg.com/@tiptap/extension-task-list@2.1.13/dist/index.umd.js"></script>
  <script src="https://unpkg.com/@tiptap/extension-task-item@2.1.13/dist/index.umd.js"></script>
  
  <script>
    const { Editor } = window['@tiptap/core'];
    const StarterKit = window['@tiptap/starter-kit'].default;
    const Placeholder = window['@tiptap/extension-placeholder'].default;
    const TaskList = window['@tiptap/extension-task-list'].default;
    const TaskItem = window['@tiptap/extension-task-item'].default;
    
    // Initialize editor
    const editor = new Editor({
      element: document.querySelector('#editor'),
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: ${JSON.stringify(placeholder)},
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
      content: '',
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none focus:outline-none',
        },
      },
      onUpdate: ({ editor }) => {
        // Send content changes to React Native
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'contentChange',
          content: editor.getHTML()
        }));
      },
    });
    
    // Handle messages from React Native
    window.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'setContent':
            editor.commands.setContent(message.content);
            break;
          case 'setReadOnly':
            editor.setEditable(!message.readOnly);
            break;
          case 'focus':
            editor.commands.focus();
            break;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });
    
    // Handle wikilink clicks
    document.addEventListener('click', (e) => {
      const wikilink = e.target.closest('.wikilink');
      if (wikilink) {
        e.preventDefault();
        const docId = wikilink.getAttribute('data-wikilink');
        if (docId) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'navigate',
            docId: docId
          }));
        }
      }
    });
    
    // Notify React Native that editor is ready
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  </script>
</body>
</html>
`.trim()
}
