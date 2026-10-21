// SOMA Studio v1: one project's chat with the AI team, its agreements, its
// open questions and its live Puppet app. Served at /studio/ on the soma-forge
// site, so it shares the sign-in session with the app pane.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

import { createSomaAuthConfig } from '/vendor/soma-signin/somaAuthConfig.js';
import { dateLabel, madeText, renderText, seconds, teamStatusText, timeLabel } from '/studio/view.js';

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const studioId = params.get('s');

const ui = {
  status: $('#status'),
  auth: $('#auth'),
  picker: $('#picker'),
  studio: $('#studio'),
  tabs: $('#tabs'),
  title: $('#studio-title'),
  session: $('#session-badge'),
  newSession: $('#new-session'),
  toggleApp: $('#toggle-app'),
  identity: $('#identity'),
  messages: $('#messages'),
  teamStatus: $('#team-status'),
  form: $('#composer-form'),
  composer: $('#composer'),
  send: $('#send'),
  agreements: $('#agreements'),
  removed: $('#removed-agreements'),
  questions: $('#questions'),
  frame: $('#app-frame'),
  appOpen: $('#app-open'),
  appEmpty: $('#app-empty'),
};

let supabase;
let session;
let config = {};
let devUser = null;
let studio = null;
let me = null;
let state = null;
let version = null;
let cursor = 0;
const messages = new Map();
let channel = null;
let listening = false;
let pollTimer = null;
let tickTimer = null;
let refreshing = null;
let refreshAgain = false;
let lastAppVersion = null;

const setStatus = (text) => {
  ui.status.textContent = text || '';
};

function headers(extra = {}) {
  return {
    ...extra,
    ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    ...(devUser ? { 'x-dev-user': `${devUser.id}:${devUser.name}` } : {}),
  };
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api/studio${path}`, {
    method,
    headers: headers(body ? { 'content-type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

const studioPath = (suffix = '') => `/${encodeURIComponent(studioId)}${suffix}`;

// ---------- the feed: realtime pings, with polling as the safety net ----------

async function refresh() {
  if (!studio && !studioId) return;
  if (refreshing) {
    refreshAgain = true;
    return refreshing;
  }
  refreshing = (async () => {
    try {
      const query = new URLSearchParams({ after: String(cursor) });
      if (version !== null) query.set('version', String(version));
      const feed = await api(studioPath(`/feed?${query}`));
      applyFeed(feed);
      setStatus('');
    } catch (error) {
      setStatus(error.message);
      if (error.status === 401 || error.status === 403) stopLive();
    } finally {
      refreshing = null;
      if (refreshAgain) {
        refreshAgain = false;
        refresh();
      }
    }
  })();
  return refreshing;
}

function applyFeed(feed) {
  const first = !studio;
  studio = feed.studio;
  me = feed.me;
  version = feed.version;
  if (feed.state) state = feed.state;
  for (const message of feed.messages) {
    messages.set(message.seq, message);
    cursor = Math.max(cursor, message.seq);
  }
  if (first) {
    showStudio(feed);
    subscribe(feed.topic);
  }
  drawMessages(feed.messages, { earliest: feed.earliest });
  if (feed.state) {
    drawAgreements();
    drawQuestions();
    drawSession();
    syncApp();
  }
  drawTeamStatus();
}

function subscribe(topic) {
  if (!supabase || !topic || channel) return;
  channel = supabase
    .channel(topic, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'changed' }, () => refresh())
    .subscribe((status) => {
      listening = status === 'SUBSCRIBED';
      schedulePoll();
      drawTeamStatus();
    });
}

// A push makes the page fetch at once. The poll only catches a lost push, so
// it is slow while the push channel is up and quick while it is not.
function schedulePoll() {
  clearTimeout(pollTimer);
  const delay = document.hidden ? 60000 : listening ? 15000 : 3000;
  pollTimer = setTimeout(async () => {
    await refresh();
    schedulePoll();
  }, delay);
}

function stopLive() {
  clearTimeout(pollTimer);
  clearInterval(tickTimer);
  if (channel) supabase?.removeChannel(channel);
  channel = null;
  listening = false;
}

document.addEventListener('visibilitychange', () => {
  if (!studio) return;
  if (!document.hidden) refresh();
  schedulePoll();
});

// ---------- drawing ----------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function showStudio(feed) {
  ui.auth.hidden = true;
  ui.picker.hidden = true;
  ui.studio.hidden = false;
  ui.tabs.hidden = false;
  ui.title.textContent = feed.studio.title;
  document.title = `${feed.studio.title} · SOMA Studio`;
  ui.newSession.hidden = !feed.me.isHost;
  ui.toggleApp.hidden = false;
  installChip();
  clearInterval(tickTimer);
  tickTimer = setInterval(drawTeamStatus, 1000);
  if (window.matchMedia('(min-width: 1200px)').matches) ui.composer.focus();
}

function nearBottom() {
  const box = ui.messages;
  return box.scrollHeight - box.scrollTop - box.clientHeight < 120;
}

function authorLabel(message) {
  if (message.author?.kind === 'team') return 'The team';
  return message.author?.name || 'Someone';
}

function messageNode(message) {
  const team = message.author?.kind === 'team';
  const mine = !team && me && ((me.email && message.author?.email === me.email) || message.author?.name === me.name);
  const footer = [];
  if (message.answers?.length) footer.push(`Answered question ${message.answers.join(', ')}.`);
  if (team && message.meta && (message.meta.pickupMs != null || message.meta.answerMs != null)) {
    footer.push(`Picked up in ${seconds(message.meta.pickupMs) ?? '?'}, answered in ${seconds(message.meta.answerMs) ?? '?'}.`);
  }
  const made = madeText(message.made);
  if (made) footer.push(made);
  return el('article', { class: `message${team ? ' team' : ''}${mine ? ' mine' : ''}`, id: `m-${message.seq}`, 'data-seq': message.seq }, [
    el('header', {}, [
      el('strong', { text: authorLabel(message) }),
      el('a', { class: 'seq', href: `#m-${message.seq}`, text: `#${message.seq}` }),
      message.replyTo ? el('a', { class: 'reply-to', href: `#m-${message.replyTo}`, 'data-ref': message.replyTo, text: `↩ #${message.replyTo}` }) : null,
      el('time', { datetime: message.at, title: dateLabel(message.at), text: timeLabel(message.at) }),
    ]),
    el('div', { class: 'body', html: renderText(message.text) }),
    footer.length ? el('footer', { text: footer.join(' ') }) : null,
  ]);
}

