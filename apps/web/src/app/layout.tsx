import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Header } from "../components/Header";
import { LocationModal } from "../components/LocationModal";
import { AuthModal } from "../components/AuthModal";
import { CartBar } from "../components/CartBar";
import { CartDrawer } from "../components/CartDrawer";
import { Footer } from "../components/Footer";
import { Toaster } from "../components/Toaster";
import { GlobalLoadingScreen } from "../components/GlobalLoadingScreen";
import { SeoScripts } from "../components/SeoScripts";
import { applyTitleTemplate, getSite, siteUrlOf } from "../lib/seo";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

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
        <Providers>
          <Header />
          <LocationModal />
          <AuthModal />
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
