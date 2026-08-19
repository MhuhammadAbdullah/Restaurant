"use client";

import { useState } from "react";

type ReorderableItem = { id: string };

/**
 * Generic drag-to-reorder list. Native HTML5 drag events — no extra dependency.
 * `onReorder` fires with the full new id order once a drop completes.
 */
export function ReorderableList<T extends ReorderableItem>({
  items,
  onReorder,
  renderItem,
  disabled,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  disabled?: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    onReorder(ids);
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.id}
          draggable={!disabled}
          onDragStart={() => setDragId(item.id)}
          onDragOver={(e) => {
            e.preventDefault();
            if (overId !== item.id) setOverId(item.id);
          }}
          onDragLeave={() => setOverId((o) => (o === item.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(item.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          className={`flex items-start gap-2 rounded-lg transition ${
            dragId === item.id ? "opacity-40" : ""
          } ${overId === item.id && dragId && dragId !== item.id ? "ring-2 ring-brand-red" : ""}`}
        >
          {!disabled && (
            <span
              className="mt-2 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center text-neutral-300 hover:text-neutral-500"
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
          <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
        </div>
      ))}
    </div>
  );
}
