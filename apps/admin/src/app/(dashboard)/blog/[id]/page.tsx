"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";
import { RichTextEditor } from "../../../../components/RichTextEditor";

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  content: string;
  category: string;
  authorName: string;
  authorImage: string | null;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

type Form = {
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  content: string;
  category: string;
  authorName: string;
  authorImage: string;
  status: "DRAFT" | "PUBLISHED";
  publishAt: string; // value of a datetime-local input, or ""
  metaTitle: string;
  metaDescription: string;
};

const EMPTY: Form = { title: "", slug: "", excerpt: "", coverImage: "", content: "", category: "", authorName: "", authorImage: "", status: "DRAFT", publishAt: "", metaTitle: "", metaDescription: "" };

/** ISO -> the local "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-500">{label}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

export default function BlogEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canSave = hasPermission(me, isNew ? "cms.create" : "cms.edit");

  const { data: post, isLoading, error } = useQuery({ queryKey: ["blog-post", id], queryFn: () => api.get<Post>(`/blog/admin/posts/${id}`), enabled: !isNew });

  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [ready, setReady] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!post) return;
    const next: Form = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      coverImage: post.coverImage ?? "",
      content: post.content,
      category: post.category,
      authorName: post.authorName,
      authorImage: post.authorImage ?? "",
      status: post.status,
      publishAt: toLocalInput(post.publishedAt),
      metaTitle: post.metaTitle ?? "",
      metaDescription: post.metaDescription ?? "",
    };
    setForm(next);
    setSaved(next);
    setSlugTouched(true);
    setReady(true);
  }, [post]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Warn before leaving with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  async function save(nextStatus?: "DRAFT" | "PUBLISHED") {
    const status = nextStatus ?? form.status;
    if (!form.title.trim()) return toast.error("Give the post a title");
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim(),
        coverImage: form.coverImage,
        content: form.content,
        category: form.category.trim(),
        authorName: form.authorName.trim(),
        authorImage: form.authorImage,
        status,
        publishedAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
        metaTitle: form.metaTitle.trim(),
        metaDescription: form.metaDescription.trim(),
      };
      const saved = isNew ? await api.post<Post>("/blog/admin/posts", body) : await api.patch<Post>(`/blog/admin/posts/${id}`, body);
      await queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
      toast.success(status === "PUBLISHED" ? "Post published." : "Saved as draft.");
      if (isNew) {
        router.replace(`/blog/${saved.id}`);
      } else {
        queryClient.setQueryData(["blog-post", id], saved);
        const next = { ...form, status, slug: saved.slug, publishAt: toLocalInput(saved.publishedAt) };
        setForm(next);
        setSaved(next);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the post");
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && isLoading) return <p className="text-sm text-neutral-400">Loading...</p>;
  if (!isNew && (error || !post)) {
    return (
      <div>
        <p className="text-sm text-red-600">{error instanceof ApiError ? error.message : "Post not found"}</p>
        <Link href="/blog" className="mt-2 inline-block text-sm font-medium text-brand-red">Back to the blog</Link>
      </div>
    );
  }

  const scheduled = form.status === "PUBLISHED" && form.publishAt && new Date(form.publishAt).getTime() > Date.now();

  return (
    <div>
      <Link href="/blog" className="text-xs font-medium text-neutral-500 hover:text-brand-red">← All posts</Link>
      <h1 className="mt-1 text-xl font-semibold text-neutral-900">{isNew ? "New post" : "Edit post"}</h1>

      {!canSave && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You can view this post but not change it.</p>}

      <fieldset disabled={!canSave || saving} className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card title="Article">
            <Field label="Title *">
              <input
                value={form.title}
                onChange={(e) => {
                  set("title", e.target.value);
                  if (isNew && !slugTouched) set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100));
                }}
                className="input w-full text-base font-semibold"
                placeholder="e.g. Where to Find Crispy Fried Chicken in Lahore?"
              />
            </Field>
            <Field label="Short summary" hint="Shown on the blog list under the title. If empty, the start of the article is used.">
              <textarea value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={3} maxLength={500} className="input w-full" />
            </Field>
            <Field label="Content" hint="Use headings for sections. For an FAQ block, add a heading called FAQs followed by a numbered list.">
              {ready && <RichTextEditor value={form.content} onChange={(md) => set("content", md)} />}
            </Field>
          </Card>

          <Card title="Search engines (optional)">
            <Field label="Page title" hint="Empty means the post title is used.">
              <input value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} maxLength={120} className="input w-full" />
            </Field>
            <Field label="Description" hint="Shown in Google results. Empty means the summary is used.">
              <textarea value={form.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} rows={2} maxLength={300} className="input w-full" />
            </Field>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card title="Publish">
            <Field label="Status">
              <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-sm font-medium">
                {(["DRAFT", "PUBLISHED"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => set("status", s)} className={`flex-1 px-3 py-2 ${form.status === s ? "bg-brand-red text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
                    {s === "DRAFT" ? "Draft" : "Published"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Publish date" hint={scheduled ? "This post will appear on the website at this time." : "Leave empty to publish right now. Pick a later time to schedule it."}>
              <input type="datetime-local" value={form.publishAt} onChange={(e) => set("publishAt", e.target.value)} className="input w-full" />
            </Field>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => void save()} disabled={saving || (!dirty && !isNew)} className="flex-1 rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {saving ? "Saving..." : isNew ? (form.status === "PUBLISHED" ? "Publish" : "Save draft") : "Save changes"}
              </button>
              {!isNew && form.status === "DRAFT" && (
                <button type="button" onClick={() => void save("PUBLISHED")} disabled={saving} className="rounded-lg border border-brand-red px-3 py-2 text-sm font-medium text-brand-red hover:bg-red-50 disabled:opacity-60">
                  Publish
                </button>
              )}
            </div>
            <p className={`text-xs ${dirty ? "font-medium text-amber-600" : "text-neutral-400"}`}>{dirty ? "You have unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}</p>
          </Card>

          <Card title="Cover image">
            <ImageUploadField label="Cover" hideLabel folder="banners" value={form.coverImage} onChange={(url) => set("coverImage", url)} shape="landscape" hint="Wide image, about 1200 x 630" />
          </Card>

          <Card title="Details">
            <Field label="Label above the title" hint="e.g. your restaurant name or a topic.">
              <input value={form.category} onChange={(e) => set("category", e.target.value)} maxLength={60} className="input w-full" />
            </Field>
            <Field label="Author name">
              <input value={form.authorName} onChange={(e) => set("authorName", e.target.value)} maxLength={80} className="input w-full" />
            </Field>
            <Field label="Author picture" hint="Optional. Without one, the website's default picture is shown.">
              <div className="w-24">
                <ImageUploadField label="Author picture" hideLabel compact folder="restaurant" value={form.authorImage} onChange={(url) => set("authorImage", url)} />
              </div>
            </Field>
            <Field label="Web address" hint={`/blog/${form.slug || "..."}`}>
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
                }}
                className="input w-full"
              />
            </Field>
          </Card>
        </aside>
      </fieldset>

      <style jsx global>{`
        .input {
          border-radius: 0.5rem;
          border: 1px solid #d4d4d4;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
