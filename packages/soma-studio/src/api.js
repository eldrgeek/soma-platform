// The studio's HTTP API, served by a Netlify Function on the soma-forge site
// at /api/studio/*. Every dependency is passed in (the blob store, the
// identity check, the realtime ping), so the same handler runs in tests.
import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  admitMessage,
  appChanged,
  applyTeamReply,
  dropQuestion,
  editAgreement,
  ensureSession,
  publicState,
  removeAgreement,
  teamSkip,
  teamWorking,
} from './logic.js';
import { StudioStore } from './store.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const TEAM_AUTHOR = Object.freeze({ kind: 'team', id: 'ai:team', name: 'The team' });
const FIRST_LOAD_MESSAGES = 150;
const RECENT_FOR_TEAM = 40;

const json = (value, status = 200) =>
  Response.json(value, { status, headers: { 'cache-control': 'no-store' } });

async function body(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'A JSON object body is required');
  }
}

const lower = (list) => (list ?? []).map((item) => String(item).toLowerCase());

// Under `netlify dev` the made-up x-dev-user identities have no email, so a
// studio may name dev ids as hosts and members. They count only when
// NETLIFY_DEV is exactly 'true', the rule that also gates x-dev-user.
export function resolveStudios(studios, env = process.env) {
  return Object.fromEntries(
    Object.entries(studios).map(([id, config]) => {
      const dev = env.NETLIFY_DEV === 'true';
      return [
        id,
        {
          ...config,
          id,
          hosts: lower([...(config.hosts ?? []), ...(dev ? config.devHosts ?? [] : [])]),
          members: lower([...(config.members ?? []), ...(dev ? config.devMembers ?? [] : [])]),
        },
      ];
    }),
  );
}

export function access(studio, identity) {
  const keys = lower([identity?.email, identity?.id].filter(Boolean));
  const isHost = keys.some((key) => studio.hosts.includes(key));
  const isMember = isHost || keys.some((key) => studio.members.includes(key));
  return { isHost, isMember };
}

// Realtime topic names carry a keyed suffix, so only members (who are told
// the name) and the team (which holds the key) can find a studio's pings.
export function topics(teamKey, studioId) {
  const tag = (label) => createHmac('sha256', teamKey || 'unkeyed').update(label).digest('hex').slice(0, 20);
  return {
    studio: `soma-studio-${studioId}-${tag(`studio:${studioId}`)}`,
    team: `soma-studio-team-${tag('team')}`,
  };
}

