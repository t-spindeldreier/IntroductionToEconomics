// A tiny helper for building DOM nodes without a framework.
//   h('button', { class: 'big', onclick: go }, 'Send')
// Text is always inserted as text, never as HTML, so nothing from a session file
// or the database can inject markup.

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown>;

export function h(tag: string, props: Props | null = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'class') el.className = String(value);
    else if (key === 'style') el.setAttribute('style', String(value));
    else if (key in el && key !== 'list') (el as any)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** SVG elements need their own namespace. */
export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: (Node | string)[]): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

/** Session texts may mark words as bold with **two asterisks**. */
export function rich(text: string): Node[] {
  return text.split('**').map((part, i) => (i % 2 ? h('strong', null, part) : document.createTextNode(part)));
}

export function replaceContent(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}
