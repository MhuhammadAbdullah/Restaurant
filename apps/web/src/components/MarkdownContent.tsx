"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h2: ({ children }) => <h2 className="mt-6 text-base font-bold text-ink first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 text-sm font-bold text-ink">{children}</h3>,
  p: ({ children }) => <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">{children}</ol>,
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

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
