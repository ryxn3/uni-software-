# Vokabo for Android

The vocabulary trainer from [`../vocab`](../vocab), packaged as an Android app with
[Capacitor](https://capacitorjs.com). Everything runs locally on the phone: charts, text
recognition (Tesseract WebAssembly) and the English + German language data are bundled
into the APK, so scanning and practising work offline. Only the optional Claude AI scan
needs internet.

## Get the APK

Every push that touches `vocab/` or `android-app/` builds a new APK in GitHub Actions
(`.github/workflows/android.yml`) and publishes it as the **android-latest** release.
Open that release on your phone, download `Vokabo.apk` and allow installing apps from
your browser when asked. New builds install as updates and keep your decks and stats.

## Build it yourself

Needs Node 20+, JDK 21 and the Android SDK (e.g. via Android Studio).

```bash
cd android-app
npm install
npm run apk          # bundles ../vocab into www/, syncs, runs gradle
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

`scripts/build-web.mjs` copies `../vocab` into `www/` and replaces every CDN script,
the Google font and the Tesseract worker/core/language paths with local copies.
Edit the app in `../vocab`, never in `www/`.

The debug signing key (`android/app/vokabo-debug.keystore`) is committed on purpose, so
each new APK can update the installed one. It's fine for a sideloaded personal app;
use your own private key before publishing anywhere.
