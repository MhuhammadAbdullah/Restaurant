# Mobile app (Android + iOS)

A native shell (Capacitor) around the live website. It opens your real site inside the app, so every website deploy
updates all installed apps. Only the shell (icon, name, splash, native features) goes through the stores.

## Before the first build

1. **Live website** with HTTPS (the Vercel production domain or your own domain).
2. In `capacitor.config.ts` set the final `appId` (for example `com.yourbrand.app`) and `appName`. The `appId` can never
   be changed after the first store upload.
3. Tell the app where the site lives and sync:

   ```bash
   CAP_SERVER_URL=https://www.yourrestaurant.com pnpm --filter @restaurant/mobile sync
   ```

   (Windows PowerShell: `$env:CAP_SERVER_URL="https://www.yourrestaurant.com"; pnpm --filter @restaurant/mobile sync`)
4. Icons and splash come from `assets/` (1024px icon, 2732px splash). To change them, replace the files and run
   `pnpm --filter @restaurant/mobile assets`, then sync again.

## Android (Google Play)

Needs: Android Studio (includes Java), a Google Play Developer account (one-time $25).

1. `pnpm --filter @restaurant/mobile android` opens the project in Android Studio.
2. Test on a phone or emulator (Run button).
3. Build > Generate Signed App Bundle (AAB). Create a signing key and **keep it safe**: losing it means you can never update the app.
4. Play Console: create the app, upload the AAB, fill the store listing (description, screenshots, privacy policy URL,
   data safety form), then submit for review.

## iOS (App Store)

Needs: a Mac with Xcode (or a cloud Mac service such as Codemagic), an Apple Developer account ($99 a year).

1. On the Mac: `pnpm install`, then `CAP_SERVER_URL=... pnpm --filter @restaurant/mobile sync`, then `cd apps/mobile/ios/App && pod install` (once).
2. `pnpm --filter @restaurant/mobile ios` opens Xcode. Set your Team under Signing & Capabilities.
3. Product > Archive > Distribute App > App Store Connect.
4. App Store Connect: listing, screenshots (6.7" and 6.5" iPhone), privacy policy URL, App Privacy answers, then submit.

### Getting Apple to approve it

Apple rejects apps that are only a website in a frame (guideline 4.2). Things that help:

- Native push notifications (plugin already installed; needs Apple push key and a server that sends to it, not done yet).
- Use of location to pick the nearest branch, and order tracking.
- A demo account in the review notes, and a working checkout (cash on delivery works for review).

## What is already in place

- App opens the live site, white splash, red status bar (Android).
- Android back button goes to the previous page, and closes the app from the first page (`NativeAppBridge` in the web app).
- Payment pages stay inside the app (`allowNavigation` in the config).
- Offline: the web app already shows an "You are offline" page.
