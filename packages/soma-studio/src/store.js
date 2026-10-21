// A studio's lasting record in a Netlify Blobs store: one small state entry
// (sessions, agreements, questions, the team's cursor) and the messages in
// entries of 100. The blob store is passed in, so this file has no
// dependencies and tests can use a fake that behaves like deployed Blobs.
import { admitMessage, emptyState } from './logic.js';

// Deployed Blobs reads are eventually consistent unless asked otherwise, so
// every read here is strong: a write is visible to the next request.
const STRONG = { consistency: 'strong' };
// Several people and the team write to one studio at once. A write lands only
// if the entry is unchanged since it was read; otherwise it is re-run on the
// fresh entry, at most this many times.
const MAX_WRITE_ATTEMPTS = 8;
export const CHUNK = 100;

const enc = (value) => encodeURIComponent(value);

export class StudioStore {
  #blobs;
  #queues = new Map();

  constructor(blobs) {
    this.#blobs = blobs;
  }

  stateKey(studioId) {
    return `studios/${enc(studioId)}/state.json`;
  }

  chunkKey(studioId, index) {
    return `studios/${enc(studioId)}/messages/${String(index).padStart(6, '0')}.json`;
  }

  async getState(studioId) {
    return (await this.#blobs.get(this.stateKey(studioId), { type: 'json', ...STRONG })) ?? emptyState();
  }

  // Runs `change` on the state and stores the result; returns what `change` returns.
  updateState(studioId, change) {
    return this.#update(this.stateKey(studioId), emptyState, change);
  }

  async appendMessage(studioId, message) {
    const index = Math.floor((message.seq - 1) / CHUNK);
    return this.#update(this.chunkKey(studioId, index), () => ({ messages: [] }), (chunk) => {
      if (chunk.messages.some((item) => item.seq === message.seq)) return message;
      chunk.messages.push(message);
      chunk.messages.sort((left, right) => left.seq - right.seq);
      return message;
    });
  }

  // Admits a message (number, session, answers) and stores it. The number is
  // taken first, so a reader may briefly see the count before the message;
  // pages keep their own cursor at the last message they actually received.
  async post(studioId, { author, text, replyTo = null, meta = null }, at) {
    const message = await this.updateState(studioId, (state) => admitMessage(state, { author, text, at, replyTo }));
    if (meta) message.meta = meta;
    await this.appendMessage(studioId, message);
    return message;
  }

  // Messages numbered after `after` and up to `upTo`, at most `limit` of the newest.
  async readMessages(studioId, { after = 0, upTo, limit = 150 }) {
    const from = Math.max(after, upTo - limit);
    if (upTo <= from) return [];
    const first = Math.floor(from / CHUNK);
    const last = Math.floor((upTo - 1) / CHUNK);
    const chunks = await Promise.all(
      Array.from({ length: last - first + 1 }, (_, offset) =>
        this.#blobs.get(this.chunkKey(studioId, first + offset), { type: 'json', ...STRONG }),
      ),
    );
    return chunks
      .flatMap((chunk) => chunk?.messages ?? [])
      .filter((message) => message.seq > from && message.seq <= upTo)
      .sort((left, right) => left.seq - right.seq);
  }

  // One writer at a time per entry inside this instance; across instances the
  // etag condition decides.
  async #update(key, init, change) {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const update = previous.catch(() => {}).then(async () => {
      for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
        const stored = await this.#blobs.getWithMetadata(key, { type: 'json', ...STRONG });
        const value = stored?.data ?? init();
        const result = await change(value);
        // The netlify dev sandbox returns no etag, so an existing entry without
        // one is written unconditionally. Deployed Blobs always return one.
        let conditions = { onlyIfNew: true };
        if (stored) conditions = stored.etag ? { onlyIfMatch: stored.etag } : {};
        const { modified } = await this.#blobs.setJSON(key, value, conditions);
        if (modified) return result;
      }
      throw new Error('The studio changed during several attempts to save; try again');
    });
    this.#queues.set(key, update);
    try {
      return await update;
    } finally {
      if (this.#queues.get(key) === update) this.#queues.delete(key);
    }
  }
}
