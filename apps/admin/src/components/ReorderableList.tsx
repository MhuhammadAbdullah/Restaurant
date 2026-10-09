"use client";

import { useEffect, useRef, useState } from "react";

type ReorderableItem = { id: string };

const GAP = 8;

function scrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return window;
}

/**
 * Generic drag-to-reorder list (pointer events, no dependency). Grab the handle: the row follows the
 * pointer, the others slide out of the way, and it settles into place on release. Works with mouse,
 * touch and pen, and auto-scrolls near the edges. `onReorder` fires with the full new id order.
 */
export function ReorderableList<T extends ReorderableItem>({
  items,
  onReorder,
  renderItem,
  disabled,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  renderItem: (item: T, index: number) => React.ReactNode;
  disabled?: boolean;
}) {
  // Optimistic order kept after a drop so the list doesn't snap back while the server saves.
  const [pending, setPending] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; dy: number; to: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const session = useRef<{
    id: string;
    from: number;
    startY: number;
    startScroll: number;
    scroller: HTMLElement | Window;
    centers: number[]; // original centres (content coordinates), in render order
    height: number;
    lastY: number;
    raf: number;
  } | null>(null);

  const itemKey = items.map((i) => i.id).join("|");
  useEffect(() => {
    setPending(null);
  }, [itemKey]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = pending ? pending.map((id) => byId.get(id)).filter((i): i is T => !!i) : items;
  const orderedKey = ordered.map((i) => i.id).join("|");
  if (pending && ordered.length !== items.length) {
    // items changed shape (add/remove) – ignore stale optimistic order
    queueMicrotask(() => setPending(null));
  }

  const scrollTopOf = (s: HTMLElement | Window) => (s instanceof Window ? window.scrollY : s.scrollTop);

  function compute(clientY: number) {
    const s = session.current;
    if (!s) return;
    const dy = clientY - s.startY + (scrollTopOf(s.scroller) - s.startScroll);
    const center = (s.centers[s.from] ?? 0) + dy;
    let to = 0;
    s.centers.forEach((c, i) => {
      if (i !== s.from && c < center) to++;
    });
    setDrag({ id: s.id, dy, to });
  }

  function tick() {
    const s = session.current;
    if (!s) return;
    const edge = 70;
    const vh = window.innerHeight;
    let speed = 0;
    if (s.lastY < edge) speed = -Math.ceil(((edge - s.lastY) / edge) * 16);
    else if (s.lastY > vh - edge) speed = Math.ceil(((s.lastY - (vh - edge)) / edge) * 16);
    if (speed) {
      if (s.scroller instanceof Window) window.scrollBy(0, speed);
      else s.scroller.scrollTop += speed;
      compute(s.lastY);
    }
    s.raf = requestAnimationFrame(tick);
  }

  function onPointerDown(e: React.PointerEvent, id: string, index: number) {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = rowRefs.current.get(id);
    if (!el) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const scroller = scrollParent(el);
    const st = scrollTopOf(scroller);
    const centers = ordered.map((it) => {
      const r = rowRefs.current.get(it.id)!.getBoundingClientRect();
      return r.top + r.height / 2 + st;
    });
    session.current = {
      id,
      from: index,
      startY: e.clientY,
      startScroll: st,
      scroller,
      centers,
      height: el.getBoundingClientRect().height,
      lastY: e.clientY,
      raf: requestAnimationFrame(tick),
    };
    setDrag({ id, dy: 0, to: index });
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = session.current;
    if (!s) return;
    s.lastY = e.clientY;
    compute(e.clientY);
  }

  function finish(commit: boolean) {
    const s = session.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    session.current = null;
    const d = drag;
    setDrag(null);
    if (!commit || !d || d.to === s.from) return;
    const ids = ordered.map((i) => i.id);
    ids.splice(s.from, 1);
    ids.splice(d.to, 0, s.id);
    setPending(ids);
    Promise.resolve(onReorder(ids)).catch(() => setPending(null));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => () => { if (session.current) cancelAnimationFrame(session.current.raf); }, []);

  function shiftFor(index: number): number {
    if (!drag || !session.current) return 0;
    const { from } = session.current;
    const step = session.current.height + GAP;
    if (drag.to > from && index > from && index <= drag.to) return -step;
    if (drag.to < from && index >= drag.to && index < from) return step;
    return 0;
  }

  return (
    <div className="space-y-2" data-order={orderedKey}>
      {ordered.map((item, index) => {
        const dragging = drag?.id === item.id;
        const shift = dragging ? 0 : shiftFor(index);
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) rowRefs.current.set(item.id, el);
              else rowRefs.current.delete(item.id);
            }}
            style={{
              transform: dragging ? `translateY(${drag!.dy}px) scale(1.01)` : shift ? `translateY(${shift}px)` : undefined,
              transition: dragging ? "box-shadow 150ms" : drag ? "transform 180ms cubic-bezier(0.2, 0, 0, 1)" : undefined,
              zIndex: dragging ? 30 : undefined,
              position: "relative",
              willChange: drag ? "transform" : undefined,
            }}
            className={`flex items-center gap-2 rounded-xl ${dragging ? "shadow-2xl ring-2 ring-brand-red/60" : ""}`}
          >
            {!disabled && (
              <span
                onPointerDown={(e) => onPointerDown(e, item.id, index)}
                onPointerMove={onPointerMove}
                onPointerUp={() => finish(true)}
                onPointerCancel={() => finish(false)}
                style={{ touchAction: "none" }}
                className={`flex h-9 w-6 shrink-0 select-none items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 ${
                  dragging ? "cursor-grabbing text-brand-red" : "cursor-grab"
                }`}
                aria-label="Drag to reorder"
                title="Drag to reorder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="8" cy="6" r="1.6" />
                  <circle cx="16" cy="6" r="1.6" />
                  <circle cx="8" cy="12" r="1.6" />
                  <circle cx="16" cy="12" r="1.6" />
                  <circle cx="8" cy="18" r="1.6" />
                  <circle cx="16" cy="18" r="1.6" />
                </svg>
              </span>
            )}
            <div className={`min-w-0 flex-1 ${dragging ? "pointer-events-none select-none" : ""}`}>{renderItem(item, index)}</div>
          </div>
        );
      })}
    </div>
  );
}
