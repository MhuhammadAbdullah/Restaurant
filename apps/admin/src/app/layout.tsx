import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Toaster } from "../components/Toaster";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { THEME_INIT_SCRIPT } from "../components/HeaderTools";

export const metadata: Metadata = {
  title: "Demo Restaurant Admin",
  description: "Super Admin & Staff dashboard for Demo Restaurant.",
};

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
      </body>
    </html>
  );
}
