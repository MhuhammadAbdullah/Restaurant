"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { extractToc } from "../../lib/markdownToc";
import { LegalPageLayout } from "../../components/LegalPageLayout";
import { MarkdownContent } from "../../components/MarkdownContent";
import { SkeletonText } from "../../components/skeletons";

type PageContent = { title: string; content: string };

export default function PrivacyPolicyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["cms-page-privacy"],
    queryFn: () => api.public.get<PageContent>("/cms/pages/privacy"),
  });
  const toc = useMemo(() => (data ? extractToc(data.content) : []), [data]);

  return (
    <LegalPageLayout title={data?.title ?? "Privacy Policy"} subtitle="How we collect, use and protect your personal information." toc={toc}>
      {isLoading && <SkeletonText lines={12} />}
      {data && (data.content.trim() ? <MarkdownContent content={data.content} /> : <p className="text-sm text-muted">This page has not been filled in yet.</p>)}
    </LegalPageLayout>
  );
}
