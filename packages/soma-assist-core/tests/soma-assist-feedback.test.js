'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Feedback = require(path.join(__dirname, '../src/soma-assist-feedback.js'));

describe('routing classification', () => {
  test('source app yeshie defaults to yeshie', () => {
    const c = Feedback.classifyFeedback({
      sourceApp: 'yeshie',
      description: 'The recipe picker crashes when I open a payload'
    });
    assert.equal(c.route, 'yeshie');
  });

  test('adrian source maps to soma-guide', () => {
    const c = Feedback.classifyFeedback({
      sourceApp: 'adrian',
      description: 'Tour audio is too quiet on the pricing page'
    });
    assert.equal(c.route, 'soma-guide');
    assert.equal(c.sourceApp, 'soma-guide');
  });

  test('shared chip/window language routes to common even from yeshie', () => {
    const c = Feedback.classifyFeedback({
      sourceApp: 'yeshie',
      description: 'The shared chip chat window drag handle is hard to grab on both apps'
    });
    assert.equal(c.route, 'common');
    assert.equal(c.reason, 'common-signal');
  });

  test('explicit route wins', () => {
    const c = Feedback.classifyFeedback({
      sourceApp: 'yeshie',
      description: 'anything',
      route: 'soma-guide'
    });
    assert.equal(c.route, 'soma-guide');
    assert.equal(c.reason, 'explicit-route');
  });

  test('cross-app signals collapse to common', () => {
    const c = Feedback.classifyFeedback({
      sourceApp: 'adrian',
      description: 'Yeshie recipe runner and Adrian walkthrough should share status colors'
    });
    assert.equal(c.route, 'common');
  });
});

describe('board card + submit client', () => {
  test('buildBoardCard produces inbox contract fields', () => {
    const card = Feedback.buildBoardCard({
      route: 'common',
      sourceApp: 'yeshie',
      description: 'Resize handle clips on small screens',
      requestId: 'req-1',
      feedbackId: 'fb-1'
    });
    assert.match(card.filename, /^20\d{2}-\d{2}-\d{2}-common-feedback-/);
    assert.match(card.markdown, /auto-dispatch: true/);
    assert.match(card.markdown, /app: common/);
    assert.match(card.markdown, /request-id: req-1/);
    assert.equal(card.relativePath, 'board/inbox/' + card.filename);
  });

  test('createFeedbackClient submit posts RPC and writes board card', async () => {
    const calls = [];
    const client = Feedback.createFeedbackClient({
      url: 'https://example.supabase.co',
      anonKey: 'anon',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          async json() {
            return {
              feedback: {
                id: 'fb-uuid',
                route: 'common',
                description: 'shared assist-core button contrast',
                created_at: '2026-07-10T12:00:00Z'
              },
              request: {
                id: 'br-uuid',
                app: 'common',
                item_count: 1,
                status: 'requested'
              }
            };
          }
        };
      },
      boardWriter: async (card) => 'written:' + card.filename
    });

    const result = await client.submit({
      sourceApp: 'yeshie',
      description: 'shared assist-core button contrast is too low in the chip window'
    });

    assert.equal(result.classification.route, 'common');
    assert.equal(result.feedback.id, 'fb-uuid');
    assert.equal(result.request.id, 'br-uuid');
    assert.match(calls[0].url, /rpc\/assist_submit_feedback$/);
    assert.equal(result.boardCardPath.startsWith('written:'), true);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.p_route, 'common');
    assert.equal(body.p_source_app, 'yeshie');
  });
});