function sessionDivider(n) {
  const info = state?.sessions?.find((item) => item.n === n);
  return el('div', { class: 'session-divider', 'data-session': n }, [
    el('span', { text: `Session ${n}${info ? ` · ${dateLabel(info.startedAt)}` : ''}` }),
  ]);
}

function drawMessages(added, { earliest } = {}) {
  if (!added.length) {
    if (!messages.size && !ui.messages.querySelector('.empty')) {
      ui.messages.append(el('p', { class: 'empty', text: 'No messages yet. Say what you want to build, or ask the team a question.' }));
    }
    return;
  }
  ui.messages.querySelector('.empty')?.remove();
  if (earliest && earliest > 1 && !ui.messages.querySelector('.earlier')) {
    ui.messages.prepend(el('p', { class: 'earlier hint', text: `Earlier messages (#1 to #${earliest - 1}) are kept in the studio; this page shows the latest.` }));
  }
  const stick = nearBottom() || ui.messages.childElementCount <= 1;
  for (const message of added) {
    if (document.getElementById(`m-${message.seq}`)) continue;
    const previous = [...messages.keys()].filter((seq) => seq < message.seq && document.getElementById(`m-${seq}`)).at(-1);
    const previousSession = previous ? messages.get(previous)?.session : null;
    if (message.session !== previousSession && !ui.messages.querySelector(`[data-session="${message.session}"]`)) {
      ui.messages.append(sessionDivider(message.session));
    }
    ui.messages.append(messageNode(message));
  }
  if (stick) ui.messages.scrollTop = ui.messages.scrollHeight;
}

function flash(seq) {
  const node = document.getElementById(`m-${seq}`);
  if (!node) {
    setStatus(`Message #${seq} is older than this page shows.`);
    return;
  }
  selectTab('chat');
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  node.classList.remove('flash');
  void node.offsetWidth;
  node.classList.add('flash');
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-ref], a.seq, a.from');
  if (!link) return;
  const seq = Number(link.dataset.ref || link.getAttribute('href').replace('#m-', ''));
  if (!seq) return;
  event.preventDefault();
  flash(seq);
});

function setCounts(name, value) {
  document.querySelectorAll(`[data-count="${name}"]`).forEach((node) => {
    node.textContent = value ? `(${value})` : '';
  });
}

