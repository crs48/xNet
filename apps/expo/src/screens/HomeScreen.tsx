/**
 * Home screen - document list
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl
} from 'react-native'
import { useXNet } from '../hooks/useXNet'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>
}

interface DocumentItem {
  id: string
  title: string
}

export function HomeScreen({ navigation }: Props) {
  const { client, isReady, identity, error } = useXNet()
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadDocuments = useCallback(async () => {
    if (!client || !isReady) return

    try {
      const docIds = await client.listDocuments()
      const docs: DocumentItem[] = []
      for (const id of docIds) {
        const doc = await client.getDocument(id)
        if (doc) {
          docs.push({ id: doc.id, title: doc.metadata.title })
        }
      }
      setDocuments(docs)
    } catch (e) {
      console.error('Failed to load documents:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [client, isReady])

  useEffect(() => {
    if (isReady) {
      loadDocuments()
    }
  }, [isReady, loadDocuments])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadDocuments()
  }, [loadDocuments])

  const createDocument = async () => {
    if (!client) return

    try {
      const doc = await client.createDocument({
        workspace: 'default',
        type: 'page',
        title: 'Untitled'
      })
      await loadDocuments()
      navigation.navigate('Document', { docId: doc.id })
    } catch (e) {
      console.error('Failed to create document:', e)
    }
  }

  const deleteDocument = async (id: string) => {
    if (!client) return

    try {
      await client.deleteDocument(id)
      await loadDocuments()
    } catch (e) {
      console.error('Failed to delete document:', e)
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

  if (!isReady || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading xNotes...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>xNotes</Text>
        <Text style={styles.identity}>
          {identity ? `${identity.slice(0, 20)}...` : ''}
        </Text>
      </View>

      <TouchableOpacity style={styles.createButton} onPress={createDocument}>
        <Text style={styles.createButtonText}>+ New Page</Text>
      </TouchableOpacity>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.docItem}
            onPress={() => navigation.navigate('Document', { docId: item.id })}
            onLongPress={() => deleteDocument(item.id)}
          >
            <Text style={styles.docTitle}>{item.title}</Text>
            <Text style={styles.docId}>{item.id.slice(-8)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No documents yet</Text>
            <Text style={styles.emptyHint}>Tap + New Page to create one</Text>
          </View>
        }
      />
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
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a'
  },
  identity: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontFamily: 'monospace'
  },
  createButton: {
    margin: 16,
    padding: 14,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    alignItems: 'center'
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16
  },
  docItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  docTitle: {
    fontSize: 16,
    color: '#1a1a1a',
    flex: 1
  },
  docId: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace'
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8
  },
  emptyHint: {
    fontSize: 14,
    color: '#999'
  },
  loadingText: {
    marginTop: 12,
    color: '#666'
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16
  }
})
