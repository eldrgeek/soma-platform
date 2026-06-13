import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  validateCharacter,
  buildRegistry,
  getCharacter,
  listCharacterIds,
} from '../src/character-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const charsDir = join(__dirname, '..', 'characters');

function loadCharacter(id) {
  const raw = readFileSync(join(charsDir, id, 'character.json'), 'utf8');
  return JSON.parse(raw);
}

describe('validateCharacter', () => {
  it('accepts a valid soma-infer character', () => {
    const def = {
      characterId: 'izzy',
      displayName: 'Izzy',
      avatar: '🎭',
      backend: 'soma-infer',
      backendConfig: { inferUrl: 'https://example.com/infer/chat', assistantId: 'izzy' },
      voiceAgentId: null,
      persona: {
        name: 'Izzy',
        greeting: 'Hello!',
        personaDoc: 'characters/izzy/persona.md',
        knowledgeDoc: 'characters/izzy/knowledge.md',
      },
      capabilities: ['persona-conversation', 'answer-from-content', 'feedback-channel'],
    };
    assert.deepEqual(validateCharacter(def), { valid: true });
  });

  it('accepts a valid ui-bridge character', () => {
    const def = {
      characterId: 'chatgpt',
      displayName: 'ChatGPT',
      avatar: '🤖',
      backend: 'ui-bridge',
      backendConfig: { relayTarget: null },
      voiceAgentId: null,
      persona: { name: 'ChatGPT', greeting: 'Hi' },
      capabilities: ['persona-conversation'],
    };
    assert.deepEqual(validateCharacter(def), { valid: true });
  });

  it('rejects missing required fields', () => {
    const result = validateCharacter({ characterId: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('displayName')));
    assert.ok(result.errors.some(e => e.includes('backend')));
    assert.ok(result.errors.some(e => e.includes('persona')));
    assert.ok(result.errors.some(e => e.includes('capabilities')));
  });

  it('rejects invalid characterId format', () => {
    const result = validateCharacter({
      characterId: 'Bad_ID',
      displayName: 'Bad',
      backend: 'soma-infer',
      persona: { name: 'Bad' },
      capabilities: ['persona-conversation'],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('characterId')));
  });

  it('rejects unknown backend', () => {
    const result = validateCharacter({
      characterId: 'test',
      displayName: 'Test',
      backend: 'openai-api',
      persona: { name: 'Test' },
      capabilities: ['persona-conversation'],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('backend')));
  });

  it('rejects unknown capability', () => {
    const result = validateCharacter({
      characterId: 'test',
      displayName: 'Test',
      backend: 'soma-infer',
      persona: { name: 'Test' },
      capabilities: ['not-a-real-capability'],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('capability')));
  });

  it('rejects empty capabilities array', () => {
    const result = validateCharacter({
      characterId: 'test',
      displayName: 'Test',
      backend: 'soma-infer',
      persona: { name: 'Test' },
      capabilities: [],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('capabilities')));
  });

  it('rejects missing persona.name', () => {
    const result = validateCharacter({
      characterId: 'test',
      displayName: 'Test',
      backend: 'soma-infer',
      persona: { greeting: 'Hi' },
      capabilities: ['persona-conversation'],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('persona.name')));
  });
});

describe('buildRegistry', () => {
  it('builds a registry from valid defs', () => {
    const izzy = {
      characterId: 'izzy',
      displayName: 'Izzy',
      backend: 'soma-infer',
      persona: { name: 'Izzy' },
      capabilities: ['persona-conversation'],
    };
    const gpt = {
      characterId: 'chatgpt',
      displayName: 'ChatGPT',
      backend: 'ui-bridge',
      persona: { name: 'ChatGPT' },
      capabilities: ['persona-conversation'],
    };
    const reg = buildRegistry([izzy, gpt]);
    assert.equal(reg.size, 2);
    assert.equal(reg.get('izzy').displayName, 'Izzy');
    assert.equal(reg.get('chatgpt').backend, 'ui-bridge');
  });

  it('throws on duplicate characterId', () => {
    const def = {
      characterId: 'izzy',
      displayName: 'Izzy',
      backend: 'soma-infer',
      persona: { name: 'Izzy' },
      capabilities: ['persona-conversation'],
    };
    assert.throws(
      () => buildRegistry([def, def]),
      /Duplicate characterId/
    );
  });

  it('throws on invalid definition', () => {
    assert.throws(
      () => buildRegistry([{ characterId: 'bad' }]),
      /Invalid character definition/
    );
  });

  it('returns frozen defs', () => {
    const def = {
      characterId: 'izzy',
      displayName: 'Izzy',
      backend: 'soma-infer',
      persona: { name: 'Izzy' },
      capabilities: ['persona-conversation'],
    };
    const reg = buildRegistry([def]);
    const char = reg.get('izzy');
    assert.ok(Object.isFrozen(char));
  });
});

describe('getCharacter / listCharacterIds', () => {
  const reg = buildRegistry([
    { characterId: 'izzy', displayName: 'Izzy', backend: 'soma-infer', persona: { name: 'Izzy' }, capabilities: ['persona-conversation'] },
    { characterId: 'chatgpt', displayName: 'ChatGPT', backend: 'ui-bridge', persona: { name: 'ChatGPT' }, capabilities: ['persona-conversation'] },
  ]);

  it('getCharacter returns the correct def', () => {
    assert.equal(getCharacter(reg, 'izzy').displayName, 'Izzy');
  });

  it('getCharacter returns undefined for unknown id', () => {
    assert.equal(getCharacter(reg, 'unknown'), undefined);
  });

  it('listCharacterIds returns all ids', () => {
    const ids = listCharacterIds(reg);
    assert.deepEqual(ids.sort(), ['chatgpt', 'izzy']);
  });
});

describe('character.json files on disk', () => {
  it('izzy character.json passes validation', () => {
    const def = loadCharacter('izzy');
    const result = validateCharacter(def);
    assert.deepEqual(result, { valid: true }, JSON.stringify(result.errors));
  });

  it('chatgpt character.json passes validation', () => {
    const def = loadCharacter('chatgpt');
    const result = validateCharacter(def);
    assert.deepEqual(result, { valid: true }, JSON.stringify(result.errors));
  });

  it('izzy backend is soma-infer', () => {
    assert.equal(loadCharacter('izzy').backend, 'soma-infer');
  });

  it('chatgpt backend is ui-bridge', () => {
    assert.equal(loadCharacter('chatgpt').backend, 'ui-bridge');
  });

  it('izzy voiceAgentId is null (pending F2)', () => {
    assert.equal(loadCharacter('izzy').voiceAgentId, null);
  });

  it('chatgpt backendConfig.relayTarget is null (pending W2)', () => {
    assert.equal(loadCharacter('chatgpt').backendConfig?.relayTarget, null);
  });
});
