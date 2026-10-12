"use client";

import { useState } from "react";
import { FaFacebookF, FaLink, FaShareNodes, FaWhatsapp } from "react-icons/fa6";

/** Share buttons that sit beside the article: Facebook, WhatsApp and copy link. */
export function BlogShare({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => (typeof window === "undefined" ? "" : window.location.href);
  const btn = "flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition hover:border-brand-red hover:text-brand-red";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: nothing to do
    }
  }

  return (
    <div className="flex gap-2 lg:flex-col">
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`, "_blank", "noopener,noreferrer");
        }}
        className={btn}
        aria-label="Share on Facebook"
      >
        <FaFacebookF size={13} />
      </a>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url()}`)}`, "_blank", "noopener,noreferrer");
        }}
        className={btn}
        aria-label="Share on WhatsApp"
      >
        <FaWhatsapp size={15} />
      </a>
      <button type="button" onClick={() => void copy()} className={btn} aria-label="Copy link" title={copied ? "Copied" : "Copy link"}>
        <FaLink size={13} className={copied ? "text-brand-red" : ""} />
      </button>
    </div>
  );
}

/** The small share icon in the blog's top bar: opens the phone's share sheet, or copies the page link on a computer. */
export function BlogShareIcon({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // share sheet closed or clipboard blocked: nothing to do
    }
  }
  return (
    <button type="button" onClick={() => void share()} aria-label="Share this page" title={copied ? "Link copied" : "Share"} className={`transition hover:text-brand-red ${copied ? "text-brand-red" : "text-muted"}`}>
      <FaShareNodes size={16} />
    </button>
  );
}
