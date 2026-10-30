# Ethara Matchmaking — Flutter app

Production-oriented mobile client for Ethara Event Matchmaking (client & guest).

## Features

- Secure login with JWT refresh
- Home overview (upcoming meetings + open requests)
- Discover / recommendations → request meeting with **mutual free slots** + **free place**
- Meeting requests: Accept / Decline / Confirm / Pick time & place
- Meetings list with meeting place details
- Forms & onboarding assignments
- **QR exchange**: save/share your org QR, scan camera or gallery, then book only if no meeting exists
- Firebase Analytics + Firebase Cloud Messaging (push)
- Ethara black / turquoise gradient design system

## Setup

```bash
cd mobile
flutter pub get
```

### API base URL

Default (Android emulator → host machine):

`http://10.0.2.2:4000/api/v1`

Override:

```bash
flutter run --dart-define=API_BASE=https://your-api.example.com/api/v1
```

iOS simulator often uses `http://127.0.0.1:4000/api/v1`.

### Firebase (required for production push + analytics)

1. Create a Firebase project and add Android + iOS apps (`com.ethara.ethara_matchmaking`).
2. Download:
   - `android/app/google-services.json`
   - `ios/Runner/GoogleService-Info.plist`
3. Enable **Cloud Messaging** and **Google Analytics**.
4. For iOS: upload APNs key in Firebase Console.

Without these files the app still runs; Firebase init fails soft and continues.

Disable Firebase entirely:

```bash
flutter run --dart-define=ENABLE_FIREBASE=false
```

### Android release

```bash
flutter build appbundle --dart-define=API_BASE=https://your-api.example.com/api/v1
```

### iOS release

```bash
flutter build ipa --dart-define=API_BASE=https://your-api.example.com/api/v1
```

## Project structure

```
lib/
  app/                 # router
  core/                # theme, network, storage, widgets
  features/            # auth, home, discover, requests, meetings, forms, profile
  services/            # firebase + API repository
```

## Backend notes

FCM device tokens are registered via `POST /users/me/push-subscriptions` using
`endpoint: fcm:{platform}:{token}` so they coexist with web push subscriptions.
