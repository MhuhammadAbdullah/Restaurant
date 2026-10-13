import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Header } from "../components/Header";
import { LocationModal } from "../components/LocationModal";
import { MarketingPopup } from "../components/MarketingPopup";
import { AuthModal } from "../components/AuthModal";
import { CartBar } from "../components/CartBar";
import { CartDrawer } from "../components/CartDrawer";
import { Footer } from "../components/Footer";
import { Toaster } from "../components/Toaster";
import { GlobalLoadingScreen } from "../components/GlobalLoadingScreen";
import { SeoScripts } from "../components/SeoScripts";
import { PwaRegister } from "../components/PwaRegister";
import { NativeAppBridge } from "../components/NativeAppBridge";
import { applyTitleTemplate, getSite, siteUrlOf } from "../lib/seo";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

/** Colours the phone's address bar / status bar with the brand red. */
export const viewport: Viewport = { themeColor: "#ED2320" };

/** Site-wide defaults, all editable in Admin > SEO & Marketing. Pages override title/description/canonical in their own layout. */
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const seo = site.seo;
  const home = seo.pages?.home ?? {};
  const title = home.title || seo.defaultTitle || site.name;
  const description = home.description || seo.defaultDescription || `Order online from ${site.name}, with an exquisite range of flavours.`;
  const image = home.image || seo.defaultImage || site.logoUrl || undefined;
  const t = seo.tracking ?? {};
  return {
    metadataBase: new URL(siteUrlOf(seo)),
    title: { default: title, template: applyTitleTemplate(seo.titleTemplate, "%s", site.name) },
    description,
    applicationName: site.name,
    appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
    // Browser-tab icon: the one chosen in Admin > Header & Branding, else the logo. A small PNG is requested from Cloudinary.
    icons: (() => {
      const pick = seo.faviconUrl || site.logoUrl;
      if (!pick) return undefined;
      const small = pick.includes("res.cloudinary.com") && pick.includes("/image/upload/") ? pick.replace("/image/upload/", "/image/upload/c_fit,w_96,h_96,f_png/") : pick;
      return { icon: [{ url: small, sizes: "any" }], apple: site.logoUrl || pick };
    })(),
    alternates: { canonical: home.canonical || "./" },
    robots: seo.noindexSite || home.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    verification: {
      google: t.googleSiteVerification || undefined,
      other: t.bingSiteVerification ? { "msvalidate.01": t.bingSiteVerification } : undefined,
    },
    openGraph: { type: "website", siteName: site.name, title, description, images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("restaurant_theme");
    var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  return (
    <html lang="en" suppressHydrationWarning className={poppins.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <SeoScripts site={site} />
        <PwaRegister />
        <NativeAppBridge />
        <Providers>
          <Header />
          <LocationModal />
          <AuthModal />
          <MarketingPopup />
          <Toaster />
          {children}
          <Footer />
          <CartBar />
          <CartDrawer />
          <GlobalLoadingScreen />
        </Providers>
      </body>
    </html>
  );
}
