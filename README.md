# Purohith Connect — Mobile (Expo)

Cross-platform (iOS + Android) React Native app built with **Expo SDK 51**.
Single binary with a **role picker on first launch** — Customer flow and Priest
flow live in the same app, sharing 90%+ of the code with the web PWA.

## What's inside

```
src/
├── lib/
│   ├── api.js            # axios client with JWT refresh + SecureStore
│   ├── auth.js           # AuthProvider, biometric session restore
│   ├── notifications.js  # Expo push token registration
│   ├── theme.js          # colors, spacing, shadows (matches web tailwind)
│   └── i18n.js           # Kannada-first / English-second strings
├── components/           # Button, Card, Pill, Field, LoadingScreen
└── screens/
    ├── RolePicker.jsx    # first-launch chooser
    ├── Login.jsx         # OTP + biometric restore
    ├── customer/
    │   ├── Home.jsx           # pooja catalog
    │   ├── PriestList.jsx     # priests for a pooja
    │   ├── PriestDetail.jsx   # profile + reviews + Book Now CTA
    │   ├── Booking.jsx        # cart with add-ons + sticky pay bar
    │   ├── MyBookings.jsx     # reschedule / cancel / invoice / dispute
    │   └── Profile.jsx
    └── priest/
        ├── Dashboard.jsx      # accept / reject / complete + KPIs
        └── Availability.jsx   # tap-to-block calendar (21-day window)
App.js                    # navigation root, deep links, push init
app.json                  # Expo config (bundle IDs, scheme purohith://)
eas.json                  # EAS build profiles
```

## Prerequisites

- Node 18+ and Yarn (or npm)
- Expo CLI (`npx expo` — no global install needed)
- **iOS**: Xcode 15+ with iOS Simulator (macOS only)
- **Android**: Android Studio with an emulator, or a real device with the
  Expo Go app

## Run it locally

```bash
cd /app/mobile
yarn install
yarn start           # opens the Metro bundler + QR code
# then press:
#   i  → iOS Simulator     (macOS only)
#   a  → Android Emulator
#   w  → Web preview        (limited: no push, no biometric)
```

Point the app at your API by editing `app.json` → `expo.extra.apiUrl`. Default
is the preview backend at `https://pooja-marketplace-3.preview.emergentagent.com`.

## Build a real installable (TestFlight / Play Internal)

```bash
npx eas login                    # once
npx eas init                     # creates the EAS project + updates app.json
npx eas build -p ios --profile production
npx eas build -p android --profile production
npx eas submit -p ios            # after TestFlight setup
npx eas submit -p android
```

**Bundle IDs** (already set):
- iOS: `com.purohithconnect.app`
- Android: `com.purohithconnect.app`

## Push notifications (Expo Push Service)

- The app calls `POST /api/users/push-token` after login with the device's Expo
  push token. The backend stores it on the user doc (`push_tokens` array).
- To send from your backend, use `https://exp.host/--/api/v2/push/send` with
  the stored token(s). No Firebase / APNs setup required — Expo Push handles
  both stores automatically.

## Deep links

Scheme: **`purohith://`** (universal link also configured for
`https://purohithconnect.com`).

Supported paths:
- `purohith://home` → Home tab
- `purohith://bookings` → My bookings tab
- `purohith://priests/<priestId>` → Priest detail
- `purohith://book/<priestId>` → Booking cart

## Biometric login

On subsequent app opens (any device with Face ID / Touch ID / fingerprint
enrolled), the Login screen shows a **"Sign in with biometrics"** button that
unlocks the stored refresh token from `expo-secure-store` and rehydrates the
session — no OTP re-entry needed.

## What's NOT in v0.1.0 (yet)

- Priest onboarding flow (KYC upload) — pending
- Chat with PuroMitra AI — pending
- Admin panel — remains web-only
- Native map / address auto-complete — currently plain text address input
- Push handler for booking status changes on the **backend** — token
  registration is live, server-side send helper will land in Sprint C.5

---

Kannada-first UI is enforced everywhere. Every user-facing string lives in
`src/lib/i18n.js` — extend it there when you add screens.
