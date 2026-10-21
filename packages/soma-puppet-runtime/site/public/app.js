import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

import { parse } from '/vendor/puppet/parser.js';
import { render } from '/vendor/puppet/render.js';
import { createSomaAuthConfig } from '/vendor/soma-signin/somaAuthConfig.js';

const appId = new URLSearchParams(location.search).get('app') || 'sunday-supper';
const appRoot = document.querySelector('#app');
const authRoot = document.querySelector('#auth');
const hostRoot = document.querySelector('#host-panel');
const status = document.querySelector('#status');
const identityRoot = document.querySelector('#identity');
const title = document.querySelector('#app-title');

let supabase;
let session;
let current;
let sketch;
let liveData = {};
let pollTimer;
// Local `netlify dev` only: the API accepts x-dev-user there and refuses it everywhere else.
let devUser = null;

const setStatus = (message) => {
  status.textContent = message;
};

// Inside SOMA Studio this page is the live app pane. When the host changes
// the app here, the studio is told, so every other person's pane redraws at
// once instead of at its next 10-second check.
const inStudio = window.parent !== window;

function notifyStudio() {
  if (!inStudio) return;
  window.parent.postMessage(
    { type: 'soma-app:changed', appId, versionId: current?.versionId ?? null },
    location.origin,
  );
}

window.addEventListener('message', (event) => {
  if (!inStudio || event.origin !== location.origin || event.source !== window.parent) return;
  if (event.data?.type === 'soma-studio:refresh' && session) {
    loadCurrent().catch((error) => setStatus(error.message));
  }
});

