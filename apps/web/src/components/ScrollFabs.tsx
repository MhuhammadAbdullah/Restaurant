"use client";

import { SearchIcon, ArrowUpIcon } from "./icons";
import { useEffect } from "react";

export function ScrollFabs({
  visible,
  onSearchClick,
  onTopClick,
}: {
  visible: boolean;
  onSearchClick: () => void;
  onTopClick: () => void;
}) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("restaurant-scroll-fabs", { detail: visible }));
  }, [visible]);

  return (
    <>
      <button
        onClick={onSearchClick}
        aria-label="Scroll to search"
        className={`fixed bottom-5 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition-[opacity,transform] duration-300 hover:opacity-90 sm:bottom-[1.375rem] sm:left-6 sm:h-11 sm:w-11 ${visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-75 opacity-0"}`}
        tabIndex={visible ? 0 : -1}
      >
        <SearchIcon size={18} />
      </button>
      <button
        onClick={onTopClick}
        aria-label="Scroll to top"
        className={`fixed bottom-5 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition-[opacity,transform] duration-300 hover:opacity-90 sm:bottom-[1.375rem] sm:right-6 sm:h-11 sm:w-11 ${visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-75 opacity-0"}`}
        tabIndex={visible ? 0 : -1}
      >
        <ArrowUpIcon size={18} />
      </button>
    </>
  );
}
