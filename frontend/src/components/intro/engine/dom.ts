// Minimal element builders + a write cache so each frame only touches attributes that changed.

const NS = "http://www.w3.org/2000/svg";
type Attrs = Record<string, string | number | undefined>;

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
  text?: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined) el.setAttribute(k, String(attrs[k]));
  if (text !== undefined) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const k in attrs) if (attrs[k] !== undefined) el.setAttribute(k, String(attrs[k]));
  if (text !== undefined) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
}

const cache = new WeakMap<Element, Map<string, string>>();
const memo = (el: Element) => {
  let m = cache.get(el);
  if (!m) cache.set(el, (m = new Map()));
  return m;
};

/** Set an attribute only if its value changed since the last frame. */
export function attr(el: Element, name: string, value: string | number) {
  const v = typeof value === "number" ? fmt(value) : value;
  const m = memo(el);
  if (m.get(name) === v) return;
  m.set(name, v);
  el.setAttribute(name, v);
}

/** Set an inline style property only if it changed. */
export function css(el: HTMLElement | SVGElement, prop: string, value: string | number) {
  const v = typeof value === "number" ? fmt(value) : value;
  const m = memo(el);
  const key = "$" + prop;
  if (m.get(key) === v) return;
  m.set(key, v);
  el.style.setProperty(prop, v);
}

/** Set textContent only if changed. */
export function text(el: Element, value: string) {
  const m = memo(el);
  if (m.get("#text") === value) return;
  m.set("#text", value);
  el.textContent = value;
}

/** Show or hide via the display property (cheaper than removing nodes). */
export function show(el: HTMLElement | SVGElement, on: boolean) {
  css(el, "display", on ? "" : "none");
}

export const fmt = (n: number) => (Math.abs(n) < 1e-4 ? "0" : String(Math.round(n * 1000) / 1000));
