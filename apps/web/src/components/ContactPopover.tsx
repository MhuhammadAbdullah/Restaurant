"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaHeadset } from "react-icons/fa6";
import { api } from "../lib/api";
import { CloseIcon } from "./icons";

type RestaurantInfo = {
  name: string;
  logoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  header?: { contactButtonLabel: string };
};

export function ContactPopover({ triggerClassName }: { triggerClassName: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={triggerClassName} aria-label="Contact us">
        <FaHeadset size={17} className="text-brand-red" />
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="font-semibold">{data?.header?.contactButtonLabel ?? "Contact"}</span>
          {data?.contactPhone && <span className="text-[12px] font-normal opacity-90">{data.contactPhone}</span>}
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
            {data?.contactPhone && (
              <a href={`tel:${data.contactPhone}`} className="mt-2 block text-muted hover:text-brand-red">
                {data.contactPhone}
              </a>
            )}
            {data?.contactEmail && (
              <a href={`mailto:${data.contactEmail}`} className="mt-1 block text-muted hover:text-brand-red">
                {data.contactEmail}
              </a>
            )}
            {!data && <p className="mt-2 text-muted">Loading...</p>}
          </div>
        </>
      )}
    </div>
  );
}
