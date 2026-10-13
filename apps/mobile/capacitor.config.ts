import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The app is a native shell around the live storefront: it opens SERVER_URL (the real website) inside the app, so a
 * website deploy updates every installed app without going through the stores again.
 *
 * Set CAP_SERVER_URL to your live site (HTTPS) before running `pnpm sync`, e.g.
 *   CAP_SERVER_URL=https://www.yourrestaurant.com pnpm --filter @restaurant/mobile sync
 */
const SERVER_URL = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  // Store identity. Change it once, before the first store upload: it can never be changed afterwards.
  appId: "com.gevinifoods.app",
  appName: "Gevini Foods",
  webDir: "www",
  server: SERVER_URL
    ? {
        url: SERVER_URL,
        cleartext: false,
        // Payment pages and sign-in stay inside the app instead of jumping out to the browser.
        allowNavigation: [new URL(SERVER_URL).hostname, "*.payfast.co.za", "*.apps.net.pk", "*.cloudinary.com"],
      }
    : undefined,
  ios: { contentInset: "automatic", backgroundColor: "#ffffff" },
  android: { backgroundColor: "#ffffff", allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, launchAutoHide: true, backgroundColor: "#ffffff", showSpinner: false },
    StatusBar: { style: "DARK", backgroundColor: "#ED2320", overlaysWebView: false },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
