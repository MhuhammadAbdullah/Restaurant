import gsap from "gsap";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * GSAP hover effect shared by the menu buttons and the slim page headers.
 * Inside the hovered element: `[data-hover-line]` is an underline that fills from left to right and leaves to the
 * right; `[data-hover-icon]` nudges up and to the right.
 */
export function hoverIn(el: HTMLElement) {
  if (reduced()) return;
  const line = el.querySelector<HTMLElement>("[data-hover-line]");
  const icon = el.querySelector<HTMLElement>("[data-hover-icon]");
  if (line) {
    gsap.killTweensOf(line);
    gsap.set(line, { transformOrigin: "left center" });
    gsap.to(line, { scaleX: 1, duration: 0.4, ease: "power3.out" });
  }
  if (icon) gsap.to(icon, { x: 3, y: -3, duration: 0.3, ease: "power2.out", overwrite: true });
}

export function hoverOut(el: HTMLElement, keepLine = false) {
  if (reduced()) return;
  const line = el.querySelector<HTMLElement>("[data-hover-line]");
  const icon = el.querySelector<HTMLElement>("[data-hover-icon]");
  if (line && !keepLine) {
    gsap.killTweensOf(line);
    gsap.set(line, { transformOrigin: "right center" });
    gsap.to(line, { scaleX: 0, duration: 0.35, ease: "power2.inOut" });
  }
  if (icon) gsap.to(icon, { x: 0, y: 0, duration: 0.3, ease: "power2.out", overwrite: true });
}

/** Slides a list of elements in one after another (used when the side menu opens). */
export function staggerIn(items: HTMLElement[]) {
  if (items.length === 0) return;
  if (reduced()) {
    gsap.set(items, { clearProps: "all" });
    return;
  }
  gsap.fromTo(items, { x: 28, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out", stagger: 0.07, delay: 0.12, clearProps: "transform,opacity" });
}
