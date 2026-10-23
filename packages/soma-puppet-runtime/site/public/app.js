import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

import { parse } from '/vendor/puppet/parser.js';
import { render } from '/vendor/puppet/render.js';
import { createSomaAuthConfig } from '/vendor/soma-signin/somaAuthConfig.js';
import { loadComponents } from '/components.js';

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

// The library components the renderer draws (packages/soma-play, and for
// Puppet v0.5 packages/soma-video). Stage Read and the narration read send
// the server a row id and a line number, never the words.
const reader = (route) => ({ data, rowId, field }) => (line) =>
  fetch(`/api/app/${encodeURIComponent(appId)}/${route}`, {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ data, rowId, field, line }),
  });

// Puppet v0.6: a script's assets and the team's jobs. Files come through the API with the reader's
// sign-in. When a job ends, the asset board of the same row loads the asset list again.
const boards = new Map();
const videoPath = (data, rowId) => `video/${encodeURIComponent(data)}/${encodeURIComponent(rowId)}`;

async function fetchAsset(data, rowId, name) {
  const response = await fetch(`/api/app/${encodeURIComponent(appId)}/${videoPath(data, rowId)}/assets/${encodeURIComponent(name)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
  return response.blob();
}

// Puppet v0.7: storyboards. The open board is in the address (&board=…), so a board has a link of its
// own to send to an artist.
const boardsPath = (id = '', rest = '') => `video-boards${id ? `/${encodeURIComponent(id)}` : ''}${rest}`;
const storyboardApi = {
  listBoards: () => api(boardsPath()),
  createBoard: (input) => api(boardsPath(), { method: 'POST', body: input }),
  getBoard: (id) => api(boardsPath(id)),
  changeBoard: (id, ops) => api(boardsPath(id), { method: 'PATCH', body: { ops } }),
  listJobs: (id) => api(boardsPath(id, '/jobs')),
  createJob: (id, job) => api(boardsPath(id, '/jobs'), { method: 'POST', body: job }),
  decideJob: (id, jobId, release) => api(boardsPath(id, `/jobs/${encodeURIComponent(jobId)}`), { method: 'POST', body: { release } }),
  sendNotes: (id, notes) => api(boardsPath(id, '/notes'), { method: 'POST', body: notes }),
  async fetchFile(id, name) {
    const response = await fetch(`/api/app/${encodeURIComponent(appId)}/${boardsPath(id, `/files/${encodeURIComponent(name)}`)}`, { headers: authHeaders() });
    if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
    return response.blob();
  },
};

function writeBoard(id) {
  const params = new URLSearchParams(location.search);
  if (id) params.set('board', id);
  else params.delete('board');
  const next = `${location.pathname}?${params}`;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, '', next);
}

// The shared components come from the builds the live description pins (`uses soma-video@<hash>`),
// or the latest. They load again only when the pins change, so an approved pin takes effect at once.
let lib;
let manifest;

async function loadLibrary(uses) {
  if (Object.keys(uses).length && !manifest) {
    manifest = await fetch('/vendor/manifest.json').then((response) => (response.ok ? response.json() : {}), () => ({}));
  }
  const next = await loadComponents(uses, manifest ?? {}, (url) => import(url));
  if (next.key !== lib?.key) lib = next;
  return next.notices;
}

const components = {
  'video-storyboards': (node, { host }) =>
    lib.mountStoryboards(node, {
      api: storyboardApi,
      host,
      initial: new URLSearchParams(location.search).get('board'),
      onOpen: writeBoard,
    }),
  'video-assets': (node, { text, data, rowId }) => {
    const board = lib.mountVideoAssets(node, {
      text,
      cacheKey: rowId,
      listAssets: () => api(`${videoPath(data, rowId)}/assets`),
      fetchAsset: (name) => fetchAsset(data, rowId, name),
    });
    boards.set(rowId, board);
    return board;
  },
  'video-jobs': (node, { data, rowId }) =>
    lib.mountVideoJobs(node, {
      listJobs: () => api(`${videoPath(data, rowId)}/jobs`),
      createJob: (job) => api(`${videoPath(data, rowId)}/jobs`, { method: 'POST', body: job }),
      onDone: () => boards.get(rowId)?.refresh(),
    }),
  'video-view': (node, text) => lib.mountVideoView(node, text),
  'video-read': (node, { text, onActive, ...where }) =>
    lib.mountVideoRead(node, { text, onActive, mountStageRead: lib.mountStageRead, speak: reader('video-read')(where) }),
  'play-view': (node, text) => lib.mountPlayView(node, text),
  'stage-read': (node, { text, data, rowId, field, onActive }) =>
    lib.mountStageRead(node, {
      text,
      onActive,
      speak: (line) =>
        fetch(`/api/app/${encodeURIComponent(appId)}/stage-read`, {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ data, rowId, field, line }),
        }),
    }),
};

let view;

// The address names the open screen and row (?app=…&screen=…&row=…), so a script has a link of its own
// and Back and Forward move between the list and a script.
function readAddress() {
  const params = new URLSearchParams(location.search);
  const screen = params.get('screen');
  if (!screen) {
    delete appRoot.dataset.puppetScreen;
    delete appRoot.dataset.puppetRow;
    return;
  }
  appRoot.dataset.puppetScreen = screen;
  if (params.get('row')) appRoot.dataset.puppetRow = params.get('row');
  else delete appRoot.dataset.puppetRow;
  if (params.get('back')) appRoot.dataset.puppetBack = params.get('back');
}

function writeAddress({ screen, row, back }) {
  const params = new URLSearchParams(location.search);
  params.set('screen', screen);
  if (row) params.set('row', row);
  else params.delete('row');
  if (back) params.set('back', back);
  else params.delete('back');
  const next = `${location.pathname}?${params}`;
  if (next !== `${location.pathname}${location.search}`) history.pushState(null, '', next);
}

window.addEventListener('popstate', () => {
  if (!sketch || !current) return;
  readAddress();
  draw();
});

function draw() {
  view?.destroy();
  view = render(sketch, {
    components,
    root: appRoot,
    data: liveData,
    me: me(),
    // The server sends anyone but the host a description without host-only screens.
    host: me().id === current.hostId,
    onNavigate: writeAddress,
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
      } else if (action.type === 'edit') {
        await api(
          `data/${encodeURIComponent(action.target)}/${encodeURIComponent(action.rowId)}`,
          { method: 'PUT', body: { field: action.field, value: action.value } },
        );
      } else if (action.type === 'set-status') {
        await api(
          `data/${encodeURIComponent(action.target)}/${encodeURIComponent(action.rowId)}`,
          { method: 'PATCH', body: { status: action.status } },
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
  const notices = await loadLibrary(parsed.sketch.uses ?? {});
  current = next;
  sketch = parsed.sketch;
  title.textContent = sketch.meta?.title || appId;
  document.title = title.textContent;
  await loadData();
  if (!view) readAddress();
  draw();
  await loadVersions();
  setStatus([`Live version ${current.versionId}`, ...notices].join(' · '));
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
