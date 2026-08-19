"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition ${
        active ? "bg-brand-red text-white" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function BoldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h7a3.5 3.5 0 0 1 0 7H6zM6 11h7.5a3.5 3.5 0 0 1 0 7H6z" />
    </svg>
  );
}
function ItalicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4h6M6 20h6M13 4 9 20" />
    </svg>
  );
}
function BulletListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}
function OrderedListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h1v-.8M4 10.5h1.8M4 6h1.8M4 18.5c.3-.5 1.8-1 1.8 0 0 .5-.5.7-1 1h1" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 8 4 12l5 4M4 12h10a6 6 0 0 1 0 12h-1" />
    </svg>
  );
}
function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 8 5 4-5 4M20 12H10a6 6 0 0 0 0 12h1" />
    </svg>
  );
}
function StrikeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M8 7c0-1.4 1.7-2.5 4-2.5s4 1 4 2.3M8.5 17c0 1.4 1.7 2.5 3.7 2.5s4-1 4-2.6" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 15 15 9" />
      <path d="M8.5 13.5a3.5 3.5 0 0 1 0-5l1.8-1.8a3.5 3.5 0 0 1 5 5l-.9.9" />
      <path d="M15.5 10.5a3.5 3.5 0 0 1 0 5l-1.8 1.8a3.5 3.5 0 0 1-5-5l.9-.9" />
    </svg>
  );
}
function QuoteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M8 7.5H5.8A1.8 1.8 0 0 0 4 9.3V11a1.8 1.8 0 0 0 1.8 1.8h.6a.9.9 0 0 1 .9.9c0 1.4-.9 2.4-2.3 2.4v1.4c2.4 0 4-1.5 4-4V9.3A1.8 1.8 0 0 0 7.2 7.5H8Z" />
      <path d="M17 7.5h-2.2A1.8 1.8 0 0 0 13 9.3V11a1.8 1.8 0 0 0 1.8 1.8h.6a.9.9 0 0 1 .9.9c0 1.4-.9 2.4-2.3 2.4v1.4c2.4 0 4-1.5 4-4V9.3A1.8 1.8 0 0 0 16.2 7.5H17Z" />
    </svg>
  );
}
function DividerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 12h16" />
    </svg>
  );
}

/**
 * Tiptap (ProseMirror) WYSIWYG editor — the de facto standard React rich text editor.
 * Content is serialized as Markdown (via tiptap-markdown) so it stays compatible with the
 * existing storage format and the public site's react-markdown renderer. No separate
 * preview pane — the editing surface itself already shows the formatted result.
 */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (markdown: string) => void }) {
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Markdown.configure({ html: false }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap-content",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    },
    onSelectionUpdate: () => {
      setLinkMenuOpen(false);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (linkMenuOpen) {
      setLinkUrl(editor.getAttributes("link").href ?? "");
    }
  }, [linkMenuOpen, editor]);

  if (!editor) return null;

  function applyLink() {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^([a-z][a-z0-9+.-]*:|\/)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkMenuOpen(false);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkMenuOpen(false);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-300 focus-within:border-brand-red">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 p-1.5">
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <StrikeIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={editor.isActive("link") || linkMenuOpen}
          onClick={() => setLinkMenuOpen((open) => !open)}
        >
          <LinkIcon />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        <ToolbarButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Subheading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        <ToolbarButton label="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <BulletListIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered List"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <OrderedListIcon />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <QuoteIcon />
        </ToolbarButton>
        <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <DividerIcon />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <RedoIcon />
        </ToolbarButton>
      </div>

      {linkMenuOpen && (
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setLinkMenuOpen(false);
              }
            }}
            placeholder="https://example.com"
            className="h-8 flex-1 rounded-md border border-neutral-300 bg-white px-2.5 text-sm outline-none focus:border-brand-red"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-8 rounded-md bg-brand-red px-3 text-xs font-medium text-white"
          >
            Apply
          </button>
          {editor.isActive("link") && (
            <button
              type="button"
              onClick={removeLink}
              className="h-8 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Remove
            </button>
          )}
        </div>
      )}

      <EditorContent editor={editor} className="max-h-[420px] min-h-[240px] overflow-y-auto bg-white px-4 py-3" />

      <style jsx global>{`
        .tiptap-content {
          outline: none;
          font-size: 0.875rem;
          line-height: 1.6;
          color: #262626;
        }
        .tiptap-content h2 {
          font-size: 1rem;
          font-weight: 700;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .tiptap-content h2:first-child {
          margin-top: 0;
        }
        .tiptap-content h3 {
          font-size: 0.9rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.4rem;
        }
        .tiptap-content p {
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .tiptap-content ul,
        .tiptap-content ol {
          padding-left: 1.25rem;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .tiptap-content ul {
          list-style: disc;
        }
        .tiptap-content ol {
          list-style: decimal;
        }
        .tiptap-content li {
          margin-top: 0.15rem;
        }
        .tiptap-content strong {
          font-weight: 700;
        }
        .tiptap-content a {
          color: #dc2626;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .tiptap-content blockquote {
          margin: 0.75rem 0;
          border-left: 3px solid #dc2626;
          padding-left: 0.75rem;
          color: #525252;
          font-style: italic;
        }
        .tiptap-content hr {
          margin: 1.25rem 0;
          border: none;
          border-top: 1px solid #e5e5e5;
        }
      `}</style>
    </div>
  );
}
