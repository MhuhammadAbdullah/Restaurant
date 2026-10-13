"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";

/**
 * A text box for passwords. A normal controlled box makes React copy what is typed into the page's `value="..."` attribute,
 * which then sits in plain sight in the browser's inspector, page copies and screen-capture tools. This one never writes the
 * attribute: the text lives only inside the box. The parent still gets every change and can set or clear it from code.
 */
export function SecretInput({ value, onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  }, [value]);
  return <input {...rest} ref={ref} onChange={(e) => onChange(e.target.value)} autoCorrect="off" autoCapitalize="off" spellCheck={false} />;
}
