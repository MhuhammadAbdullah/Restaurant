import { Montserrat } from "next/font/google";
import { BlogHeader } from "../../components/BlogHeader";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-montserrat", display: "swap" });

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={montserrat.variable}>
      <BlogHeader />
      {children}
    </div>
  );
}
