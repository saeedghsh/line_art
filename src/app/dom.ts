type Props<K extends keyof HTMLElementTagNameMap> = Partial<
  Pick<HTMLElementTagNameMap[K], Extract<keyof HTMLElementTagNameMap[K], string>>
>;

/** Creates an element, assigns DOM properties and appends children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}

/** Returns the element with `id`, failing loudly if index.html lacks it. */
export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing #${id} element.`);
  return element;
}
