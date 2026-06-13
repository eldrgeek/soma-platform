import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildRegistry } from '../src/character-registry.js';
import {
  getSelectorOptions,
  getDefaultCharacterId,
} from '../src/character-selector.js';

const IZZY = {
  characterId: 'izzy',
  displayName: 'Izzy',
  avatar: '🎭',
  backend: 'soma-infer',
  persona: { name: 'Izzy' },
  capabilities: ['persona-conversation'],
};

const CHATGPT = {
  characterId: 'chatgpt',
  displayName: 'ChatGPT',
  avatar: '🤖',
  backend: 'ui-bridge',
  persona: { name: 'ChatGPT' },
  capabilities: ['persona-conversation'],
};

describe('getSelectorOptions', () => {
  it('returns one option per character', () => {
    const reg = buildRegistry([IZZY, CHATGPT]);
    const opts = getSelectorOptions(reg);
    assert.equal(opts.length, 2);
  });

  it('marks soma-infer characters as available', () => {
    const reg = buildRegistry([IZZY, CHATGPT]);
    const opts = getSelectorOptions(reg);
    const izzyOpt = opts.find(o => o.characterId === 'izzy');
    assert.equal(izzyOpt.available, true);
  });

  it('marks ui-bridge characters as unavailable (stub)', () => {
    const reg = buildRegistry([IZZY, CHATGPT]);
    const opts = getSelectorOptions(reg);
    const gptOpt = opts.find(o => o.characterId === 'chatgpt');
    assert.equal(gptOpt.available, false);
  });

  it('includes displayName and avatar', () => {
    const reg = buildRegistry([IZZY]);
    const opts = getSelectorOptions(reg);
    assert.equal(opts[0].displayName, 'Izzy');
    assert.equal(opts[0].avatar, '🎭');
  });

  it('handles missing avatar gracefully', () => {
    const noAvatar = { ...IZZY, avatar: undefined };
    const reg = buildRegistry([noAvatar]);
    const opts = getSelectorOptions(reg);
    assert.equal(opts[0].avatar, '');
  });
});

describe('getDefaultCharacterId', () => {
  it('returns "izzy" when izzy is in the registry', () => {
    const reg = buildRegistry([CHATGPT, IZZY]);
    assert.equal(getDefaultCharacterId(reg), 'izzy');
  });

  it('returns first soma-infer character when izzy is absent', () => {
    const other = {
      characterId: 'ariadne',
      displayName: 'Ariadne',
      backend: 'soma-infer',
      persona: { name: 'Ariadne' },
      capabilities: ['persona-conversation'],
    };
    const reg = buildRegistry([CHATGPT, other]);
    assert.equal(getDefaultCharacterId(reg), 'ariadne');
  });

  it('falls back to first character if no soma-infer characters', () => {
    const gpt2 = { ...CHATGPT, characterId: 'chatgpt2', displayName: 'ChatGPT2' };
    const reg = buildRegistry([CHATGPT, gpt2]);
    assert.equal(getDefaultCharacterId(reg), 'chatgpt');
  });

  it('returns null for empty registry', () => {
    const reg = buildRegistry([]);
    assert.equal(getDefaultCharacterId(reg), null);
  });
});

describe('sendToCharacter — ui-bridge stub degrades gracefully', async () => {
  it('returns a placeholder reply when chatgpt bridge is not wired', async () => {
    const { sendToCharacter } = await import('../src/character-selector.js');
    const reg = buildRegistry([CHATGPT]);
    const char = reg.get('chatgpt');

    const result = await sendToCharacter(char, {
      messages: [{ role: 'user', content: 'Hello ChatGPT' }],
    });

    assert.equal(typeof result.reply, 'string');
    assert.ok(result.reply.length > 0, 'stub should return a non-empty placeholder');
    assert.equal(result.source, 'ui-bridge');
    assert.equal(result.bridgeStatus, 'stub');
  });
});

describe('sendToCharacter — unknown backend throws', async () => {
  it('throws for an unknown backend', async () => {
    const { sendToCharacter } = await import('../src/character-selector.js');
    const badChar = {
      characterId: 'mystery',
      displayName: 'Mystery',
      backend: 'telepathy',
      persona: { name: 'Mystery' },
      capabilities: ['persona-conversation'],
    };

    await assert.rejects(
      () => sendToCharacter(badChar, { messages: [] }),
      /Unknown backend/
    );
  });
});
