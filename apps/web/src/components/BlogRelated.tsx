"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa6";
import { BlogCard } from "./BlogCard";
import type { BlogSummary } from "../lib/blog";

const GAP = 24;

/** "Related posts": a row of cards that glides one card at a time with the round arrows (or by swiping). */
export function BlogRelated({ posts }: { posts: BlogSummary[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(true);
  const [end, setEnd] = useState(true);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setStart(el.scrollLeft <= 2);
    setEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, posts.length]);

  function move(dir: 1 | -1) {
    const el = track.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.offsetWidth + GAP), behavior: "smooth" });
  }

  const canScroll = !(start && end);
  const arrow = "flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-default";

  return (
    <section className="mx-auto mt-14 w-full max-w-5xl px-4 sm:px-6">
      <div className="flex items-center gap-5">
        <h2 className="font-montserrat text-2xl font-bold text-[#2b2b2b] dark:text-ink">Related posts</h2>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        {canScroll && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => move(-1)} disabled={start} aria-label="Previous posts" className={`${arrow} ${start ? "border-line text-muted/50" : "border-ink text-ink hover:border-brand-red hover:text-brand-red"}`}>
              <FaArrowLeft size={12} />
            </button>
            <button type="button" onClick={() => move(1)} disabled={end} aria-label="Next posts" className={`${arrow} ${end ? "border-line text-muted/50" : "border-ink text-ink hover:border-brand-red hover:text-brand-red"}`}>
              <FaArrowRight size={12} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={track}
        onScroll={measure}
        className="mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {posts.map((p) => (
          <div key={p.id} className="w-[85%] shrink-0 snap-start sm:w-[calc((100%-24px)/2)] lg:w-[calc((100%-48px)/3)]">
            <BlogCard post={p} compact />
          </div>
        ))}
      </div>
    </section>
  );
}
