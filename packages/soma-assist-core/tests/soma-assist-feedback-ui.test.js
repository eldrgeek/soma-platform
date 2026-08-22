'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../dist/soma-assist-core.js'), 'utf8');

function setup() {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1200 });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 800 });
  dom.window.eval(source);
  return dom.window;
}

describe('feedback affordance UI', () => {
  test('header exposes feedback control and submits via onFeedbackSubmit', async () => {
    const win = setup();
    let received = null;
    const api = win.SomaAssistCore.createAssistChip({
      appId: 'yeshie',
      title: 'Yeshie',
      onFeedbackSubmit: async (payload) => {
        received = payload;
        return { classification: { route: 'yeshie' } };
      }
    });
    api.open();
    const btn = api.shadowRoot.querySelector('[data-assist-feedback]');
    assert.ok(btn);
    btn.click();
    const form = api.shadowRoot.querySelector('[data-assist-feedback-form]');
    assert.equal(form.hidden, false);
    api.shadowRoot.querySelector('[data-assist-feedback-input]').value = 'Yeshie recipe fails on github.com';
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(received.description, 'Yeshie recipe fails on github.com');
    assert.equal(received.sourceApp, 'yeshie');
  });
});
