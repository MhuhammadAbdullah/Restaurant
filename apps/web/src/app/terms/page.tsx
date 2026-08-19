"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { LegalPageLayout } from "../../components/LegalPageLayout";
import { MarkdownContent } from "../../components/MarkdownContent";
import { SkeletonText } from "../../components/skeletons";

type PageContent = { title: string; content: string };

export default function TermsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["cms-page-terms"],
    queryFn: () => api.public.get<PageContent>("/cms/pages/terms"),
  });

  return (
    <LegalPageLayout title={data?.title ?? "Terms & Conditions"}>
      {isLoading && <SkeletonText lines={10} />}
      {data && <MarkdownContent content={data.content} />}
    </LegalPageLayout>
  );
}
