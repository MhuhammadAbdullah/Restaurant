import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Toaster } from "../components/Toaster";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PwaRegister } from "../components/PwaRegister";
import { THEME_INIT_SCRIPT } from "../components/HeaderTools";
import { getBranding, squareIcon } from "../lib/branding";

/** Colours the phone's status bar / address bar with the brand red. */
export const viewport: Viewport = { themeColor: "#ED2320" };

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  const icon = b.faviconUrl || b.logoUrl;
  const small = icon && icon.includes("res.cloudinary.com") && icon.includes("/image/upload/") ? icon.replace("/image/upload/", "/image/upload/c_fit,w_96,h_96,f_png/") : icon;
  return {
    title: `${b.name} Admin`,
    description: `Super Admin & Staff dashboard for ${b.name}.`,
    applicationName: `${b.name} Admin`,
    // The admin panel is private: keep it out of search results.
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: `${b.name} Admin`, statusBarStyle: "default" },
    icons: small ? { icon: [{ url: small, sizes: "any" }], apple: b.logoUrl ? squareIcon(b.logoUrl, 180) : small } : undefined,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          {children}
          <Toaster />
          <ConfirmDialog />
        </Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