function authHeaders(extra = {}) {
  return {
    ...extra,
    ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    ...(devUser ? { 'x-dev-user': `${devUser.id}:${devUser.name}` } : {}),
  };
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api/app/${encodeURIComponent(appId)}/${path}`, {
    method,
    headers: authHeaders(body ? { 'content-type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function me() {
  if (devUser) return { id: devUser.id, name: devUser.name };
  const user = session?.user;
  return {
    id: user?.id,
    name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Neighbor',
    email: user?.email,
  };
}

function installFeedbackChip() {
  if (document.querySelector('[data-puppet-chip]')) return;
  window.somaFeedbackAuthHeader = async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? `Bearer ${data.session.access_token}` : null;
  };
  window.somaFeedbackHeaders = () => authHeaders();
  window.somaFeedbackIdentity = () => ({ name: me().name, email: me().email });
  const loader = document.createElement('script');
  loader.src = '/vendor/soma-feedback/soma-chip-loader.js';
  loader.dataset.puppetChip = 'true';
  loader.dataset.site = appId;
  loader.dataset.endpoint = `/api/app/${encodeURIComponent(appId)}/feedback`;
  loader.dataset.noGoogle = '';
  if (devUser) loader.dataset.channel = 'local';
  document.body.append(loader);
}

async function loadData() {
  liveData = Object.fromEntries(
    await Promise.all(
      Object.keys(sketch.data).map(async (name) => [
        name,
        await api(`data/${encodeURIComponent(name)}`),
      ]),
    ),
  );
}

// The mic button (packages/soma-speech) is copied in by the build at
// /studio/vendor/soma-speech/; a 404 only means no mic. The renderer's
// composer leaves a slot for it and the page is redrawn on every change.
function attachMic() {
  const input = appRoot.querySelector('.puppet-runtime-composer textarea');
  const slot = appRoot.querySelector('.puppet-runtime-mic-slot');
  if (!input || !slot || !window.SomaSpeech?.attach) return;
  try {
    window.SomaSpeech.attach(input, { mount: slot });
  } catch (error) {
    console.warn('mic button not attached', error);
  }
}

function draw() {
  render(sketch, {
    root: appRoot,
    data: liveData,
    me: me(),
    onAction: async (action) => {
      if (action.type === 'add') {
        await api(`data/${encodeURIComponent(action.target)}`, {
          method: 'POST',
          body: action.row,
        });
      } else if (action.type === 'remove') {
        await api(
          `data/${encodeURIComponent(action.target)}/${encodeURIComponent(action.rowId)}`,
          { method: 'DELETE' },
        );
      }
      await loadData();
      draw();
    },
  });
  attachMic();
}

async function loadVersions() {
  if (me().id !== current.hostId) {
    hostRoot.hidden = true;
    return;
  }
  hostRoot.hidden = false;
  const versions = await api('versions');
  hostRoot.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = 'Host controls';
  hostRoot.append(heading);

  const list = document.createElement('ul');
  for (const version of versions) {
    const item = document.createElement('li');
    item.textContent = `${version.id} · ${version.status}${version.id === current.versionId ? ' · live' : ''}`;
    if (version.id !== current.versionId) {
      const approve = document.createElement('button');
      approve.type = 'button';
      approve.textContent = 'Approve';
      approve.addEventListener('click', async () => {
        try {
          await api('approve', { method: 'POST', body: { versionId: version.id } });
          await loadCurrent(true);
          notifyStudio();
        } catch (error) {
          setStatus(error.message);
        }
      });
      item.append(approve);
    }
    list.append(item);
  }
  hostRoot.append(list);

  const source = document.createElement('textarea');
  source.setAttribute('aria-label', 'New Puppet description');
  source.placeholder = 'Paste a new Puppet description';
  hostRoot.append(source);

  const propose = document.createElement('button');
  propose.type = 'button';
  propose.textContent = 'Propose';
  propose.addEventListener('click', async () => {
    try {
      await api('propose', {
        method: 'POST',
        body: { source: source.value, reason: 'Proposed in host panel' },
      });
      source.value = '';
      await loadVersions();
      setStatus('Proposal saved. It is not live until approved.');
    } catch (error) {
      setStatus(error.message);
    }
  });
  hostRoot.append(propose);

  const undo = document.createElement('button');
  undo.type = 'button';
  undo.textContent = 'Undo current version';
  undo.addEventListener('click', async () => {
    try {
      await api('undo', { method: 'POST' });
      await loadCurrent(true);
      notifyStudio();
    } catch (error) {
      setStatus(error.message);
    }
  });
  hostRoot.append(undo);
}

async function loadCurrent(force = false) {
  const next = await api('current');
  if (!force && current?.versionId === next.versionId) return;
  const parsed = parse(next.source);
  if (parsed.errors.length) {
    throw new Error(`Live Puppet description has ${parsed.errors.length} parse error(s)`);
  }
  current = next;
  sketch = parsed.sketch;
  title.textContent = sketch.meta?.title || appId;
  document.title = title.textContent;
  await loadData();
  draw();
  await loadVersions();
  setStatus(`Live version ${current.versionId}`);
}

function showIdentity() {
  identityRoot.replaceChildren();
  identityRoot.append(document.createTextNode(me().name));
  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.textContent = 'Sign out';
  signOut.addEventListener('click', () => {
    if (devUser) {
      devUser = null;
      boot(null, Boolean(supabase), lastConfig);
    } else supabase.auth.signOut();
  });
  identityRoot.append(signOut);
}

let lastConfig = {};

function showDevIdentity() {
  if (!lastConfig.devIdentity) return;
  const box = document.createElement('div');
  box.className = 'dev-identity';
  box.innerHTML = '<p>Local development only:</p>';
  for (const [id, name, label] of [['rosa', 'Rosa', 'Continue as Rosa (host)'], ['theo', 'Theo', 'Continue as Theo']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      devUser = { id, name };
      boot({ user: { id } }, Boolean(supabase), lastConfig);
    });
    box.append(button);
  }
  authRoot.append(box);
}

function showSignIn(configured) {
  clearInterval(pollTimer);
  appRoot.replaceChildren();
  hostRoot.hidden = true;
  identityRoot.replaceChildren();
  authRoot.hidden = false;
  authRoot.innerHTML = `
    <h1>Sign in to continue</h1>
    <p>Use a magic link or your Google identity.</p>
    <form>
      <input type="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email">
      <button type="submit">Email a magic link</button>
      <button type="button" data-google>Continue with Google</button>
    </form>
  `;
  showDevIdentity();
  if (!configured) {
    setStatus('Set SUPABASE_URL and SUPABASE_ANON_KEY to enable sign-in.');
    authRoot.querySelectorAll('form button, form input').forEach((control) => {
      control.disabled = true;
    });
    return;
  }
  authRoot.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = authRoot.querySelector('input').value;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.href },
    });
    setStatus(error ? error.message : 'Check your email for the sign-in link.');
  });
  authRoot.querySelector('[data-google]').addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.href },
    });
    if (error) setStatus(error.message);
  });
}

async function boot(nextSession, configured, config = lastConfig) {
  lastConfig = config;
  session = nextSession;
  if (!session) {
    showSignIn(configured);
    return;
  }
  authRoot.hidden = true;
  showIdentity();
  installFeedbackChip();
  try {
    await loadCurrent(true);
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      loadCurrent().catch((error) => setStatus(error.message));
    }, 10_000);
  } catch (error) {
    setStatus(error.message);
  }
}

async function start() {
  const response = await fetch('/api/config');
  const rawConfig = await response.json();
  lastConfig = rawConfig;
  const authConfig = createSomaAuthConfig({
    url: rawConfig.supabaseUrl,
    anonKey: rawConfig.supabaseAnonKey,
    methods: { magicLink: true, password: false, oauth: ['google'] },
  });
  const configured = Boolean(authConfig.url && authConfig.anonKey);
  if (configured) supabase = createClient(authConfig.url, authConfig.anonKey);
  if (!supabase) {
    showSignIn(false);
    return;
  }
  const { data } = await supabase.auth.getSession();
  await boot(data.session, configured);
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    if (nextSession?.access_token !== session?.access_token) boot(nextSession, configured);
  });
}

start().catch((error) => setStatus(error.message));
