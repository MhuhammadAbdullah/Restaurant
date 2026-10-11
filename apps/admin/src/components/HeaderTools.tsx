"use client";

import { useEffect, useState } from "react";
import { FaCompress, FaExpand, FaMoon, FaSun } from "react-icons/fa6";

const THEME_KEY = "admin_theme";
const btn = "flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800";

/** Full screen on/off for the whole admin (handy on a POS or kitchen display). */
export function FullscreenToggle() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // the browser refused (some embedded views do); nothing to do
    }
  }

  return (
    <button type="button" onClick={toggle} aria-label={full ? "Exit full screen" : "Enter full screen"} title={full ? "Exit full screen" : "Full screen"} className={`${btn} hidden sm:flex`}>
      {full ? <FaCompress size={15} /> : <FaExpand size={15} />}
    </button>
  );
}

/** Light / dark switch. The choice is remembered on this device; first visit follows the computer's setting. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // storage blocked: the theme just won't be remembered
    }
  }

  return (
    <button type="button" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className={btn}>
      {dark ? <FaSun size={15} /> : <FaMoon size={15} />}
    </button>
  );
}

/** Runs before first paint so a dark-mode user never sees a white flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)t="dark";if(t==="dark")document.documentElement.classList.add("dark");}catch(e){}})();`;
