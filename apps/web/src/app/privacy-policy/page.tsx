"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { LegalPageLayout } from "../../components/LegalPageLayout";
import { MarkdownContent } from "../../components/MarkdownContent";
import { SkeletonText } from "../../components/skeletons";

type PageContent = { title: string; content: string };

export default function PrivacyPolicyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["cms-page-privacy"],
    queryFn: () => api.public.get<PageContent>("/cms/pages/privacy"),
  });

  return (
    <LegalPageLayout title={data?.title ?? "Privacy Policy"}>
      {isLoading && <SkeletonText lines={10} />}
      {data && <MarkdownContent content={data.content} />}
    </LegalPageLayout>
  );
}