function agreementNode(agreement) {
  const host = me?.isHost;
  const item = el('li', { class: 'item agreement', id: `a-${agreement.n}` });
  const meta = [
    agreement.from ? el('a', { class: 'from', href: `#m-${agreement.from}`, 'data-ref': agreement.from, text: `from #${agreement.from}` }) : null,
    agreement.fromQuestion ? el('span', { class: 'tag', text: `question ${agreement.fromQuestion}` }) : null,
    agreement.editedBy ? el('span', { class: 'tag', title: `Corrected by ${agreement.editedBy}`, text: 'corrected' }) : null,
  ];
  const actions = host && agreement.status === 'active'
    ? el('span', { class: 'actions' }, [
      el('button', { type: 'button', class: 'link', text: 'Correct', onclick: () => editAgreement(item, agreement) }),
      el('button', { type: 'button', class: 'link danger', text: 'Remove', onclick: () => removeAgreement(agreement) }),
    ])
    : null;
  item.append(
    el('span', { class: 'num', text: `A${agreement.n}` }),
    el('div', { class: 'item-body' }, [
      el('p', { class: 'text', text: agreement.text }),
      el('div', { class: 'meta' }, [...meta, actions]),
    ]),
  );
  return item;
}

function editAgreement(item, agreement) {
  const box = el('textarea', { class: 'edit', rows: 3, 'aria-label': `Correct agreement A${agreement.n}` });
  box.value = agreement.text;
  const save = el('button', { type: 'button', text: 'Save' });
  const cancel = el('button', { type: 'button', class: 'ghost-dark', text: 'Cancel', onclick: () => drawAgreements() });
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await api(studioPath(`/agreements/${agreement.n}`), { method: 'PATCH', body: { text: box.value } });
      await refresh();
    } catch (error) {
      setStatus(error.message);
      save.disabled = false;
    }
  });
  item.querySelector('.item-body').replaceChildren(box, el('div', { class: 'meta' }, [save, cancel]));
  box.focus();
}

async function removeAgreement(agreement) {
  if (!confirm(`Remove agreement A${agreement.n}? It stays in the record under "Removed".`)) return;
  try {
    await api(studioPath(`/agreements/${agreement.n}`), { method: 'DELETE' });
    await refresh();
  } catch (error) {
    setStatus(error.message);
  }
}

function drawAgreements() {
  const active = state.agreements.filter((item) => item.status === 'active');
  const removed = state.agreements.filter((item) => item.status === 'removed');
  ui.agreements.replaceChildren(
    ...(active.length ? active.map(agreementNode) : [el('li', { class: 'empty', text: 'Nothing agreed yet.' })]),
  );
  ui.removed.hidden = !removed.length;
  ui.removed.querySelector('summary').textContent = `Removed (${removed.length})`;
  ui.removed.querySelector('ol').replaceChildren(
    ...removed.map((agreement) => el('li', { class: 'item agreement removed-item' }, [
      el('span', { class: 'num', text: `A${agreement.n}` }),
      el('p', { class: 'text', text: `${agreement.text} (removed by ${agreement.removedBy})` }),
    ])),
  );
  setCounts('agreements', active.length);
}

function questionNode(question) {
  const item = el('li', {
    class: `item question${question.highlighted ? ' highlighted' : ''}`,
    id: `q-${question.n}`,
  });
  const answer = () => {
    selectTab('chat');
    const prefix = `${question.n}: `;
    if (!ui.composer.value.trim()) ui.composer.value = prefix;
    else if (!ui.composer.value.includes(prefix)) ui.composer.value = `${ui.composer.value.trimEnd()}\n${prefix}`;
    ui.composer.focus();
    ui.composer.setSelectionRange(ui.composer.value.length, ui.composer.value.length);
  };
  item.append(
    el('button', { type: 'button', class: 'num', title: `Answer question ${question.n}`, text: String(question.n), onclick: answer }),
    el('div', { class: 'item-body' }, [
      el('button', { type: 'button', class: 'text question-text', text: question.text, onclick: answer }),
      question.highlighted
        ? el('p', { class: 'why', text: `The team thinks this matters now${question.highlightReason ? `: ${question.highlightReason}` : '.'}` })
        : null,
      el('div', { class: 'meta' }, [
        question.from ? el('a', { class: 'from', href: `#m-${question.from}`, 'data-ref': question.from, text: `from #${question.from}` }) : null,
        me?.isHost ? el('button', { type: 'button', class: 'link', text: 'Drop', title: 'Drop this question without an answer', onclick: () => dropQuestion(question) }) : null,
      ]),
    ]),
  );
  return item;
}

async function dropQuestion(question) {
  try {
    await api(studioPath(`/questions/${question.n}`), { method: 'DELETE' });
    await refresh();
  } catch (error) {
    setStatus(error.message);
  }
}

