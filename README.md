# CUIT Hub

Tauri 2 WebView shell for CUIT Hub. The desktop targets (Windows, macOS, Linux) and Android use the same remote site: `https://hub.cuit.dev`. The installed application name is `CUIT Hub`.

## Requirements

- Node.js 18+
- Rust stable and Cargo
- Desktop platform dependencies required by Tauri 2
- Android Studio, Android SDK/NDK and JDK 17+ for Android builds

Install dependencies and start the desktop WebView:

```bash
npm install
npm run app:dev
```

## Installable builds

```bash
# Windows MSI/NSIS, macOS DMG, Linux DEB/RPM/AppImage
npm run app:build

# Android APK
npm run android:init
npm run android:apk

# Android App Bundle for Google Play
npm run android:aab
```

Desktop artifacts are written to `src-tauri/target/release/bundle/`. Android artifacts are written to `src-tauri/gen/android/app/build/outputs/`. Configure an Android signing key in Android Studio or Gradle before publishing a release.

## Push notifications

CUIT Hub currently uses FoF PWA Web Push (`/sw`) and exposes the native Firebase token endpoint at `/api/pwa/firebase_push_subscriptions`. The app integrates with both mechanisms:

- Windows/macOS/Linux use native notifications plus a one-minute API polling fallback while the app is running.
- Android obtains an FCM token, requests Android 13+ notification permission, and registers the token with the existing FoF PWA endpoint.
- All platforms continue to poll while the app is open, so notifications still work if FCM is not configured.

For Android background push, add a repository secret named `GOOGLE_SERVICES_JSON_BASE64` containing the Base64-encoded `google-services.json` from the same Firebase project used by CUIT Hub. Its Android package must be `dev.cuit.hub`.

For a signed release AAB, configure `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Without signing secrets, the workflow still publishes an installable debug APK.

## Automated releases

The workflow in `.github/workflows/release.yml` builds Windows NSIS and Android packages. Push a version tag to publish a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Runtime behavior

- The window starts on a local animated splash screen, then opens CUIT Hub in the platform WebView.
- The splash screen checks connectivity and offers retry when offline.
- WebView cookies, LocalStorage and login state persist between launches.
- Site navigation stays inside the app WebView.
- A network connection is required; a network error page is shown when the site cannot be reached.
