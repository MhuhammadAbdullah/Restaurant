"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { extractToc } from "../../lib/markdownToc";
import { LegalPageLayout } from "../../components/LegalPageLayout";
import { MarkdownContent } from "../../components/MarkdownContent";
import { SkeletonText } from "../../components/skeletons";

type PageContent = { title: string; content: string };

export default function TermsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["cms-page-terms"],
    queryFn: () => api.public.get<PageContent>("/cms/pages/terms"),
  });
  const toc = useMemo(() => (data ? extractToc(data.content) : []), [data]);

  return (
    <LegalPageLayout title={data?.title ?? "Terms & Conditions"} subtitle="Please read these terms carefully before placing an order with us." toc={toc}>
      {isLoading && <SkeletonText lines={12} />}
      {data && (data.content.trim() ? <MarkdownContent content={data.content} /> : <p className="text-sm text-muted">This page has not been filled in yet.</p>)}
    </LegalPageLayout>
  );
}
