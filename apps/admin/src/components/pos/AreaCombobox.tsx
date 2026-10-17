"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown, FaMagnifyingGlass } from "react-icons/fa6";

/**
 * Pick an area from the branch's delivery areas by searching. Typing narrows the list; tapping a name picks it. If the area is not
 * on the list, "Use ..." keeps what was typed, so an order is never stuck on a missing area.
 */
export function AreaCombobox({ value, options, onChange, placeholder = "Search the area", loading = false, className = "" }: { value: string; options: string[]; onChange: (area: string) => void; placeholder?: string; loading?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // what is shown in the box: the picked area, or what is being typed
  const shown = open ? text : value;
  const q = text.trim().toLowerCase();
  // names that START with what is typed come first, then the ones that contain it
  const matches = useMemo(() => {
    if (!q) return options;
    const hits = options.filter((o) => o.toLowerCase().includes(q));
    return [...hits.filter((o) => o.toLowerCase().startsWith(q)), ...hits.filter((o) => !o.toLowerCase().startsWith(q))];
  }, [options, q]);
  const exact = options.some((o) => o.toLowerCase() === q);
  const choices = useMemo(() => (q && !exact ? [...matches, `\u0000${text.trim()}`] : matches), [matches, q, exact, text]);

  useEffect(() => {
    setActive(0);
  }, [q]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    setText("");
  }
  function pick(choice: string) {
    onChange(choice.startsWith("\u0000") ? choice.slice(1) : choice);
    close();
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, choices.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && choices[active]) {
      e.preventDefault();
      pick(choices[active]!);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      close();
    }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <FaMagnifyingGlass size={13} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
      <input
        value={shown}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setText("");
          setOpen(true);
        }}
        onKeyDown={onKey}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        style={{ paddingLeft: "2.25rem", paddingRight: "2.25rem" }}
        className="input w-full"
      />
      <FaChevronDown size={12} className={`pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {loading && options.length === 0 && <li className="px-3 py-2 text-xs text-neutral-400">Loading areas...</li>}
          {!loading && choices.length === 0 && <li className="px-3 py-2 text-xs text-neutral-400">No areas set up for this city. Type the area name.</li>}
          {choices.map((c, i) => {
            const custom = c.startsWith("\u0000");
            const label = custom ? c.slice(1) : c;
            return (
              <li key={c} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setActive(i)}
                  className={`block w-full px-3 py-2 text-left text-sm ${i === active ? "bg-brand-red/10 text-brand-red" : "text-neutral-700 hover:bg-neutral-50"} ${label.toLowerCase() === value.toLowerCase() && !custom ? "font-semibold" : ""}`}
                >
                  {custom ? <>Use &quot;{label}&quot; <span className="text-xs text-neutral-400">(not on the list)</span></> : label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
