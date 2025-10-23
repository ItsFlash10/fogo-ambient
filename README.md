## Fogo Ambient Expo App

### Demo

<video src="./session-demo.mp4" controls width="360" style="max-width:100%; height:auto;"></video>

If the embed doesn’t play in your viewer, open the file directly: `./session-demo.mp4`.

### Features
- Wallet connect (Phantom on iOS, Solana Mobile Wallet Adapter on Android)
- Fogo session establishment and session key injection
- Hardcoded order action with signed request to Ambient exchange
- Debug panel with Request JSON, Values JSON, cURL, and Response JSON, each with copy/share
- Clear API debug data button; auto-clears when wallet disconnects

---

## Prerequisites
- Node.js 18+ (LTS recommended)
- Yarn or npm
- Expo CLI: `npm i -g expo` (optional but helpful)
- macOS/iOS
  - Xcode 15+ (Xcode 16 recommended)
  - Cocoapods: `sudo gem install cocoapods`
- Android
  - Android Studio (latest), Android SDKs
  - Java 17 (required for React Native 0.79)

Reference: React Native environment setup for your OS: https://reactnative.dev/docs/environment-setup

---

## Dev Build (prebuild)
```bash
# install deps
yarn

# generate native projects
npx expo prebuild --clean

# iOS dev build
expo run:ios

# Android dev build
expo run:android

# start Metro (if not auto-started)
expo start
```

---

## Environment
- Expo SDK: 53
- React Native: 0.79.6 (Hermes)
- Java: 17 (Android)

### Optional env
Ambient exchange endpoint (defaults in code):
```bash
EXPO_PUBLIC_AMBIENT_EXCHANGE_URL=https://embindexer.net/ember/api/dev/v1/exchange
```

You can set this via `.env` + `app.config.js` or inject at build time.

### Optional dev signer (fallback only)
The app injects a session keypair into the Ambient client once a session is established. If for some reason that isn’t available, the Ambient client tries to read a development keypair from Expo config `extra`.

Example (not required for normal usage):
```json
{
  "expo": {
    "extra": {
      "solanaWalletPrivateKey": [1,2,3, ..., 64 bytes total]
    }
  }
}
```

---

## Wallet requirements
- iOS: Install Phantom Mobile, then connect from the app.
- Android: Install a wallet supporting Solana Mobile Wallet Adapter. Ensure the wallet is available before connecting.

---

## Code: where to look

### App entry
Provider wiring + UI sections (WalletConnector, details, debug panel):

```tsx
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FogoSessionProvider endpoint="https://testnet.fogo.io" domain="https://perps.ambient.finance">
        <SafeAreaView style={[styles.safeArea, Platform.OS === 'android' ? styles.safeAreaAndroid : null]}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Fogo Sessions Demo</Text>
            <WalletConnector />
            <WalletConnectionDetails />
            <OrderDebugPanel />
          </ScrollView>
        </SafeAreaView>
      </FogoSessionProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  safeAreaAndroid: { paddingTop: StatusBar.currentHeight },
  scrollContent: { padding: 16, paddingBottom: 32 },
  title: { color: 'white', fontSize: 18, fontWeight: '600', marginBottom: 12 },
});
```

### Hardcoded order + debug (OrderDebugPanel)
IOC order; `orderWithDebug` returns request body + raw response; renders cURL and copy/share:

```tsx
const req = {
  grouping: 'na' as const,
  orders: [
    { a: 0, b: true, p: '131425', s: '0.00021', r: false, c: String(Date.now()), t: { limit: { tif: 'Ioc' as const } } }
  ]
};

const result = await orderWithDebug(req);
setRequestBody(result.requestBody);
setRawResponse(result.rawResponse ?? result.mapped);
```

### Ambient client (sign + post)
Signs with session key injected by the session provider. Fallback to dev key if not injected:

```ts
import { setAmbientKeypair, orderWithDebug, EXCHANGE_API_URL } from './app/ambient/clients';

// During session establishment, a Keypair is injected:
setAmbientKeypair(sessionKeypair);

// Creates body: { action, nonce, signature, pubkey } and posts to the exchange URL
const { url, requestBody, rawResponse } = await orderWithDebug(req);
```

---

## Using the app
1) Launch on device/simulator.
2) Connect wallet via the WalletConnector.
3) Place the order with the "Place Order" button in the Debug Order section.
4) Inspect Request JSON, Values JSON, cURL, and Response JSON; use the copy/share buttons as needed.
5) Use "Clear API data" to reset. Data also clears automatically on wallet disconnect.

---

## Troubleshooting
- Button stuck on “Connecting”
  - Force close the app and relaunch.
  - Ensure required wallet app is installed and reachable.
- iOS Cocoapods issues
  - Run `cd ios && pod install`, then re-run the app.
- Android build issues (Java)
  - Ensure Java 17 is active (e.g., `java -version`).
- Network/connectivity
  - Verify `EXPO_PUBLIC_AMBIENT_EXCHANGE_URL` is reachable from the device.

---

## Scripts
- `yarn start` – Start Metro bundler
- `yarn ios` – Build & run iOS app
- `yarn android` – Build & run Android app
- `yarn web` – Start web (experimental)
- `yarn prebuild:clean` – Clean prebuild of native projects


