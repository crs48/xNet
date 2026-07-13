/**
 * WebView-based rich text editor for React Native
 *
 * Uses a WebView to render the BlockNote editor (0312) with full rich text
 * support. Communicates with React Native via postMessage.
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

  <!-- BlockNote styles (0312) -->
  <link rel="stylesheet" href="https://esm.sh/@blocknote/core@0.51.4/dist/style.css">

  <script type="module">
    // Vanilla (non-React) BlockNote from an ESM CDN — same
    // network-at-startup model as the previous unpkg TipTap embed.
    import { BlockNoteEditor } from 'https://esm.sh/@blocknote/core@0.51.4';

    const editor = BlockNoteEditor.create({
      placeholders: { emptyDocument: ${JSON.stringify(placeholder)} },
    });
    editor.mount(document.querySelector('#editor'));

    editor.onChange(async () => {
      // Send content changes to React Native (HTML over the bridge,
      // protocol unchanged from the TipTap embed).
      const content = await editor.blocksToFullHTML(editor.document);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'contentChange',
        content
      }));
    });

    // Handle messages from React Native
    window.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'setContent': {
            const blocks = await editor.tryParseHTMLToBlocks(message.content || '<p></p>');
            editor.replaceBlocks(editor.document, blocks);
            break;
          }
          case 'setReadOnly':
            editor.isEditable = !message.readOnly;
            break;
          case 'focus':
            editor.focus();
            break;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    // Handle wikilink clicks
    document.addEventListener('click', (e) => {
      const wikilink = e.target.closest('.wikilink, a[data-wikilink]');
      if (wikilink) {
        e.preventDefault();
        const docId = wikilink.getAttribute('data-wikilink') || wikilink.getAttribute('href');
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
