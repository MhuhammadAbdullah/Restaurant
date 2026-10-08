"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FaClock, FaEnvelope, FaLocationDot, FaPhoneVolume } from "react-icons/fa6";
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

  const headingClass = "text-[17px] font-semibold text-ink";
  const columnClass = "lg:border-l lg:border-line lg:pl-8";

  return (
    <footer data-no-print className="mt-16 bg-surface text-sm text-ink">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.1fr_1.4fr_1fr_1fr]">
        {isLoading ? (
          <>
            <div>
              <Skeleton className="h-14 w-40 rounded-md" />
              <Skeleton className="mt-3 h-3 w-4/5 rounded-md" />
            </div>
            <div className={columnClass}>
              <h3 className={headingClass}>Contact us</h3>
              <div className="mt-4 space-y-3">
                <Skeleton className="h-3 w-32 rounded-md" />
                <Skeleton className="h-3 w-40 rounded-md" />
                <Skeleton className="h-3 w-36 rounded-md" />
              </div>
            </div>
            <div className={columnClass}>
              <h3 className={headingClass}>Follow us</h3>
              <div className="mt-4 flex flex-wrap gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[22px] w-[22px] rounded-full" />
                ))}
              </div>
            </div>
            <div className={columnClass}>
              <h3 className={headingClass}>Help</h3>
              <div className="mt-4 space-y-3">
                <Skeleton className="h-3 w-32 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-3 w-16 rounded-md" />
              </div>
            </div>
          </>
        ) : (
        <>
        <div>
          {restaurant?.footerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.footerLogoUrl} alt={restaurant.name} className="h-20 w-auto object-contain" />
          ) : (
            <p className="font-display text-2xl text-brand-red">{restaurant?.name ?? "Restaurant"}</p>
          )}
          <p className="mt-3 text-sm text-muted">{restaurant?.footer?.tagline ?? "Exquisite range of flavours, delivered fresh."}</p>
        </div>

        <div className={columnClass}>
          <h3 className={headingClass}>Contact us</h3>
          <div className="mt-4 space-y-3 text-muted">
            {displayPhone && (
              <p className="flex items-start gap-3">
                <FaPhoneVolume size={16} className="mt-0.5 shrink-0 text-brand-red" />
                <a href={`tel:${displayPhone}`}>{displayPhone}</a>
              </p>
            )}
            {displayEmail && (
              <p className="flex items-start gap-3">
                <FaEnvelope size={16} className="mt-0.5 shrink-0 text-brand-red" />
                <a href={`mailto:${displayEmail}`}>{displayEmail}</a>
              </p>
            )}
            {displayBranch && (
              <p className="flex items-start gap-3">
                <FaLocationDot size={16} className="mt-0.5 shrink-0 text-brand-red" />
                <span>
                  {displayBranch.address}, {displayBranch.city}
                </span>
              </p>
            )}
            {(restaurant?.footer?.timingText ?? "Monday - Sunday: 11:00 AM - 04:55 AM").split("\n").map((line, i) => (
              <p key={i} className="flex items-start gap-3">
                <FaClock size={16} className={`mt-0.5 shrink-0 ${i === 0 ? "text-brand-red" : "invisible"}`} />
                <span>{line}</span>
              </p>
            ))}
          </div>
        </div>

        <div className={columnClass}>
          <h3 className={headingClass}>Follow us</h3>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {socialEntries.map(([platform, url], i) => {
              const Icon = SOCIAL_ICONS[platform];
              if (!Icon) return null;
              return (
                <span key={platform} className="flex items-center gap-3">
                  {i > 0 && <span aria-hidden="true" className="h-3.5 w-px bg-line" />}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={platform}
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-red/10 text-brand-red transition hover:bg-brand-red hover:text-white"
                  >
                    <Icon size={18} />
                  </a>
                </span>
              );
            })}
          </div>
        </div>

        <div className={columnClass}>
          <h3 className={headingClass}>Help</h3>
          <div className="mt-4 space-y-3 text-muted">
            <Link href="/complaints" className="block transition hover:text-brand-red">
              Submit Your Complaint
            </Link>
            <Link href="/terms" className="block transition hover:text-brand-red">
              {restaurant?.pages?.terms.title ?? "Terms & Conditions"}
            </Link>
            <Link href="/privacy-policy" className="block transition hover:text-brand-red">
              {restaurant?.pages?.privacy.title ?? "Privacy Policy"}
            </Link>
            <Link href="/faqs" className="block transition hover:text-brand-red">
              {restaurant?.pages?.faqs.title ?? "FAQs"}
            </Link>
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
