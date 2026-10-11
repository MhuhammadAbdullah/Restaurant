"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FaCheck, FaChevronDown } from "react-icons/fa6";

export type SelectOption = { value: string; label: string };

/**
 * Site-styled replacement for the browser's native <select>, whose open list can't be themed.
 * Keyboard friendly (arrows, Enter, Escape, type-to-jump) and still takes part in form validation via `required`.
 */
export function SelectField({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled,
  required,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // keep the highlighted row visible when moving with the arrow keys
  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openList() {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) choose(options[active]!.value);
    } else if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-surface px-5 py-3.5 text-left text-sm transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? "border-brand-red" : "border-line hover:border-brand-red/50 focus:border-brand-red"
        }`}
      >
        <span className={`truncate ${selected ? "text-ink" : "text-muted opacity-70"}`}>{selected?.label ?? placeholder}</span>
        <FaChevronDown size={12} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* invisible field so the browser's "please fill out this field" check still works */}
      {required && <input tabIndex={-1} aria-hidden="true" required value={value} onChange={() => {}} className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0" />}

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface py-1.5 shadow-xl"
        >
          {options.length === 0 && <li className="px-4 py-2.5 text-sm text-muted">No options</li>}
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors ${
                  isSelected ? "font-semibold text-brand-red" : "text-ink"
                } ${i === active ? "bg-surface-alt" : ""}`}
              >
                <span className="truncate">{o.label}</span>
                {isSelected && <FaCheck size={11} className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
