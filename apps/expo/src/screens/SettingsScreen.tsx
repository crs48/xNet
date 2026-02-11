/**
 * Settings screen
 *
 * Updated to use the new DataBridge API via XNetContext.
 */
import { useXNet } from '@xnet/react'
import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useColorScheme
} from 'react-native'

export function SettingsScreen() {
  const { authorDID: identity, hubStatus, syncManager } = useXNet()
  const colorScheme = useColorScheme()

  const handleClearData = async () => {
    // Would show confirmation dialog and clear data
    console.log('Clear data requested')
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identity</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Your DID</Text>
            <Text style={styles.value} selectable>
              {identity || 'Not initialized'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{hubStatus}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Connected Peers</Text>
            <Text style={styles.value}>{syncManager?.connection?.roomCount ?? 0}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Theme</Text>
            <Text style={styles.value}>{colorScheme === 'dark' ? 'Dark' : 'Light'} (System)</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
            <Text style={styles.dangerButtonText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>1.0.0</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Built with</Text>
            <Text style={styles.value}>xNet SDK</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  section: {
    marginTop: 24,
    marginHorizontal: 16
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 8
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4
  },
  value: {
    fontSize: 16,
    color: '#1a1a1a',
    fontFamily: 'monospace'
  },
  dangerButton: {
    backgroundColor: '#ff3b30',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  dangerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16
  }
})