function keyMatches(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function humanAuthor(identity) {
  return {
    kind: 'human',
    id: identity.id,
    name: identity.name,
    ...(identity.email ? { email: identity.email } : {}),
  };
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function cleanReply(input) {
  const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);
  const item = (value) => (value && typeof value === 'object' ? value : {});
  return {
    replyTo: positiveInt(input.replyTo),
    upTo: positiveInt(input.upTo),
    agreements: list(input.agreements, 8).map(item).map(({ text, from }) => ({ text: String(text ?? ''), from: positiveInt(from) ?? undefined })),
    questions: list(input.questions, 8).map(item).map(({ text, from }) => ({ text: String(text ?? ''), from: positiveInt(from) ?? undefined })),
    answered: list(input.answered, 8).map(item).map(({ n, answer, from }) => ({ n: positiveInt(n), answer: String(answer ?? ''), from: positiveInt(from) ?? undefined })),
    highlight: list(input.highlight, 8).map(item).map(({ n, reason }) => ({ n: positiveInt(n), reason: String(reason ?? '') })),
    unhighlight: list(input.unhighlight, 20).map(positiveInt).filter(Boolean),
  };
}

export function createStudioApi({ studios, blobs, verifyIdentity, teamKey, broadcast = async () => {}, now = () => new Date() }) {
  const store = new StudioStore(blobs);
  const at = () => now().toISOString();

  async function ping(studioId, { team = false } = {}) {
    const names = topics(teamKey, studioId);
    const messages = [{ topic: names.studio, event: 'changed', payload: { studio: studioId } }];
    if (team) messages.push({ topic: names.team, event: 'message', payload: { studio: studioId } });
    try {
      await broadcast(messages);
    } catch (error) {
      // A lost ping only delays pages until their next poll.
      console.warn('studio ping failed', error instanceof Error ? error.message : error);
    }
  }

  function studioFor(studioId) {
    const studio = studios[studioId];
    if (!studio) throw new HttpError(404, `Unknown studio: ${studioId}`);
    return studio;
  }

  async function member(request, studio) {
    const identity = await verifyIdentity(request);
    const role = access(studio, identity);
    if (!role.isMember) throw new HttpError(403, `You are not a member of the studio "${studio.title}". Ask its host to add ${identity.email ?? identity.id}.`);
    return { identity, ...role };
  }

  function requireHost(role) {
    if (!role.isHost) throw new HttpError(403, 'Only a host of this studio may do that');
  }

  function requireTeam(request) {
    if (!keyMatches(request.headers.get('x-studio-team-key'), teamKey)) {
      throw new HttpError(401, 'The team key is required');
    }
  }

  async function feed(studio, role, url) {
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    const knownVersion = url.searchParams.get('version');
    const state = await store.getState(studio.id);
    const first = after === 0;
    const messages = state.msgSeq > after
      ? await store.readMessages(studio.id, { after, upTo: state.msgSeq, limit: first ? FIRST_LOAD_MESSAGES : 1000 })
      : [];
    return {
      studio: { id: studio.id, title: studio.title, appId: studio.appId ?? null, purpose: studio.purpose ?? '' },
      me: { name: role.identity.name, email: role.identity.email ?? null, isHost: role.isHost },
      topic: topics(teamKey, studio.id).studio,
      version: state.version,
      msgSeq: state.msgSeq,
      ...(String(state.version) === knownVersion ? {} : { state: publicState(state) }),
      messages,
      earliest: first && messages.length ? messages[0].seq : null,
    };
  }

  async function teamInbox() {
    const out = [];
    for (const studio of Object.values(studios)) {
      const state = await store.getState(studio.id);
      const entry = {
        id: studio.id,
        title: studio.title,
        appId: studio.appId ?? null,
        purpose: studio.purpose ?? '',
        team: studio.team ?? {},
        hosts: studio.hosts,
        state: publicState(state),
        pending: [],
        recent: [],
      };
      if (state.lastHumanSeq > state.teamCursor) {
        const session = state.sessions.at(-1);
        const firstSeq = session?.firstSeq ?? 1;
        const recent = await store.readMessages(studio.id, {
          after: Math.max(firstSeq - 1, state.msgSeq - RECENT_FOR_TEAM),
          upTo: state.msgSeq,
          limit: RECENT_FOR_TEAM,
        });
        entry.pending = (await store.readMessages(studio.id, { after: state.teamCursor, upTo: state.msgSeq, limit: 60 }))
          .filter((message) => message.author?.kind === 'human');
        entry.recent = recent;
      }
      out.push(entry);
    }
    return { teamTopic: topics(teamKey, '').team, studios: out };
  }

  async function team(studio, input) {
    const when = at();
    if (input.op === 'working') {
      const result = await store.updateState(studio.id, (state) => teamWorking(state, { upTo: positiveInt(input.upTo) ?? 0, at: when }));
      await ping(studio.id);
      return { team: result };
    }
    if (input.op === 'reply' || input.op === 'note') {
      const text = typeof input.text === 'string' ? input.text : '';
      const reply = input.op === 'reply' ? cleanReply(input) : { replyTo: positiveInt(input.replyTo) };
      const { message, result } = await store.updateState(studio.id, (state) => {
        const admitted = admitMessage(state, { author: TEAM_AUTHOR, text, at: when, replyTo: reply.replyTo });
        if (input.op === 'note') return { message: admitted, result: null };
        const applied = applyTeamReply(state, reply, { at: when, messageSeq: admitted.seq });
        admitted.meta = {
          pickupMs: state.team.pickupMs,
          answerMs: state.team.answerMs,
          ...(typeof input.model === 'string' ? { model: input.model.slice(0, 40) } : {}),
        };
        admitted.made = applied;
        return { message: admitted, result: applied };
      });
      await store.appendMessage(studio.id, message);
      await ping(studio.id);
      return { message, result };
    }
    if (input.op === 'skip') {
      const result = await store.updateState(studio.id, (state) => teamSkip(state, { upTo: positiveInt(input.upTo), at: when }));
      await ping(studio.id);
      return { team: result };
    }
    throw new HttpError(400, 'Unknown team op');
  }

  return async function studioApi(request) {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/api\/studio\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
      const method = request.method;

      if (parts[0] === 'team' && parts[1] === 'inbox' && method === 'GET') {
        requireTeam(request);
        return json(await teamInbox());
      }

      if (parts.length === 0 && method === 'GET') {
        const identity = await verifyIdentity(request);
        return json({
          me: { name: identity.name, email: identity.email ?? null },
          studios: Object.values(studios)
            .filter((studio) => access(studio, identity).isMember)
            .map(({ id, title, appId, purpose }) => ({ id, title, appId: appId ?? null, purpose: purpose ?? '' })),
        });
      }

      const studio = studioFor(parts[0]);
      const [, section, item] = parts;

      if (section === 'team' && method === 'POST') {
        requireTeam(request);
        return json(await team(studio, await body(request)));
      }

      const role = await member(request, studio);
      const name = role.identity.name;

      if (section === 'feed' && method === 'GET') return json(await feed(studio, role, url));

      if (section === 'messages' && method === 'POST' && !item) {
        const input = await body(request);
        if (typeof input.text !== 'string' || !input.text.trim()) throw new HttpError(400, 'text is required');
        const message = await store.post(
          studio.id,
          { author: humanAuthor(role.identity), text: input.text, replyTo: positiveInt(input.replyTo) },
          at(),
        );
        await ping(studio.id, { team: true });
        return json({ message }, 201);
      }

      if (section === 'agreements' && item && (method === 'PATCH' || method === 'DELETE')) {
        requireHost(role);
        const n = positiveInt(item);
        if (!n) throw new HttpError(400, 'An agreement number is required');
        const input = method === 'PATCH' ? await body(request) : {};
        if (method === 'PATCH' && (typeof input.text !== 'string' || !input.text.trim())) throw new HttpError(400, 'text is required');
        const agreement = await store.updateState(studio.id, (state) =>
          method === 'PATCH'
            ? editAgreement(state, { n, text: input.text, by: name, at: at() })
            : removeAgreement(state, { n, by: name, at: at() }),
        );
        if (!agreement) throw new HttpError(404, `No active agreement A${n}`);
        await ping(studio.id);
        return json({ agreement });
      }

      if (section === 'questions' && item && method === 'DELETE') {
        requireHost(role);
        const n = positiveInt(item);
        const question = n && (await store.updateState(studio.id, (state) => dropQuestion(state, { n, by: name, at: at() })));
        if (!question) throw new HttpError(404, `No open question ${item}`);
        await ping(studio.id);
        return json({ question });
      }

      if (section === 'sessions' && method === 'POST') {
        requireHost(role);
        const session = await store.updateState(studio.id, (state) => ensureSession(state, at(), name, { force: true }));
        await ping(studio.id);
        return json({ session }, 201);
      }

      if (section === 'app-changed' && method === 'POST') {
        const input = await body(request);
        const app = await store.updateState(studio.id, (state) => appChanged(state, { versionId: input.versionId, at: at() }));
        await ping(studio.id);
        return json({ app });
      }

      throw new HttpError(404, 'Unknown studio route');
    } catch (error) {
      if (error instanceof HttpError || Number.isInteger(error?.status)) {
        return json({ error: error.message }, error.status);
      }
      const message = error instanceof Error ? error.message : 'Request failed';
      return json({ error: message }, 400);
    }
  };
}

// The default realtime ping: Supabase Realtime's broadcast endpoint with the
// public key. Topics are public channels; their names are the only secret.
export function supabaseBroadcast({ url, key, fetchImpl = globalThis.fetch }) {
  if (!url || !key) return async () => {};
  return async (messages) => {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error(`broadcast ${response.status}`);
  };
}
