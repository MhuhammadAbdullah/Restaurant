"use client";

import { forwardRef, useEffect, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { FaBold, FaItalic, FaLink, FaListUl, FaListOl, FaQuoteLeft, FaRotateLeft, FaRotateRight } from "react-icons/fa6";

export type EmailBodyEditorHandle = { insertText: (text: string) => void };

function Tool({ onClick, active, label, children }: { onClick: () => void; active?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition ${active ? "bg-brand-red text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
    >
      {children}
    </button>
  );
}

/** Rich-text box for email bodies. Produces HTML (not markdown) because that is what an email is made of. */
export const EmailBodyEditor = forwardRef<EmailBodyEditorHandle, { value: string; onChange: (html: string) => void; resetKey?: string; minHeight?: number; disabled?: boolean }>(function EmailBodyEditor(
  { value, onChange, resetKey, minHeight = 260, disabled },
  ref,
) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false, autolink: true })],
    content: value,
    immediatelyRender: false,
    editable: !disabled,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: { attributes: { class: "prose-email focus:outline-none px-4 py-3 text-sm leading-relaxed text-neutral-800" } },
  });

  useImperativeHandle(ref, () => ({ insertText: (text) => editor?.chain().focus().insertContent(text).run() }), [editor]);

  // load a different template's content into the same editor
  useEffect(() => {
    if (editor && editor.getHTML() !== value) editor.commands.setContent(value, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return <div className="h-64 animate-pulse rounded-lg border border-neutral-200 bg-neutral-50" />;

  function setLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address (https://...)", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor!.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-300 bg-white focus-within:border-brand-red">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5">
        <Tool label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><FaBold size={13} /></Tool>
        <Tool label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><FaItalic size={13} /></Tool>
        <Tool label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><span className="text-xs font-bold">H</span></Tool>
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        <Tool label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><FaListUl size={13} /></Tool>
        <Tool label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><FaListOl size={13} /></Tool>
        <Tool label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><FaQuoteLeft size={12} /></Tool>
        <Tool label="Link" active={editor.isActive("link")} onClick={setLink}><FaLink size={13} /></Tool>
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        <Tool label="Undo" onClick={() => editor.chain().focus().undo().run()}><FaRotateLeft size={12} /></Tool>
        <Tool label="Redo" onClick={() => editor.chain().focus().redo().run()}><FaRotateRight size={12} /></Tool>
      </div>
      <div style={{ minHeight }} className="[&_.ProseMirror]:min-h-[inherit] [&_blockquote]:border-l-4 [&_blockquote]:border-brand-red/40 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-600 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-brand-red [&_a]:underline">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
