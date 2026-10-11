import { slugify } from "./slug";

export type TocItem = { id: string; text: string; level: 1 | 2 | 3 };

/** Headings (#, ##, ###) of a markdown document, for the "On this page" list. Ignores anything inside code fences. */
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    // drop markdown emphasis/links so the label and the generated id match what the renderer shows
    const text = m[2]!.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "").trim();
    const id = slugify(text);
    if (text && id) items.push({ id, text, level: m[1]!.length as 1 | 2 | 3 });
  }
  return items;
}
