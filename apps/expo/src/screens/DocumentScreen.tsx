/**
 * Document screen - rich text editor using WebView
 *
 * Updated to use the new NodeState API via useNode hook.
 */
import type { RootStackParamList } from '../navigation/types'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { NodeState } from '@xnet/data'
import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native'
import { WebViewEditor } from '../components/WebViewEditor'
import { useXNetContext } from '../context/XNetProvider'

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Document'>
  route: RouteProp<RootStackParamList, 'Document'>
}

export function DocumentScreen({ navigation, route }: Props) {
  const { docId } = route.params
  const { bridge, isReady } = useXNetContext()
  const [node, setNode] = useState<NodeState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [title, setTitle] = useState('')
  const [initialContent, setInitialContent] = useState('')

  const update = useCallback(
    async (changes: Record<string, unknown>): Promise<void> => {
      if (!bridge || !isReady) {
        throw new Error('xNet is not ready')
      }

      const updated = await bridge.update(docId, changes)
      setNode(updated)
    },
    [bridge, isReady, docId]
  )

  useEffect(() => {
    let mounted = true

    async function loadNode() {
      if (!bridge || !isReady) {
        return
      }

      setLoading(true)
      setError(null)

      try {
        if (!bridge.get) {
          throw new Error('Data bridge does not support get()')
        }

        const loaded = await bridge.get(docId)
        if (!mounted) return

        if (!loaded) {
          setNode(null)
          setError(new Error('Document not found'))
          return
        }

        setNode(loaded)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadNode()

    return () => {
      mounted = false
    }
  }, [bridge, isReady, docId])

  useEffect(() => {
    if (node) {
      const nodeTitle = (node.properties.title as string) || 'Untitled'
      setTitle(nodeTitle)
      navigation.setOptions({ title: nodeTitle })

      // For now, use empty content - Y.Doc integration will come later
      // The documentContent is stored as Uint8Array and needs Y.Doc to decode
      setInitialContent('')
    }
  }, [node, navigation])

  const handleTitleChange = useCallback(
    (text: string) => {
      setTitle(text)
      navigation.setOptions({ title: text })
      // Update the node title
      update({ title: text }).catch((err: unknown) => {
        console.error('Failed to update title:', err)
      })
    },
    [update, navigation]
  )

  const handleContentChange = useCallback((_html: string) => {
    // TODO: Y.Doc integration for rich text content
    // For now, content changes are not persisted
    // This will be implemented when Y.Doc support is added to NativeBridge
  }, [])

  const handleNavigate = useCallback(
    (targetDocId: string) => {
      navigation.push('Document', { docId: targetDocId })
    },
    [navigation]
  )

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Error: {error.message}</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!isReady || loading || !node) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Title"
          placeholderTextColor="#999"
        />
        <View style={styles.editorContainer}>
          <WebViewEditor
            initialContent={initialContent}
            placeholder="Start writing..."
            onContentChange={handleContentChange}
            onNavigate={handleNavigate}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  keyboardView: {
    flex: 1
  },
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 16,
    paddingBottom: 8,
    color: '#1a1a1a'
  },
  editorContainer: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5'
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16
  }
})
