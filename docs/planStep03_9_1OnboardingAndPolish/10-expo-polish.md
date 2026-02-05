# 10: Expo Polish

> Documentation and build setup for the mobile app (compile-your-own)

**Duration:** 2 days
**Dependencies:** Existing Expo app in `apps/expo`

## Overview

The Expo app is functional but not yet ready for app store distribution. For now, we provide clear documentation for developers to build and run it themselves, plus EAS Build configuration for TestFlight/internal testing.

## Strategy

| Phase      | Target Audience | Distribution                |
| ---------- | --------------- | --------------------------- |
| **Now**    | Developers      | Build from source           |
| **Soon**   | Early adopters  | TestFlight / Internal Track |
| **Future** | General users   | App Store / Play Store      |

## Implementation

### 1. Developer Documentation

```markdown
<!-- apps/static/src/content/docs/mobile/build-from-source.mdx -->

# Building the Mobile App

The xNet mobile app is built with Expo/React Native. Here's how to build and run it.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Xcode 15+ (for iOS)
- Android Studio (for Android)
- Expo CLI: `npm install -g expo-cli`

## Clone and Install

\`\`\`bash
git clone https://github.com/xnet-dev/xnet.git
cd xnet
pnpm install
\`\`\`

## Run in Development

### iOS Simulator

\`\`\`bash
cd apps/expo
pnpm ios
\`\`\`

### Android Emulator

\`\`\`bash
cd apps/expo
pnpm android
\`\`\`

### Physical Device (Expo Go)

\`\`\`bash
cd apps/expo
pnpm start

# Scan QR code with Expo Go app

\`\`\`

> **Note:** Expo Go has limitations. For full functionality, use a development build.

## Development Build

For features that require native code (like passkeys):

\`\`\`bash

# iOS

cd apps/expo
npx expo run:ios --device

# Android

npx expo run:android --device
\`\`\`

## Production Build

### iOS (requires Apple Developer account)

\`\`\`bash
cd apps/expo
npx expo build:ios
\`\`\`

### Android

\`\`\`bash
cd apps/expo
npx expo build:android
\`\`\`

## Known Limitations

The mobile app currently has these limitations compared to desktop:

| Feature           | Desktop | Mobile      | Notes                    |
| ----------------- | ------- | ----------- | ------------------------ |
| Rich text editing | Full    | Basic       | TipTap has mobile quirks |
| Canvas            | Full    | View only   | Touch editing WIP        |
| File attachments  | Full    | Camera only | File picker limited      |
| Passkeys          | Full    | Partial     | Platform support varies  |
| Offline           | Full    | Full        | Works great!             |
| Background sync   | Full    | Limited     | iOS background limits    |

## Troubleshooting

### Metro bundler crashes

\`\`\`bash

# Clear caches

cd apps/expo
npx expo start --clear
\`\`\`

### iOS build fails

\`\`\`bash

# Reset CocoaPods

cd apps/expo/ios
pod deintegrate
pod install
\`\`\`

### Android build fails

\`\`\`bash

# Clear Gradle cache

cd apps/expo/android
./gradlew clean
\`\`\`
```

### 2. EAS Build Configuration

```json
// apps/expo/eas.json
{
  "cli": {
    "version": ">= 7.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "buildConfiguration": "Release"
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "distribution": "store",
      "ios": {
        "buildConfiguration": "Release"
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "team@xnet.dev",
        "ascAppId": "1234567890",
        "appleTeamId": "XXXXXXXXXX"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "internal"
      }
    }
  }
}
```

### 3. App Configuration

```typescript
// apps/expo/app.config.ts

import { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'xNet',
  slug: 'xnet',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff'
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'dev.xnet.app',
    buildNumber: '1',
    infoPlist: {
      NSFaceIDUsageDescription: 'Use Face ID to unlock your xNet identity',
      NSCameraUsageDescription: 'Take photos to add to pages',
      NSPhotoLibraryUsageDescription: 'Select photos to add to pages'
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff'
    },
    package: 'dev.xnet.app',
    versionCode: 1,
    permissions: [
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.CAMERA'
    ]
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow xNet to use Face ID to protect your identity'
      }
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Allow xNet to take photos'
      }
    ]
  ],
  extra: {
    eas: {
      projectId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    },
    defaultHubUrl: process.env.EXPO_PUBLIC_HUB_URL ?? 'wss://hub.xnet.dev'
  },
  owner: 'xnet-dev'
})
```

### 4. GitHub Actions for EAS Build

```yaml
# .github/workflows/expo-build.yml

name: Expo Build

on:
  workflow_dispatch:
    inputs:
      platform:
        description: 'Platform'
        required: true
        type: choice
        options:
          - ios
          - android
          - all
      profile:
        description: 'Build profile'
        required: true
        type: choice
        options:
          - development
          - preview
          - production

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build iOS
        if: inputs.platform == 'ios' || inputs.platform == 'all'
        run: |
          cd apps/expo
          eas build --platform ios --profile ${{ inputs.profile }} --non-interactive

      - name: Build Android
        if: inputs.platform == 'android' || inputs.platform == 'all'
        run: |
          cd apps/expo
          eas build --platform android --profile ${{ inputs.profile }} --non-interactive
```

