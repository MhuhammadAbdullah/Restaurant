import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BankDiscountsHeader } from "../../components/BankDiscountsHeader";
import { getBankDiscounts } from "../../lib/bank-discounts";
import { blogImage } from "../../lib/blog";
import { pageMetadata } from "../../lib/seo";

export const revalidate = 30;

export const generateMetadata = async (): Promise<Metadata> => {
  const [base, page] = await Promise.all([pageMetadata("bank-discounts", "/bank-discounts"), getBankDiscounts()]);
  return { ...base, title: page?.heading || base.title || "Bank Discounts", description: page?.subheading || base.description };
};

/** "Bank Discounts" -> "Bank" in black and "Discounts" in red. */
function Heading({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  const last = words.pop() ?? "";
  return (
    <h1 className="text-center text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
      {words.length > 0 && <>{words.join(" ")} </>}
      <span className="text-brand-red">{last}</span>
    </h1>
  );
}

export default async function BankDiscountsPage() {
  const page = await getBankDiscounts();
  // Switched off in the admin (or the API is unreachable): the page does not exist.
  if (!page || !page.enabled) notFound();

  return (
    <>
      <BankDiscountsHeader heading={page.heading} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <Heading text={page.heading} />
        {page.subheading && <p className="mt-4 text-center text-base text-muted">{page.subheading}</p>}

        {page.items.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">New offers are coming soon. Please check back.</p>
        ) : (
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2">
            {page.items.map((item, index) => {
              const img = (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={blogImage(item.image, 1000)} alt={item.name} loading={index < 2 ? "eager" : "lazy"} fetchPriority={index < 2 ? "high" : "auto"} className="block aspect-square w-full rounded-2xl object-cover" />
              );
              return (
                <div key={item.id} className="rounded-3xl bg-surface p-2 shadow-[0_2px_14px_rgba(0,0,0,0.08)]">
                  {item.linkUrl ? (
                    <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" aria-label={item.name} className="block">
                      {img}
                    </a>
                  ) : (
                    img
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
