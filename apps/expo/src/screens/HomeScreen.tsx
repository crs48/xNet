/**
 * Home screen - document list
 *
 * Updated to use the new DataBridge API via XNetContext.
 */
import type { RootStackParamList } from '../navigation/types'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { DatabaseSchema } from '@xnetjs/data'
import { useMutate, useQuery, useXNet } from '@xnetjs/react'
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
import { Page } from '../schemas'

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>
}

interface DocumentItem {
  id: string
  title: string
}

export function HomeScreen({ navigation }: Props) {
  const { authorDID: identity } = useXNet()
  const { data: nodes, loading, error, reload } = useQuery(Page)
  const { data: databaseNodes } = useQuery(DatabaseSchema)
  const { create, remove } = useMutate()
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const docs: DocumentItem[] = (nodes ?? [])
      .filter((node): node is NonNullable<typeof node> => node !== null)
      .map((node) => ({
        id: node.id,
        title: (node.title as string) || 'Untitled'
      }))
    setDocuments(docs)
  }, [nodes])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    reload()
    setRefreshing(false)
  }, [reload])

  const databases = (databaseNodes ?? [])
    .filter((node): node is NonNullable<typeof node> => node !== null)
    .map((node) => ({ id: node.id, title: (node.title as string) || 'Untitled Database' }))

  const createDatabase = async () => {
    try {
      const node = await create(DatabaseSchema, { title: 'Untitled Database' })
      if (node) {
        navigation.navigate('Database', { docId: node.id })
      }
    } catch (e) {
      console.error('Failed to create database:', e)
    }
  }

  const createDocument = async () => {
    try {
      const node = await create(Page, {
        title: 'Untitled'
      })
      if (node) {
        navigation.navigate('Document', { docId: node.id })
      }
    } catch (e) {
      console.error('Failed to create document:', e)
    }
  }

  const deleteDocument = async (id: string) => {
    try {
      await remove(id)
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading xNet...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>xNet</Text>
        <Text style={styles.identity}>{identity ? `${identity.slice(0, 20)}...` : ''}</Text>
      </View>

      <View style={styles.createRow}>
        <TouchableOpacity style={[styles.createButton, styles.createFlex]} onPress={createDocument}>
          <Text style={styles.createButtonText}>+ New Page</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.createButton, styles.createFlex]}
          onPress={createDatabase}
          testID="new-database"
        >
          <Text style={styles.createButtonText}>+ New Database</Text>
        </TouchableOpacity>
      </View>

      {databases.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Databases</Text>
          {databases.map((db) => (
            <TouchableOpacity
              key={db.id}
              style={styles.docItem}
              onPress={() => navigation.navigate('Database', { docId: db.id })}
              onLongPress={() => deleteDocument(db.id)}
            >
              <Text style={styles.docTitle}>▦ {db.title}</Text>
              <Text style={styles.docId}>{db.id.slice(-8)}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.sectionTitle}>Pages</Text>
        </View>
      )}

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
  createRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16 },
  createFlex: { flex: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4
  },
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
