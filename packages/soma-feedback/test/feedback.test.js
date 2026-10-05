import { test } from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
import {
  installSomaFeedbackHooks,
  installSomaFeedbackIdentityHook,
  installSomaFeedbackAuthHook,
} from '../src/index.js';

function mockSupabase(sessionFactory) {
  let calls = 0;
  return {
    supabase: {
      auth: {
        getSession: async () => {
          calls += 1;
          return sessionFactory(calls);
        },
      },
    },
    getSessionCalls: () => calls,
  };
}

test('signed out: identity and auth header return null', async () => {
  const { supabase } = mockSupabase(() => ({ data: { session: null }, error: null }));
  installSomaFeedbackHooks({ supabase });
  assert.equal(await window.somaFeedbackIdentity(), null);
  assert.equal(await window.somaFeedbackAuthHeader(), null);
});

test('signed in: identity returns name/email and auth header is Bearer token', async () => {
  const { supabase } = mockSupabase(() => ({
    data: {
      session: {
        access_token: 'tok_abc',
        user: {
          email: 'mike@example.com',
          user_metadata: { full_name: 'Mike Wolf' },
        },
      },
    },
    error: null,
  }));
  installSomaFeedbackHooks({ supabase });
  assert.deepEqual(await window.somaFeedbackIdentity(), {
    name: 'Mike Wolf',
    email: 'mike@example.com',
  });
  assert.equal(await window.somaFeedbackAuthHeader(), 'Bearer tok_abc');
});

test('identity prefers full_name then name', async () => {
  const { supabase } = mockSupabase(() => ({
    data: {
      session: {
        access_token: 't',
        user: { email: 'a@b.co', user_metadata: { name: 'Nick' } },
      },
    },
    error: null,
  }));
  installSomaFeedbackIdentityHook({ supabase });
  assert.deepEqual(await window.somaFeedbackIdentity(), { name: 'Nick', email: 'a@b.co' });
});

test('identity returns null when session has no name or email', async () => {
  const { supabase } = mockSupabase(() => ({
    data: { session: { access_token: 't', user: { user_metadata: {} } } },
    error: null,
  }));
  installSomaFeedbackIdentityHook({ supabase });
  assert.equal(await window.somaFeedbackIdentity(), null);
});

test('auth header returns null when getSession rejects', async () => {
  const { supabase } = mockSupabase(() => {
    throw new Error('network');
  });
  installSomaFeedbackAuthHook({ supabase });
  assert.equal(await window.somaFeedbackAuthHeader(), null);
});

test('auth header returns null on session error', async () => {
  const { supabase } = mockSupabase(() => ({
    data: { session: null },
    error: new Error('refresh failed'),
  }));
  installSomaFeedbackAuthHook({ supabase });
  assert.equal(await window.somaFeedbackAuthHeader(), null);
});

test('hooks call getSession on every invocation (no caching)', async () => {
  let n = 0;
  const { supabase, getSessionCalls } = mockSupabase(() => {
    n += 1;
    if (n === 1) return { data: { session: null }, error: null };
    return {
      data: {
        session: {
          access_token: `tok_${n}`,
          user: { email: 'x@y.z', user_metadata: {} },
        },
      },
      error: null,
    };
  });
  installSomaFeedbackHooks({ supabase });
  assert.equal(await window.somaFeedbackIdentity(), null);
  const id = await window.somaFeedbackIdentity();
  assert.equal(id?.email, 'x@y.z');
  assert.equal(id?.name, undefined);
  await window.somaFeedbackAuthHeader();
  assert.equal(getSessionCalls(), 3);
});
