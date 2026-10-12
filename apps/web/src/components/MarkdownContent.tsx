"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { slugify } from "../lib/slug";

/** Plain text of a heading's children, so the same id can be derived for the table of contents. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

const components: Components = {
  h1: ({ children }) => <h2 id={slugify(textOf(children))} className="mt-8 scroll-mt-24 text-xl font-bold text-ink first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 id={slugify(textOf(children))} className="mt-8 scroll-mt-24 text-lg font-bold text-ink first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textOf(children))} className="mt-5 scroll-mt-24 text-base font-semibold text-ink">{children}</h3>,
  p: ({ children }) => <p className="mt-3 text-[15px] leading-7 text-muted">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-muted marker:text-brand-red">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-muted marker:font-semibold marker:text-brand-red">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
  del: ({ children }) => <span className="line-through">{children}</span>,
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-brand-red pl-3 text-sm italic leading-relaxed text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-5 border-t border-line" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-red underline underline-offset-2">
      {children}
    </a>
  ),
};

/** Blog articles: headings in Montserrat Bold, dark grey, 24px (H2) and 21px (H3). */
const blogComponents: Components = {
  ...components,
  h1: ({ children }) => <h2 id={slugify(textOf(children))} className="mt-9 scroll-mt-24 font-montserrat text-[24px] font-bold text-[#2b2b2b] first:mt-0 dark:text-ink">{children}</h2>,
  h2: ({ children }) => <h2 id={slugify(textOf(children))} className="mt-9 scroll-mt-24 font-montserrat text-[24px] font-bold text-[#2b2b2b] first:mt-0 dark:text-ink">{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textOf(children))} className="mt-6 scroll-mt-24 font-montserrat text-[21px] font-bold text-[#2b2b2b] dark:text-ink">{children}</h3>,
};

export function MarkdownContent({ content, variant }: { content: string; variant?: "blog" }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={variant === "blog" ? blogComponents : components}>
      {content}
    </ReactMarkdown>
  );
}
