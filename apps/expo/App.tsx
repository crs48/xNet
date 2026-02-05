/**
 * xNet Mobile - Main App Entry
 */
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { useColorScheme } from 'react-native'
import { AppNavigator } from './src/navigation/AppNavigator'

export default function App() {
  const colorScheme = useColorScheme()

  return (
    <NavigationContainer theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </NavigationContainer>
  )
}
