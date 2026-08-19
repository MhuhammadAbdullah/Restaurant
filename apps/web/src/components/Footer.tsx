"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useLocationStore } from "../store/useLocationStore";
import { FacebookIcon, InstagramIcon, TwitterIcon, YoutubeIcon, TiktokIcon, LinkedinIcon, WhatsappIcon } from "./icons";
import { Skeleton } from "./skeletons";

type RestaurantInfo = {
  name: string;
  logoUrl: string | null;
  footerLogoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  socialLinks: Record<string, string> | null;
  footer: { tagline: string; timingText: string };
  pages: {
    terms: { title: string };
    privacy: { title: string };
    faqs: { title: string };
  };
};
type BranchLite = { id: string; name: string; address: string; city: string; phone: string | null; email: string | null };

const SOCIAL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  twitter: TwitterIcon,
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
  linkedin: LinkedinIcon,
  whatsapp: WhatsappIcon,
};

/** These pages render their own minimal chrome (see LegalPageLayout) — no site header/footer around them. */
const NO_CHROME_PATHS = ["/terms", "/privacy-policy", "/faqs"];

export function Footer() {
  const pathname = usePathname();
  const selectedBranch = useLocationStore((s) => s.branch);

  const { data: restaurant, isLoading } = useQuery({
    queryKey: ["cms-restaurant-footer"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: branches } = useQuery({
    queryKey: ["branches-footer"],
    queryFn: () => api.public.get<BranchLite[]>("/branches"),
  });

  if (NO_CHROME_PATHS.includes(pathname)) return null;

  // Once the customer has picked a delivery/pick-up branch, the footer should reflect THAT
  // branch's own contact details/address (where the order actually ships from) rather than a
  // generic restaurant-wide number. Before a branch is chosen, fall back to the first listed one.
  const displayBranch = selectedBranch ?? branches?.[0];
  const displayPhone = selectedBranch?.phone ?? restaurant?.contactPhone;
  const displayEmail = selectedBranch?.email ?? restaurant?.contactEmail;
  const socialEntries = Object.entries(restaurant?.socialLinks ?? {}).filter(([, url]) => !!url);

  const headingClass = "text-[17px] font-bold tracking-wide text-ink";

  return (
    <footer data-no-print className="mt-16 border-t border-line bg-surface text-sm text-ink">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-5">
        {isLoading ? (
          <>
            <div>
              <Skeleton className="h-9 w-40 rounded-md" />
              <Skeleton className="mt-3 h-3 w-4/5 rounded-md" />
            </div>
            <div>
              <h3 className={headingClass}>Contact Us</h3>
              <div className="mt-3 space-y-2.5">
                <Skeleton className="h-3 w-32 rounded-md" />
                <Skeleton className="h-3 w-40 rounded-md" />
                <Skeleton className="h-3 w-36 rounded-md" />
              </div>
            </div>
            <div>
              <h3 className={headingClass}>Our Timing</h3>
              <div className="mt-3 space-y-2.5">
                <Skeleton className="h-3 w-44 rounded-md" />
              </div>
            </div>
            <div>
              <h3 className={headingClass}>Legal</h3>
              <div className="mt-3 space-y-2.5">
                <Skeleton className="h-3 w-32 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-3 w-16 rounded-md" />
              </div>
            </div>
            <div>
              <h3 className={headingClass}>Follow Us</h3>
              <div className="mt-3 flex flex-wrap gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[22px] w-[22px] rounded-full" />
                ))}
              </div>
            </div>
          </>
        ) : (
        <>
        <div>
          {restaurant?.footerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.footerLogoUrl} alt={restaurant.name} className="h-14 w-auto object-contain" />
          ) : (
            <p className="font-display text-2xl text-brand-red">{restaurant?.name ?? "Restaurant"}</p>
          )}
          <p className="mt-2 text-sm text-muted">{restaurant?.footer?.tagline ?? "Exquisite range of flavours, delivered fresh."}</p>
        </div>

        <div>
          <h3 className={headingClass}>Contact Us</h3>
          <div className="mt-3 space-y-2">
            {displayPhone && (
              <p className="text-muted">
                <span className="font-bold text-ink">Phone: </span>
                <a href={`tel:${displayPhone}`}>{displayPhone}</a>
              </p>
            )}
            {displayEmail && (
              <p className="text-muted">
                <span className="font-bold text-ink">Email: </span>
                <a href={`mailto:${displayEmail}`}>{displayEmail}</a>
              </p>
            )}
            {displayBranch && (
              <p className="text-muted">
                <span className="font-bold text-ink">Address: </span>
                {displayBranch.address}, {displayBranch.city}
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className={headingClass}>Our Timing</h3>
          <div className="mt-3 space-y-2 text-muted">
            {(restaurant?.footer?.timingText ?? "Monday - Sunday: 11:00 AM - 04:55 AM").split("\n").map((line, i) => {
              const colonIndex = line.indexOf(":");
              if (colonIndex === -1) return <p key={i}>{line}</p>;
              return (
                <p key={i}>
                  <span className="font-bold text-ink">{line.slice(0, colonIndex + 1)}</span>
                  {line.slice(colonIndex + 1)}
                </p>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className={headingClass}>Legal</h3>
          <div className="mt-3 space-y-2 text-muted">
            <Link href="/terms" className="block">
              {restaurant?.pages?.terms.title ?? "Terms & Conditions"}
            </Link>
            <Link href="/privacy-policy" className="block">
              {restaurant?.pages?.privacy.title ?? "Privacy Policy"}
            </Link>
            <Link href="/faqs" className="block">
              {restaurant?.pages?.faqs.title ?? "FAQs"}
            </Link>
          </div>
        </div>

        <div>
          <h3 className={headingClass}>Follow Us</h3>
          <div className="mt-3 flex flex-wrap gap-4">
            {socialEntries.map(([platform, url]) => {
              const Icon = SOCIAL_ICONS[platform];
              if (!Icon) return null;
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={platform}
                  className="text-muted transition hover:text-brand-red"
                >
                  <Icon size={22} />
                </a>
              );
            })}
          </div>
        </div>
        </>
        )}
      </div>

      <div className="bg-brand-red py-4 text-center text-sm text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4">
          <span>
            © {new Date().getFullYear()} {restaurant?.name ?? "Restaurant"} · Powered by {restaurant?.name ?? "Restaurant"} Online Ordering
          </span>
        </div>
      </div>
    </footer>
  );
}
