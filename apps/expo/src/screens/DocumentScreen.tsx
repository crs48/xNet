/**
 * Document screen - rich text editor using WebView
 */
import type { RootStackParamList } from '../navigation/types'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
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
import { useNode } from '../hooks/useNode'

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Document'>
  route: RouteProp<RootStackParamList, 'Document'>
}

export function DocumentScreen({ navigation, route }: Props) {
  const { docId } = route.params
  const { document, loading, error } = useNode(docId)
  const [title, setTitle] = useState('')
  const [initialContent, setInitialContent] = useState('')

  useEffect(() => {
    if (document) {
      setTitle(document.metadata.title)
      navigation.setOptions({ title: document.metadata.title })

      // Get initial HTML content from Y.Doc
      const content = document.ydoc.getText('content')
      setInitialContent(content.toString())
    }
  }, [document, navigation])

  const handleTitleChange = (text: string) => {
    setTitle(text)
    if (document) {
      document.metadata.title = text
      navigation.setOptions({ title: text })
    }
  }

  const handleContentChange = useCallback(
    (html: string) => {
      // Update Y.Doc with new content
      if (document) {
        const text = document.ydoc.getText('content')
        text.delete(0, text.length)
        text.insert(0, html)
      }
    },
    [document]
  )

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

  if (loading || !document) {
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