function drawQuestions() {
  const open = state.questions
    .filter((item) => item.status === 'open')
    .sort((left, right) => Number(right.highlighted) - Number(left.highlighted) || left.n - right.n);
  const answered = state.questions.filter((item) => item.status === 'answered').length;
  ui.questions.replaceChildren(
    ...(open.length ? open.map(questionNode) : [el('li', { class: 'empty', text: 'No open questions.' })]),
    ...(answered ? [el('li', { class: 'hint answered-note', text: `${answered} answered; they are in the agreements.` })] : []),
  );
  setCounts('questions', open.length);
}

function drawSession() {
  const current = state.sessions.at(-1);
  ui.session.hidden = !current;
  if (current) {
    ui.session.textContent = `Session ${current.n}`;
    ui.session.title = `Started ${dateLabel(current.startedAt)}${current.startedBy ? ` by ${current.startedBy}` : ''}`;
  }
}

function lastHumanAt() {
  const seq = state?.lastHumanSeq;
  const message = seq ? messages.get(seq) : null;
  return message ? Date.parse(message.at) : NaN;
}

function drawTeamStatus() {
  if (!state) return;
  const { tone, text } = teamStatusText(state.team, {
    nowMs: Date.now(),
    lastHumanAtMs: lastHumanAt(),
    lastHumanSeq: state.lastHumanSeq,
    teamCursor: state.teamCursor,
    listening,
  });
  ui.teamStatus.dataset.tone = tone;
  ui.teamStatus.textContent = text;
}

// ---------- the live app pane ----------

function syncApp() {
  const appId = studio?.appId;
  if (!appId) {
    ui.frame.hidden = true;
    ui.appEmpty.hidden = false;
    ui.appOpen.hidden = true;
    return;
  }
  const src = `/?app=${encodeURIComponent(appId)}`;
  ui.appOpen.href = src;
  ui.appOpen.hidden = false;
  ui.appEmpty.hidden = true;
  if (ui.frame.hidden) {
    ui.frame.hidden = false;
    ui.frame.src = src;
  }
  const appVersion = state.app?.version ?? 0;
  // Someone in the session changed the app: redraw this page's copy now
  // instead of waiting for the runtime's own 10-second check.
  if (lastAppVersion !== null && appVersion !== lastAppVersion) {
    ui.frame.contentWindow?.postMessage({ type: 'soma-studio:refresh' }, location.origin);
  }
  lastAppVersion = appVersion;
}

window.addEventListener('message', async (event) => {
  if (event.origin !== location.origin || event.source !== ui.frame.contentWindow) return;
  if (event.data?.type !== 'soma-app:changed' || !studio) return;
  try {
    await api(studioPath('/app-changed'), { method: 'POST', body: { versionId: event.data.versionId ?? null } });
    lastAppVersion = null;
    await refresh();
    lastAppVersion = state.app?.version ?? 0;
  } catch (error) {
    setStatus(error.message);
  }
});

ui.toggleApp.addEventListener('click', () => {
  const hidden = ui.studio.classList.toggle('no-app');
  ui.toggleApp.textContent = hidden ? 'Show app' : 'Hide app';
  ui.toggleApp.setAttribute('aria-pressed', String(!hidden));
});

// ---------- narrow screens: one pane at a time ----------

function selectTab(name) {
  ui.studio.dataset.tab = name;
  ui.tabs.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.tab === name));
  });
}

ui.tabs.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (button) selectTab(button.dataset.tab);
});

// ---------- sending ----------

async function send() {
  const text = ui.composer.value.trim();
  if (!text || !studio) return;
  ui.send.disabled = true;
  try {
    const { message } = await api(studioPath('/messages'), { method: 'POST', body: { text } });
    ui.composer.value = '';
    messages.set(message.seq, message);
    drawMessages([message]);
    ui.messages.scrollTop = ui.messages.scrollHeight;
    await refresh();
  } catch (error) {
    setStatus(`Not sent: ${error.message}`);
  } finally {
    ui.send.disabled = false;
    ui.composer.focus();
  }
}

ui.form.addEventListener('submit', (event) => {
  event.preventDefault();
  send();
});

ui.composer.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send();
  }
});

ui.newSession.addEventListener('click', async () => {
  if (!confirm('Start a new session? The team starts a fresh conversation, keeping the agreements and open questions.')) return;
  try {
    await api(studioPath('/sessions'), { method: 'POST' });
    await refresh();
  } catch (error) {
    setStatus(error.message);
  }
});

