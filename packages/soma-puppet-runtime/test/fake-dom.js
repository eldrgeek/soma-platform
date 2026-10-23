// A minimal DOM for the renderer tests (no tests of its own). It has what
// src/render.js and the soma-play components touch: elements, attributes,
// dataset, children, text, click listeners and two selectors.
export class FakeNode {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.className = '';
    this.value = '';
    this.style = {};
    this._text = '';
  }
  set textContent(text) { this._text = String(text); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  get required() { return 'required' in this.attributes; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(value);
    }
  }
  append(...nodes) { this.children.push(...nodes); nodes.forEach((node) => { node.parent = this; }); }
  prepend(...nodes) { this.children.unshift(...nodes); nodes.forEach((node) => { node.parent = this; }); }
  replaceChildren() { this.children = []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  async click() { for (const listener of this.listeners.click ?? []) await listener({}); }
  all() { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelectorAll(selector) {
    if (selector === '[data-puppet-field]') return this.all().filter((node) => 'puppetField' in node.dataset);
    const className = selector.replace(/^\./, '');
    return this.all().filter((node) => node.className.split(' ').includes(className));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

export function mount() {
  const document = { createElement: (tag) => new FakeNode(tag, document) };
  return new FakeNode('div', document);
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
