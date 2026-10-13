"use client";

import Link from "next/link";
import { useMemo } from "react";
import { slugify } from "../lib/slug";
import type { Category, Deal, Product } from "../lib/types";
import { ProductCard } from "./ProductCard";
import { DealCard } from "./DealCard";

type Group = { category: Category; products: Product[]; deals: Deal[] };

/**
 * Search results as the menu cards, grouped by category. Each group is headed by its category name, and a click on that name
 * opens the category's page. It works on the menu that is already loaded, so results appear while you type.
 */
export function SearchResults({
  query,
  products,
  deals,
  categories,
  dealsCategory,
  onOpenProduct,
  onOpenDeal,
}: {
  query: string;
  products: Product[];
  deals: Deal[];
  categories: Category[];
  dealsCategory?: Category;
  onOpenProduct: (id: string) => void;
  onOpenDeal: (id: string) => void;
}) {
  const { groups, count } = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const catById = new Map(categories.map((c) => [c.id, c]));
    const matches = (name: string, category: string, extra = "") => {
      const hay = `${name} ${category} ${extra}`.toLowerCase();
      return words.length > 0 && words.every((w) => hay.includes(w));
    };
    const byCategory = new Map<string, Group>();
    const groupFor = (c: Category) => {
      let g = byCategory.get(c.id);
      if (!g) byCategory.set(c.id, (g = { category: c, products: [], deals: [] }));
      return g;
    };
    for (const p of products) {
      const cat = p.categoryId ? catById.get(p.categoryId) : undefined;
      if (cat && matches(p.name, cat.name, p.description ?? "")) groupFor(cat).products.push(p);
    }
    for (const d of deals) {
      const cat = (d.categoryId ? catById.get(d.categoryId) : undefined) ?? dealsCategory;
      if (cat && matches(d.name, cat.name, d.description ?? "")) groupFor(cat).deals.push(d);
    }
    const list = [...byCategory.values()].sort((a, b) => a.category.sortOrder - b.category.sortOrder);
    return { groups: list, count: list.reduce((n, g) => n + g.products.length + g.deals.length, 0) };
  }, [query, products, deals, categories, dealsCategory]);

  return (
    <section aria-live="polite">
      <p className="mb-4 text-sm text-muted">
        {count === 0 ? "No results" : `${count} result${count === 1 ? "" : "s"}`} for &quot;{query.trim()}&quot;
      </p>
      {count === 0 ? (
        <p className="text-sm text-muted">Nothing on the menu matches that. Try another word, like a dish or a category name.</p>
      ) : (
        groups.map(({ category, products: ps, deals: ds }) => (
          <div key={category.id} className="mb-10">
            <Link href={`/category/${slugify(category.name)}`} className="mb-4 inline-block font-poppins text-[22px] font-bold leading-tight text-ink transition hover:text-brand-red hover:underline sm:text-[26px]">
              {category.name}
            </Link>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {ps.map((p) => (
                <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p.id)} />
              ))}
              {ds.map((d) => (
                <DealCard key={d.id} deal={d} onClick={() => onOpenDeal(d.id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
