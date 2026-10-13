"use client";

import { LoadingDots } from "./LoadingDots";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaHeadset, FaMobileScreenButton } from "react-icons/fa6";
import { api } from "../lib/api";
import { useLocationStore } from "../store/useLocationStore";
import { CloseIcon } from "./icons";

type RestaurantInfo = {
  name: string;
  logoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  header?: { contactButtonLabel: string };
};

type BranchContact = { id: string; phone: string | null; email: string | null };

export function ContactPopover({
  triggerClassName,
  variant = "default",
}: {
  triggerClassName: string;
  variant?: "default" | "pill";
}) {
  const [open, setOpen] = useState(false);
  const branch = useLocationStore((s) => s.branch);
  // The branch saved in the browser can be old (its number may have been changed or added since), so the current
  // details come from the live branch list, the same list the footer uses.
  const { data: branches } = useQuery({
    queryKey: ["branches-footer"],
    queryFn: () => api.public.get<BranchContact[]>("/branches"),
    staleTime: 60_000,
  });
  const liveBranch = branch ? branches?.find((b) => b.id === branch.id) : undefined;
  const { data } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Same rule as the footer: once a branch is chosen, show that branch's own number and email (where the order comes
  // from); until then fall back to the restaurant-wide ones.
  const phone = liveBranch?.phone || branch?.phone || data?.contactPhone;
  const email = liveBranch?.email || branch?.email || data?.contactEmail;

  // Header variant: a plain tap-to-call link (no dropdown).
  if (variant === "pill") {
    return (
      <a
        href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined}
        className={triggerClassName}
        aria-label={phone ? `Call ${phone}` : "Contact us"}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-9 sm:w-9 sm:rounded-lg bg-brand-red/10 text-brand-red">
          <FaMobileScreenButton size={18} className="h-[14px] w-[14px] sm:h-[18px] sm:w-[18px]" />
        </span>
        <span className="hidden flex-col items-start leading-tight lg:flex">
          <span className="text-[11px] font-semibold">{data?.header?.contactButtonLabel ?? "Contact us"}</span>
          {phone && <span className="text-[13px] font-medium">{phone}</span>}
        </span>
      </a>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={triggerClassName} aria-label="Contact us">
        <FaHeadset size={17} className="text-brand-red" />
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="font-semibold">{data?.header?.contactButtonLabel ?? "Contact"}</span>
          {phone && <span className="text-[12px] font-normal opacity-90">{phone}</span>}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-4 text-sm text-ink shadow-xl">
            <div className="flex items-start justify-between">
              <p className="font-semibold">{data?.name ?? "Contact Us"}</p>
              <button onClick={() => setOpen(false)} className="text-muted">
                <CloseIcon size={16} />
              </button>
            </div>
            {phone && (
              <a href={`tel:${phone}`} className="mt-2 block text-muted hover:text-brand-red">
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="mt-1 block text-muted hover:text-brand-red">
                {email}
              </a>
            )}
            {!data && <p className="mt-2 text-muted"><LoadingDots>Loading</LoadingDots></p>}
          </div>
        </>
      )}
    </div>
  );
}
