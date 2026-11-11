import localFont from "next/font/local";
import { BlogHeader } from "../../components/BlogHeader";

const montserrat = localFont({
  src: "../fonts/Montserrat-Variable.ttf",
  weight: "500 800",
  variable: "--font-montserrat",
  display: "swap",
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={montserrat.variable}>
      <BlogHeader />
      {children}
    </div>
  );
}
