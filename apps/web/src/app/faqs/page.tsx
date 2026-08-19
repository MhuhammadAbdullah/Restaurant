"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { LegalPageLayout } from "../../components/LegalPageLayout";
import { FaqAccordion } from "../../components/FaqAccordion";
import { Skeleton } from "../../components/skeletons";

type FaqItem = { id: string; question: string; answer: string };
type PageContent = { title: string; items: FaqItem[] };

export default function FaqsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["cms-page-faqs"],
    queryFn: () => api.public.get<PageContent>("/cms/pages/faqs"),
  });

  return (
    <LegalPageLayout title={data?.title ?? "Frequently Asked Questions"}>
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}
      {data && <FaqAccordion items={data.items} />}
    </LegalPageLayout>
  );
}
