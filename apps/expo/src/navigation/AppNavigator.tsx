/**
 * App navigator
 */
import type { RootStackParamList } from './types'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'
import { DocumentScreen } from '../screens/DocumentScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { SettingsScreen } from '../screens/SettingsScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()

export function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="Document"
        component={DocumentScreen}
        options={{
          title: 'Document',
          headerBackTitle: 'Back'
        }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  )
}
