"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";

/**
 * Heading and description under a category banner, left aligned. A long description is cut after three lines with a
 * "Show More" link, and only when it is actually long enough to be cut.
 */
export function CategoryIntro({ heading, description }: { heading: string; description?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight - el.clientHeight > 1);
  }, [description, expanded]);

  return (
    <section className="mb-8 max-w-4xl text-left">
      <h1 className="font-poppins text-xl font-bold leading-snug text-ink sm:text-2xl">{heading}</h1>
      {description && (
        <>
          <p ref={ref} className={`mt-3 whitespace-pre-line text-sm leading-relaxed text-muted sm:text-[15px] ${expanded ? "" : "line-clamp-3"}`}>
            {description}
          </p>
          {(overflowing || expanded) && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
              {expanded ? "Show Less" : "Show More"}
              <ChevronDownIcon size={14} className={expanded ? "rotate-180" : ""} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
