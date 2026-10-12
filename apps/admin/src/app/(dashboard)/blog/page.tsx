"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { confirmDialog } from "../../../store/useConfirmStore";
import { EditIcon, TrashIcon } from "../../../components/icons";

type PostRow = {
  id: string;
  title: string;
  slug: string;
  coverImage: string | null;
  category: string;
  authorName: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function stateOf(p: PostRow): { label: string; tone: string } {
  if (p.status === "DRAFT") return { label: "Draft", tone: "bg-neutral-100 text-neutral-600" };
  if (p.publishedAt && new Date(p.publishedAt).getTime() > Date.now()) return { label: "Scheduled", tone: "bg-amber-50 text-amber-700" };
  return { label: "Published", tone: "bg-green-50 text-green-700" };
}

const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export default function BlogListPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "cms.create");
  const canEdit = hasPermission(me, "cms.edit");
  const canDelete = hasPermission(me, "cms.delete");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PUBLISHED" | "DRAFT">("ALL");

  const { data, isLoading } = useQuery({ queryKey: ["blog-posts"], queryFn: () => api.get<PostRow[]>("/blog/admin/posts") });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => (filter === "ALL" || p.status === filter) && (!q || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
  }, [data, search, filter]);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/blog/admin/posts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
      toast.success("Post deleted.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not delete the post"),
  });

  async function askDelete(p: PostRow) {
    if (!(await confirmDialog({ title: "Delete this post?", message: `"${p.title}" will be removed from the website for good.`, confirmLabel: "Delete", tone: "danger" }))) return;
    remove.mutate(p.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Blog</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Write articles for the website&apos;s Blog page. Drafts stay hidden until you publish them.</p>
        </div>
        {canCreate && (
          <Link href="/blog/new" className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            + New post
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts" className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-xs font-medium">
          {(["ALL", "PUBLISHED", "DRAFT"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`px-3 py-2 ${filter === f ? "bg-brand-red text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
              {f === "ALL" ? "All" : f === "PUBLISHED" ? "Published" : "Drafts"}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-400">{rows.length} post{rows.length === 1 ? "" : "s"}</p>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {isLoading ? (
          <p className="p-6 text-sm text-neutral-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">{(data ?? []).length === 0 ? "No posts yet. Write your first one." : "No posts match your search."}</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rows.map((p) => {
              const s = stateOf(p);
              return (
                <li key={p.id} className="flex items-center gap-4 p-3 sm:p-4">
                  {p.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverImage} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[11px] text-neutral-400">No image</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={`/blog/${p.id}`} className="block truncate text-sm font-semibold text-neutral-900 hover:text-brand-red">{p.title}</Link>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      /blog/{p.slug}
                      {p.category ? ` · ${p.category}` : ""}
                      {p.authorName ? ` · ${p.authorName}` : ""}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-400">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${s.tone}`}>{s.label}</span>
                      <span>{p.status === "PUBLISHED" ? dateText(p.publishedAt) : `Edited ${dateText(p.updatedAt)}`}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canEdit && (
                      <Link href={`/blog/${p.id}`} aria-label="Edit post" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-brand-red">
                        <EditIcon size={15} />
                      </Link>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => void askDelete(p)} aria-label="Delete post" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600">
                        <TrashIcon size={15} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
