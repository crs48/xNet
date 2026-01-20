/**
 * Document screen - editor
 */
import React, { useState, useEffect } from 'react'
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
import { useDocument } from '../hooks/useDocument'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../navigation/types'

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Document'>
  route: RouteProp<RootStackParamList, 'Document'>
}

export function DocumentScreen({ navigation, route }: Props) {
  const { docId } = route.params
  const { document, loading, error } = useDocument(docId)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (document) {
      setTitle(document.metadata.title)
      setContent(document.ydoc.getText('content').toString())
      navigation.setOptions({ title: document.metadata.title })
    }
  }, [document, navigation])

  const handleTitleChange = (text: string) => {
    setTitle(text)
    if (document) {
      document.metadata.title = text
      navigation.setOptions({ title: text })
    }
  }

  const handleContentChange = (text: string) => {
    setContent(text)
    if (document) {
      const ytext = document.ydoc.getText('content')
      ytext.delete(0, ytext.length)
      ytext.insert(0, text)
    }
  }

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
        <TextInput
          style={styles.contentInput}
          value={content}
          onChangeText={handleContentChange}
          placeholder="Start typing..."
          placeholderTextColor="#999"
          multiline
          textAlignVertical="top"
        />
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
  contentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    padding: 16,
    paddingTop: 0,
    color: '#1a1a1a'
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16
  }
})
