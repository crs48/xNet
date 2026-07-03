// Root entry for Expo Go / EAS. This app uses App.tsx + React Navigation (not
// expo-router), so it registers the root component the classic way. Metro
// resolves `./App` to App.tsx.
import { registerRootComponent } from 'expo'

import App from './App'

registerRootComponent(App)