// ---------- speech-to-text hook (workstream B's soma-speech) ----------

// The composer holds <soma-mic for="composer">. When the speech component is
// installed it defines that element; until then the slot stays empty.
import('/studio/vendor/soma-speech/soma-speech.js').catch(() => {});

// ---------- feedback chip ----------

function installChip() {
  if (document.querySelector('[data-studio-chip]')) return;
  window.somaFeedbackIdentity = () => ({ name: me?.name, email: me?.email });
  const loader = el('script', {
    src: '/vendor/soma-feedback/soma-chip-loader.js',
    'data-studio-chip': 'true',
    'data-site': 'soma-studio',
    'data-no-google': '',
  });
  if (devUser) loader.dataset.channel = 'local';
  document.body.append(loader);
}

// ---------- sign-in and choosing a studio ----------

function showIdentity() {
  const name = devUser?.name || session?.user?.user_metadata?.full_name || session?.user?.email || '';
  ui.identity.replaceChildren(
    el('span', { text: name }),
    el('button', {
      type: 'button',
      class: 'ghost',
      text: 'Sign out',
      onclick: () => {
        stopLive();
        if (devUser) {
          devUser = null;
          location.reload();
        } else supabase.auth.signOut();
      },
    }),
  );
}

function showSignIn(configured) {
  stopLive();
  ui.studio.hidden = true;
  ui.tabs.hidden = true;
  ui.picker.hidden = true;
  ui.identity.replaceChildren();
  ui.auth.hidden = false;
  ui.auth.innerHTML = `
    <h1>Sign in to the studio</h1>
    <p>SOMA Studio is where you talk with the AI team about an app while it is built. Sign in with the SOMA account the studio's host invited.</p>
    <form>
      <input type="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email">
      <button type="submit">Email me a sign-in link</button>
      <button type="button" data-google>Continue with Google</button>
    </form>`;
  if (config.devIdentity) {
    const box = el('div', { class: 'dev-identity' }, [el('p', { text: 'Local development only:' })]);
    for (const [id, name, label] of [['rosa', 'Rosa', 'Continue as Rosa (host)'], ['theo', 'Theo', 'Continue as Theo']]) {
      box.append(el('button', { type: 'button', text: label, onclick: () => { devUser = { id, name }; enter(); } }));
    }
    ui.auth.append(box);
  }
  if (!configured) {
    setStatus('Sign-in is not configured on this site.');
    return;
  }
  ui.auth.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = ui.auth.querySelector('input').value;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
    setStatus(error ? error.message : 'Check your email for the sign-in link.');
  });
  ui.auth.querySelector('[data-google]').addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
    if (error) setStatus(error.message);
  });
}

async function showPicker() {
  const { studios } = await api('');
  if (studios.length === 1) {
    location.replace(`/studio/?s=${encodeURIComponent(studios[0].id)}`);
    return;
  }
  ui.auth.hidden = true;
  ui.picker.hidden = false;
  ui.picker.replaceChildren(
    el('h1', { text: 'Your studios' }),
    studios.length
      ? el('ul', {}, studios.map((item) => el('li', {}, [
        el('a', { href: `/studio/?s=${encodeURIComponent(item.id)}`, text: item.title }),
        item.purpose ? el('p', { class: 'hint', text: item.purpose }) : null,
      ])))
      : el('p', { text: 'You are not a member of any studio yet. Ask the studio\'s host to add the email you signed in with.' }),
  );
}

async function enter() {
  ui.auth.hidden = true;
  showIdentity();
  try {
    if (!studioId) {
      await showPicker();
      return;
    }
    await refresh();
    if (!studio) return;
    schedulePoll();
  } catch (error) {
    setStatus(error.message);
  }
}

async function start() {
  config = await (await fetch('/api/config')).json();
  const auth = createSomaAuthConfig({
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    methods: { magicLink: true, password: false, oauth: ['google'] },
  });
  const configured = Boolean(auth.url && auth.anonKey);
  if (configured) supabase = createClient(auth.url, auth.anonKey);
  if (!supabase) {
    showSignIn(false);
    return;
  }
  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (session) await enter();
  else showSignIn(true);
  supabase.auth.onAuthStateChange((_event, next) => {
    const changed = next?.access_token !== session?.access_token;
    const signedInNow = !session && next;
    session = next;
    if (!next && !devUser) showSignIn(true);
    else if (signedInNow) enter();
    else if (changed && channel) supabase.realtime.setAuth(next.access_token);
  });
}

start().catch((error) => setStatus(error.message));
