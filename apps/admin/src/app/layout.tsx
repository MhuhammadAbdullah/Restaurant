import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Toaster } from "../components/Toaster";

export const metadata: Metadata = {
  title: "Demo Restaurant Admin",
  description: "Super Admin & Staff dashboard for Demo Restaurant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
