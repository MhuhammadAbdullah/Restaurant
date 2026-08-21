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

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Demo Restaurant",
  description: "Order online from Demo Restaurant, with an exquisite range of flavours.",
};

const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("restaurant_theme");
    var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={poppins.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
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
