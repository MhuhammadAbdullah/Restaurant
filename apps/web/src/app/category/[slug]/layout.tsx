import type { Metadata } from "next";
import { categorySlug, getCategories, getSite, siteUrlOf } from "../../../lib/seo";

type Props = { params: Promise<{ slug: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [site, categories] = await Promise.all([getSite(), getCategories()]);
  const category = categories.find((c) => categorySlug(c) === slug);
  const o = site.seo.pages?.[`category:${slug}`] ?? {};
  const name = category?.name ?? slug.replace(/-/g, " ");
  const description = o.description || category?.description || `Order ${name} online from ${site.name}. Fresh, hot and delivered to your door.`;
  const image = o.image || category?.image || site.seo.defaultImage || undefined;
  const path = `/category/${slug}`;
  return {
    title: o.title ? { absolute: o.title } : `${name} - Order Online`,
    description,
    alternates: { canonical: o.canonical || path },
    robots: o.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title: o.title || name, description, url: path, images: image ? [image] : undefined },
  };
}

export default async function CategoryLayout({ params, children }: Props) {
  const { slug } = await params;
  const [site, categories] = await Promise.all([getSite(), getCategories()]);
  const category = categories.find((c) => categorySlug(c) === slug);
  const base = siteUrlOf(site.seo);
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: base },
      { "@type": "ListItem", position: 2, name: category?.name ?? slug, item: `${base}/category/${slug}` },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