### 5. TestFlight Setup Guide

```markdown
<!-- apps/static/src/content/docs/mobile/testflight.mdx -->

# TestFlight Distribution

For early adopters who want to test the iOS app.

## Joining the TestFlight

1. [Install TestFlight](https://apps.apple.com/app/testflight/id899247664) from the App Store
2. Click this link: [Join xNet TestFlight](https://testflight.apple.com/join/XXXXXX)
3. Open in TestFlight and install

## What to Expect

TestFlight builds are:

- Updated weekly with latest features
- May have bugs (that's why we're testing!)
- Limited to 10,000 testers

## Providing Feedback

Found a bug? Have a suggestion?

1. Take a screenshot
2. Shake your device to open the feedback form
3. Describe what happened

Or file an issue on [GitHub](https://github.com/xnet-dev/xnet/issues).

## TestFlight vs App Store

| Aspect       | TestFlight   | App Store  |
| ------------ | ------------ | ---------- |
| Stability    | Beta         | Production |
| Updates      | Frequent     | Reviewed   |
| Availability | Limited      | Everyone   |
| Features     | Cutting edge | Stable     |
```

### 6. Mobile-Specific Features

```typescript
// apps/expo/src/hooks/useBiometricAuth.ts

import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { useState, useEffect, useCallback } from 'react'

export interface BiometricAuthResult {
  isAvailable: boolean
  biometryType: 'fingerprint' | 'facial' | 'iris' | 'none'
  isEnrolled: boolean
  authenticate: () => Promise<boolean>
  hasStoredIdentity: boolean
}

export function useBiometricAuth(): BiometricAuthResult {
  const [isAvailable, setIsAvailable] = useState(false)
  const [biometryType, setBiometryType] = useState<BiometricAuthResult['biometryType']>('none')
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [hasStoredIdentity, setHasStoredIdentity] = useState(false)

  useEffect(() => {
    checkBiometrics()
    checkStoredIdentity()
  }, [])

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    const enrolled = await LocalAuthentication.isEnrolledAsync()
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync()

    setIsAvailable(hasHardware)
    setIsEnrolled(enrolled)

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      setBiometryType('facial')
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      setBiometryType('fingerprint')
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      setBiometryType('iris')
    }
  }

  const checkStoredIdentity = async () => {
    const stored = await SecureStore.getItemAsync('xnet-identity')
    setHasStoredIdentity(stored !== null)
  }

  const authenticate = useCallback(async (): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock xNet',
      fallbackLabel: 'Use passcode',
      cancelLabel: 'Cancel'
    })

    return result.success
  }, [])

  return {
    isAvailable,
    biometryType,
    isEnrolled,
    authenticate,
    hasStoredIdentity
  }
}
```

### 7. Known Limitations Documentation

```markdown
<!-- apps/expo/README.md -->

# xNet Mobile App

React Native / Expo mobile app for xNet.

## Status: Developer Preview

This app is functional but not yet in app stores. See the [build guide](https://xnet.dev/docs/mobile/build-from-source) to run it yourself.

## Known Limitations

### Rich Text Editor

- TipTap has quirks on mobile
- Some formatting options hidden to fit screen
- Selection can be finicky

### Canvas

- View-only for now
- Touch editing planned for future

### Background Sync

- iOS limits background execution to ~30 seconds
- May miss updates while app is closed
- Opens and syncs instantly when foregrounded

### Passkeys

- iOS 16+ required for full passkey support
- Android 14+ required for passkey
- Falls back to biometric + secure storage on older versions

### File Attachments

- Camera capture works
- File picker limited to photos
- Large files may be slow

## Development

\`\`\`bash

# Install dependencies

pnpm install

# Start development server

pnpm start

# Run on iOS simulator

pnpm ios

# Run on Android emulator

pnpm android
\`\`\`

## Testing

\`\`\`bash
pnpm test
\`\`\`

## Building

See EAS Build documentation: https://docs.expo.dev/build/introduction/
```

## Testing

```typescript
describe('Expo App', () => {
  describe('Biometric Auth', () => {
    it('detects available biometrics', async () => {
      const result = renderHook(() => useBiometricAuth())

      await waitFor(() => {
        expect(result.current.isAvailable).toBeDefined()
      })
    })
  })

  describe('Secure Storage', () => {
    it('stores and retrieves identity', async () => {
      await SecureStore.setItemAsync('test-key', 'test-value')
      const value = await SecureStore.getItemAsync('test-key')
      expect(value).toBe('test-value')
    })
  })
})
```

## Validation Gate

- [ ] Development build runs on iOS simulator
- [ ] Development build runs on Android emulator
- [x] EAS Build produces installable builds
- [ ] Biometric authentication works
- [ ] Hub connection works
- [x] Documentation clearly explains build process
- [x] Known limitations documented
- [ ] TestFlight link available for early adopters

---

[Back to README](./README.md) | [Next: Final Polish ->](./11-final-polish.md)
