'use strict';
// Shared fakes for the Node tests. No DOM, no microphone, no network.

// A text box with just enough of the <textarea> API. `value` is a plain
// property, as it would be on any object that is not a real DOM element.
class FakeBox {
  constructor(value, caret) {
    this.value = value || '';
    this.selectionStart = caret === undefined ? this.value.length : caret;
    this.selectionEnd = this.selectionStart;
    this.disabled = false;
    this.readOnly = false;
    this.events = [];
    this.listeners = {};
  }
  setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatchEvent(ev) {
    this.events.push(ev.type);
    (this.listeners[ev.type] || []).forEach((fn) => fn(ev));
    return true;
  }
  // the person types at the cursor
  type(text) {
    const s = this.selectionStart;
    const e = this.selectionEnd;
    this.value = this.value.slice(0, s) + text + this.value.slice(e);
    this.selectionStart = this.selectionEnd = s + text.length;
    this.dispatchEvent({ type: 'input' });
  }
}

// Timers a test fires by hand. `set` records the delay so a test can check it.
function fakeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    set(fn, ms) { const id = next++; pending.set(id, { fn, ms }); return id; },
    clear(id) { pending.delete(id); },
    fireAll() { const all = [...pending.values()]; pending.clear(); all.forEach((t) => t.fn()); },
    delays() { return [...pending.values()].map((t) => t.ms); },
    get count() { return pending.size; }
  };
}

module.exports = { FakeBox, fakeTimers };
