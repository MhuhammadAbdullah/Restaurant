"use client";

import { forwardRef, useEffect, useState } from "react";
import { SearchIcon } from "./icons";

const TYPE_SPEED_MS = 70;
const ERASE_SPEED_MS = 35;
const PAUSE_AFTER_TYPE_MS = 1400;
const PAUSE_AFTER_ERASE_MS = 300;

export const SearchBar = forwardRef<
  HTMLDivElement,
  { value: string; onChange: (v: string) => void; onSubmit: () => void; cycleWords: string[] }
>(function SearchBar({ value, onChange, onSubmit, cycleWords }, ref) {
  const [wordIndex, setWordIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "pausing" | "erasing">("typing");

  useEffect(() => {
    if (cycleWords.length === 0) return;
    const word = cycleWords[wordIndex % cycleWords.length] ?? "";
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (typed.length < word.length) {
        timer = setTimeout(() => setTyped(word.slice(0, typed.length + 1)), TYPE_SPEED_MS);
      } else {
        timer = setTimeout(() => setPhase("erasing"), PAUSE_AFTER_TYPE_MS);
      }
    } else {
      if (typed.length > 0) {
        timer = setTimeout(() => setTyped(typed.slice(0, -1)), ERASE_SPEED_MS);
      } else {
        timer = setTimeout(() => {
          setWordIndex((i) => (i + 1) % cycleWords.length);
          setPhase("typing");
        }, PAUSE_AFTER_ERASE_MS);
      }
    }

    return () => clearTimeout(timer);
  }, [typed, phase, wordIndex, cycleWords]);

  const placeholder = cycleWords.length > 0 ? `Search for ${typed}` : "Search for pizza, burgers, drinks...";

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") onSubmit();
  }

  return (
    <div ref={ref} className="scroll-mt-32 px-4 pb-6 pt-6 sm:px-8">
      <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-full border-2 border-solid border-brand-red bg-surface py-1.5 pl-5 pr-1.5 shadow-sm">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <button
          onClick={onSubmit}
          aria-label="Search"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red text-white transition hover:opacity-90"
        >
          <SearchIcon size={16} />
        </button>
      </div>
    </div>
  );
});
