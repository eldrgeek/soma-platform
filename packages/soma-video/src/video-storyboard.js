/* soma-video video-storyboard.js: the storyboards a reader may open, and one open board to change (Puppet v0.7).
 *
 *   import { mountStoryboards } from './video-storyboard.js';
 *   const view = mountStoryboards(container, { api, host, initial, onOpen });
 *
 * A storyboard (storyboard.js) is a video's plan as scene cards: each card has its picture (9:16 or 16:9,
 * one switch for the board), the lyric line and its time in the song with a button that plays that
 * stretch, the prompt and reference photos, and a status: keep, redo or new. On a card a person can
 * write a redo note and ask for new pictures, add a scene after it, drag it (or use ↑ ↓) to reorder,
 * and put back an earlier picture. The cuts (full song, 60-second cut, shorts) say when a change means
 * they need rendering again, and render through the team on Mike's Mac.
 *
 * Fast notes and rerolls (2026-10-23, "notes from eric and reroll fast"): "Reroll" on a card asks for a new
 * take of the same prompt in one click. The "Notes and redos" panel takes an artist's notes as written (an
 * email or a text pasted in; notes.js finds the cards they name), shows where each note will land, and puts
 * them on the cards with one batch request; redoes every card marked redo in one batch; lets every held
 * request run (host only); and asks for every cut that needs a new render.
 *
 * api: { listBoards(), createBoard({ title, project }), getBoard(id), changeBoard(id, ops), listJobs(id),
 *        createJob(id, { step, scene?, scenes?, cut?, note? }), decideJob(id, jobId, release), fetchFile(id, name),
 *        sendNotes(id, { text }) }
 * fetchFile returns a Blob; pictures, the song and renders play from object URLs, never the API address.
 * host: whether the reader is the app's host (starts boards, lets held jobs run).
 * initial: a board id to open; onOpen(id or null) is told when the reader opens or leaves a board.
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf.
 */
import { ago } from './video-jobs.js';
import {
  ASPECT_LABEL, ASPECTS, BOARD_STEPS, clockOf, cutLength, cutScenes, cutState, parseClock, parseRanges, rangesText, SCENE_STATUSES,
} from './storyboard.js';
import { jobScenes, parseNotes, redoQueue } from './notes.js';

const STYLE_ID = 'soma-video-storyboard-style';
const CSS = `
.svs { --svs-ink: #1d2433; --svs-muted: #5d6b82; --svs-line: #d9dfe8; --svs-paper: #fff; --svs-accent: #6b4fa0; --svs-soft: #f4f1fa;
  font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--svs-ink); }
.svs h2 { margin: 0 0 4px; font-size: 22px; } .svs h3 { margin: 0 0 6px; font-size: 16px; }
.svs-lead { color: var(--svs-muted); font-size: 13px; margin: 0 0 12px; }
.svs-msg { min-height: 1.2em; font-size: 13px; color: #8a4b00; margin: 0 0 8px; }
.svs button { font: inherit; cursor: pointer; }
.svs-btn { border: 1px solid var(--svs-line); background: var(--svs-paper); color: var(--svs-ink); border-radius: 6px; padding: 4px 10px; font-size: 13px; }
.svs-btn:hover { border-color: var(--svs-accent); }
.svs-primary { background: var(--svs-accent); border-color: var(--svs-accent); color: #fff; font-weight: 600; }
.svs-btn[aria-pressed="true"] { background: var(--svs-accent); border-color: var(--svs-accent); color: #fff; }
.svs-btn:disabled { opacity: .5; cursor: default; }
.svs input, .svs textarea, .svs select { font: 14px/1.4 system-ui, sans-serif; border: 1px solid #c9d2df; border-radius: 6px; padding: 4px 6px; box-sizing: border-box; max-width: 100%; }
.svs textarea { width: 100%; min-height: 54px; resize: vertical; }
.svs-boards { list-style: none; padding: 0; margin: 0 0 14px; display: grid; gap: 8px; }
.svs-boards li { border: 1px solid var(--svs-line); border-radius: 8px; padding: 10px 12px; background: var(--svs-paper); cursor: pointer; }
.svs-boards li:hover { border-color: var(--svs-accent); }
.svs-boards small { color: var(--svs-muted); display: block; }
.svs-notes-preview { list-style: none; margin: 6px 0; padding: 0; font-size: 13px; display: grid; gap: 4px; }
.svs-notes-preview li { border-left: 3px solid var(--svs-accent); padding-left: 6px; white-space: pre-wrap; }
.svs-notes-preview li.svs-general { border-left-color: var(--svs-line); color: var(--svs-muted); }
.svs-new { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.svs-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
.svs-bar .svs-grow { flex: 1; }
.svs-panel { border: 1px solid var(--svs-line); border-radius: 8px; background: var(--svs-paper); padding: 10px 12px; margin: 0 0 14px; }
.svs-cuts { display: grid; gap: 8px; }
.svs-cut { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border-top: 1px solid #eef1f5; padding-top: 8px; }
.svs-cut:first-child { border-top: 0; padding-top: 0; }
.svs-cut b { min-width: 140px; }
.svs-state { font: 600 11px/1.6 ui-monospace, Menlo, monospace; padding: 0 6px; border-radius: 4px; background: #e8edf5; }
.svs-state-stale { background: #fff1c2; } .svs-state-current { background: #d9f2df; } .svs-state-never { background: #e8edf5; }
.svs-state-held { background: #fde3c8; } .svs-state-running { background: #fff1c2; } .svs-state-done { background: #d9f2df; } .svs-state-failed { background: #fbd9d9; }
.svs-cut-edit { display: grid; gap: 6px; width: 100%; background: var(--svs-soft); border-radius: 6px; padding: 8px; }
.svs-cut-edit label { display: grid; gap: 2px; font-size: 12px; color: var(--svs-muted); }
.svs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; margin: 0 0 14px; }
.svs-grid.svs-wide { grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }
.svs-card { border: 1px solid var(--svs-line); border-radius: 10px; background: var(--svs-paper); overflow: hidden; display: flex; flex-direction: column; }
.svs-card[data-status="redo"] { border-color: #e0a400; box-shadow: 0 0 0 2px #fff1c2; }
.svs-card[data-status="new"] { border-color: var(--svs-accent); box-shadow: 0 0 0 2px var(--svs-soft); }
.svs-card.svs-over { outline: 3px dashed var(--svs-accent); }
.svs-card-head { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: #eef2f8; font-size: 13px; }
.svs-handle { cursor: grab; color: var(--svs-muted); user-select: none; padding: 0 2px; }
.svs-id { font-weight: 700; } .svs-section { color: var(--svs-muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svs-play { border: 1px solid var(--svs-accent); color: var(--svs-accent); background: #fff; border-radius: 999px; padding: 1px 10px; font-weight: 600; font-size: 12px; }
.svs-play[aria-pressed="true"] { background: var(--svs-accent); color: #fff; }
.svs-pic { position: relative; background: #0f1420; aspect-ratio: 9 / 16; max-height: 420px; display: flex; align-items: center; justify-content: center; color: #aab3c5; font-size: 13px; }
.svs-wide .svs-pic { aspect-ratio: 16 / 9; }
.svs-pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
.svs-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgb(255 255 255 / .2); }
.svs-progress span { display: block; height: 100%; width: 0; background: var(--svs-accent); }
.svs-job { position: absolute; top: 6px; left: 6px; }
.svs-body { padding: 8px; display: grid; gap: 6px; font-size: 13px; }
.svs-lyric { font-style: italic; width: 100%; }
.svs-times { display: flex; gap: 6px; align-items: center; color: var(--svs-muted); }
.svs-times input { width: 72px; font: 12px ui-monospace, Menlo, monospace; }
.svs-status { display: flex; gap: 4px; }
.svs-row { display: flex; flex-wrap: wrap; gap: 6px; }
.svs details summary { cursor: pointer; color: var(--svs-muted); }
.svs-history { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px; margin-top: 6px; }
.svs-history figure { margin: 0; display: grid; gap: 2px; font-size: 11px; color: var(--svs-muted); }
.svs-history img { width: 100%; border-radius: 4px; background: #0f1420; }
.svs-add { background: var(--svs-soft); border-radius: 6px; padding: 6px; display: grid; gap: 6px; }
.svs-jobs { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 13px; }
.svs-jobs li { border-top: 1px solid #eef1f5; padding-top: 6px; }
.svs-jobs details div { white-space: pre-wrap; margin-top: 4px; }
.svs-video { width: 100%; max-width: 720px; max-height: 70vh; background: #000; border-radius: 6px; margin-top: 6px; }
`;

function installStyle(document) {
  if (!document.head || document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const STEP_LABEL = Object.fromEntries(BOARD_STEPS.map((s) => [s.step, s.label]));
const isOpen = (job) => ['held', 'queued', 'running'].includes(job.status);
const JOB_WORDS = { held: 'waiting for the host', queued: 'queued', running: 'working', done: 'done', failed: 'failed' };

export function mountStoryboards(container, { api, host = false, initial = null, onOpen = () => {}, document = container.ownerDocument, window = document.defaultView, every = 10_000 }) {
  installStyle(document);
  const root = el(document, 'section', 'svs');
  container.append(root);
  const message = el(document, 'p', 'svs-msg');
  message.setAttribute('role', 'status');
  const body = el(document, 'div');
  root.append(body, message);

  let board = null;
  let jobs = [];
  let aspect = '9x16';
  let timer = null;
  let gone = false;
  let dragging = null;
  let editingCut = null;
  let playing = null;
  let audio = null;
  const urls = new Map();
  const seenOpen = new Set();
  const say = (text) => { message.textContent = text; };
  const fail = (error) => say(error?.message ?? String(error));

  function button(text, onClick, className = 'svs-btn') {
    const node = el(document, 'button', className, text);
    node.type = 'button';
    node.addEventListener('click', async (event) => {
      try {
        await onClick(event);
      } catch (error) {
        fail(error);
      }
    });
    return node;
  }

  // A field the reader is typing in holds off the 10-second redraw, so another person's change never
  // throws away what is being typed; it lands at the next redraw after the field is left.
  const editingNow = () => {
    const active = document.activeElement;
    return Boolean(active && root.contains?.(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName ?? ''));
  };
  const hold = (node) => node;

  async function objectUrl(name) {
    if (!name) return null;
    if (!urls.has(name)) {
      urls.set(name, api.fetchFile(board.id, name).then((blob) => window?.URL?.createObjectURL?.(blob) ?? null).catch(() => null));
    }
    return urls.get(name);
  }

  function picture(node, name, alt) {
    if (!name) {
      node.append(el(document, 'span', '', 'No picture yet'));
      return;
    }
    const img = el(document, 'img');
    img.alt = alt;
    img.loading = 'lazy';
    node.append(img);
    objectUrl(name).then((src) => {
      if (src) img.src = src;
    });
  }

  async function change(ops, done = 'Saved.') {
    say('Saving…');
    const next = await api.changeBoard(board.id, ops);
    board = next;
    say(done);
    draw();
    return next;
  }

  async function ask(job, sent) {
    await api.createJob(board.id, job);
    say(host ? `${sent} The team on the Mac picks it up within a minute.` : `${sent} It waits for the host to let it run on the Mac.`);
    await loadJobs();
  }

  // ---------- the song ----------
  function stop() {
    audio?.pause?.();
    if (playing) {
      playing.button.setAttribute('aria-pressed', 'false');
      playing.button.textContent = '▶';
      playing.bar.style.width = '0';
    }
    playing = null;
  }

  async function play(scene, playButton, bar) {
    if (playing?.button === playButton) return stop();
    stop();
    if (!board.song?.file) return say('This storyboard has no song yet.');
    if (typeof scene.start !== 'number') return say(`Scene ${scene.id} has no time in the song.`);
    const end = typeof scene.end === 'number' && scene.end > scene.start ? scene.end : scene.start + 8;
    if (!audio) {
      if (!window?.Audio) return say('This browser cannot play the song.');
      audio = new window.Audio();
      audio.addEventListener('timeupdate', () => {
        if (!playing) return;
        const { start, end: stopAt } = playing;
        playing.bar.style.width = `${Math.min(100, Math.max(0, ((audio.currentTime - start) / (stopAt - start)) * 100))}%`;
        if (audio.currentTime >= stopAt) stop();
      });
      say('Loading the song…');
      const src = await objectUrl(board.song.file);
      if (!src) {
        audio = null;
        return say('The song could not be loaded.');
      }
      audio.src = src;
      say('');
    }
    playing = { button: playButton, bar, start: scene.start, end };
    playButton.setAttribute('aria-pressed', 'true');
    playButton.textContent = '■';
    audio.currentTime = scene.start;
    await audio.play().catch(() => stop());
  }

  // ---------- the list of boards ----------
  async function showList() {
    stop();
    board = null;
    editingCut = null;
    onOpen(null);
    body.replaceChildren();
    body.append(el(document, 'h2', '', 'Storyboards'), el(document, 'p', 'svs-lead', 'One storyboard per song or video: the scenes as cards, and the cuts made from them. Everyone the owner shares a board with can change it.'));
    let boards = [];
    try {
      boards = await api.listBoards();
    } catch (error) {
      fail(error);
    }
    const list = el(document, 'ul', 'svs-boards');
    if (!boards.length) list.append(el(document, 'li', '', 'No storyboards yet.'));
    for (const summary of boards) {
      const item = el(document, 'li');
      item.append(el(document, 'b', '', summary.title));
      item.append(el(document, 'small', '', `${summary.scenes} scenes · ${summary.cuts} cuts · ${summary.role === 'owner' ? 'yours' : 'shared with you'} · changed ${ago(summary.updatedAt)}${summary.updatedBy ? ` by ${summary.updatedBy}` : ''}`));
      item.addEventListener('click', () => open(summary.id).catch(fail));
      list.append(item);
    }
    body.append(list);
    if (host) {
      const form = el(document, 'div', 'svs-new');
      const title = el(document, 'input');
      title.placeholder = 'Title, such as Witness and Stay';
      title.setAttribute('aria-label', 'New storyboard title');
      const project = el(document, 'input');
      project.placeholder = 'Project folder, such as ~/Projects/witness-and-stay-song';
      project.setAttribute('aria-label', 'Project folder on the Mac');
      form.append(title, project, button('Start a storyboard', async () => {
        if (!title.value.trim()) return say('Give the storyboard a title first.');
        const made = await api.createBoard({ title: title.value.trim(), project: project.value.trim() });
        await open(made.id);
      }, 'svs-btn svs-primary'));
      body.append(form);
    }
  }

  // ---------- one board ----------
  async function open(id) {
    say('Opening…');
    board = await api.getBoard(id);
    aspect = board.cuts.find((c) => !c.all)?.aspect ?? aspect;
    onOpen(id);
    say('');
    draw();
    await loadJobs();
  }

  function draw() {
    if (!board) return;
    stop();
    body.replaceChildren();
    const bar = el(document, 'div', 'svs-bar');
    bar.append(button('← All storyboards', () => showList()));
    const title = el(document, 'h2', 'svs-grow', board.title);
    bar.append(title);
    for (const a of ASPECTS) {
      const toggle = button(ASPECT_LABEL[a], () => { aspect = a; draw(); });
      toggle.setAttribute('aria-pressed', String(a === aspect));
      bar.append(toggle);
    }
    body.append(bar);
    body.append(el(document, 'p', 'svs-lead', `${board.scenes.length} scenes${board.song?.duration ? ` · song ${clockOf(board.song.duration)}` : ''} · changed ${ago(board.updatedAt)}${board.updatedBy ? ` by ${board.updatedBy}` : ''}. Changes save as you make them. A redo or a render goes to the team on Mike's Mac${host ? '' : ' once the host lets it run'}.`));
    if (board.role === 'owner') body.append(drawSharing());
    body.append(drawCuts());
    body.append(drawQuick());
    const grid = el(document, 'div', `svs-grid${aspect === '16x9' ? ' svs-wide' : ''}`);
    board.scenes.forEach((scene, index) => grid.append(drawCard(scene, index)));
    if (!board.scenes.length) {
      const empty = el(document, 'div', 'svs-panel');
      empty.append(el(document, 'p', '', 'No scenes yet.'), drawAddForm(null));
      grid.append(empty);
    }
    body.append(grid);
    body.append(drawJobs());
  }

  function drawSharing() {
    const panel = el(document, 'details', 'svs-panel');
    panel.append(el(document, 'summary', '', `Who can change this storyboard${board.artists.length ? ` (${board.artists.length} artist${board.artists.length === 1 ? '' : 's'})` : ''}`));
    panel.append(el(document, 'p', 'svs-lead', 'Artists sign in to VideoMaker with the email named here. They can see the pictures and the song, change cards and cuts, and ask for redos and renders, which wait for the host to let them run.'));
    const list = hold(el(document, 'textarea'));
    list.setAttribute('aria-label', 'Artists, one email per line');
    list.value = board.artists.join('\n');
    panel.append(list, button('Save the artists', () => change([{ op: 'artists', artists: list.value.split(/[\s,]+/).filter(Boolean) }], 'Artists saved.'), 'svs-btn svs-primary'));
    return panel;
  }

  // ---------- cuts ----------
  function drawCuts() {
    const panel = el(document, 'section', 'svs-panel');
    panel.append(el(document, 'h3', '', 'Cuts'));
    const list = el(document, 'div', 'svs-cuts');
    for (const cut of board.cuts) list.append(drawCut(cut));
    if (!board.cuts.length) list.append(el(document, 'p', 'svs-lead', 'No cuts yet. A cut is a list of scenes and the stretches of the song under them.'));
    panel.append(list);
    if (editingCut === 'new') panel.append(drawCutEditor(null));
    else panel.append(button('New cut', () => { editingCut = 'new'; draw(); }));
    return panel;
  }

  function drawCut(cut) {
    const row = el(document, 'div', 'svs-cut');
    const { state, changed, listChanged } = cutState(board, cut);
    row.append(el(document, 'b', '', cut.name));
    row.append(el(document, 'span', 'svs-lead', `${ASPECT_LABEL[cut.aspect]} · ${cutScenes(board, cut).length} scenes · ${cut.audio.length ? clockOf(cutLength(cut)) : 'whole song'}`));
    const words = state === 'never' ? 'not rendered yet' : state === 'current' ? 'up to date' : `needs a new render${changed.length ? `: ${changed.slice(0, 6).join(', ')}${changed.length > 6 ? '…' : ''} changed` : ''}${listChanged ? `${changed.length ? ';' : ':'} its scenes changed` : ''}`;
    row.append(el(document, 'span', `svs-state svs-state-${state}`, words));
    const open = jobs.find((job) => job.cut === cut.id && isOpen(job));
    if (open) row.append(el(document, 'span', `svs-state svs-state-${open.status}`, `render ${JOB_WORDS[open.status]}`));
    else row.append(button('Render', () => ask({ step: 'render', cut: cut.id }, `Asked for a render of ${cut.name}.`), 'svs-btn svs-primary'));
    row.append(button('Edit', () => { editingCut = cut.id; draw(); }));
    if (cut.render?.file) {
      row.append(button('Watch', async () => {
        const video = el(document, 'video', 'svs-video');
        video.controls = true;
        video.src = await objectUrl(cut.render.file);
        row.append(video);
      }));
    }
    if (editingCut === cut.id) row.append(drawCutEditor(cut));
    return row;
  }

  function drawCutEditor(cut) {
    const box = el(document, 'div', 'svs-cut-edit');
    const field = (label, node) => {
      const wrap = el(document, 'label', '', label);
      wrap.append(hold(node));
      box.append(wrap);
      return node;
    };
    const name = field('Name', el(document, 'input'));
    name.value = cut?.name ?? '';
    const choose = field('Picture shape', el(document, 'select'));
    for (const a of ASPECTS) {
      const option = el(document, 'option', '', ASPECT_LABEL[a]);
      option.value = a;
      choose.append(option);
    }
    choose.value = cut?.aspect ?? aspect;
    const song = field('Stretches of the song (empty for the whole song)', el(document, 'input'));
    song.placeholder = '1:40.2-2:10, 3:05-3:20';
    song.value = rangesText(cut?.audio);
    const shots = field('Scenes in order, each with seconds on screen if it has them (empty: every scene on the board, in board order)', el(document, 'textarea'));
    shots.placeholder = 'e14 5.6, e17 4.8, e12';
    shots.value = cut && !cut.all ? cut.shots.map((s) => (s.seconds ? `${s.scene} ${s.seconds}` : s.scene)).join(', ') : '';
    const actions = el(document, 'div', 'svs-row');
    actions.append(button('Save the cut', async () => {
      const list = shots.value.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
        const [scene, seconds] = part.split(/\s+/);
        return seconds ? { scene, seconds: Number(seconds) } : { scene };
      });
      const next = {
        id: cut?.id ?? (name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `cut-${board.cuts.length + 1}`),
        name: name.value, aspect: choose.value, all: !list.length, shots: list, audio: parseRanges(song.value), spec: cut?.spec ?? null,
      };
      editingCut = null;
      await change([{ op: 'cut', cut: next }], `Saved the cut ${next.name}.`);
    }, 'svs-btn svs-primary'));
    actions.append(button('Cancel', () => { editingCut = null; draw(); }));
    if (cut) actions.append(confirmButton('Remove the cut', () => { editingCut = null; return change([{ op: 'remove-cut', cut: cut.id }], `Removed ${cut.name}.`); }));
    box.append(actions);
    return box;
  }

  // A button that asks once more in its own words, instead of a browser dialog.
  function confirmButton(text, onConfirm) {
    let armed = false;
    const node = button(text, async () => {
      if (!armed) {
        armed = true;
        node.textContent = 'Click again to confirm';
        return;
      }
      await onConfirm();
    });
    return node;
  }

  // ---------- scene cards ----------
  function drawCard(scene, index) {
    const card = el(document, 'article', 'svs-card');
    card.dataset.status = scene.status;
    card.dataset.scene = scene.id;
    card.draggable = true;
    card.addEventListener('dragstart', (event) => {
      dragging = scene.id;
      event?.dataTransfer?.setData?.('text/plain', scene.id);
    });
    card.addEventListener('dragover', (event) => {
      if (!dragging || dragging === scene.id) return;
      event?.preventDefault?.();
      card.className = 'svs-card svs-over';
    });
    card.addEventListener('dragleave', () => { card.className = 'svs-card'; });
    card.addEventListener('drop', (event) => {
      event?.preventDefault?.();
      card.className = 'svs-card';
      const moving = dragging;
      dragging = null;
      if (moving && moving !== scene.id) change([{ op: 'move', scene: moving, to: index }], `Moved ${moving}.`).catch(fail);
    });
    card.addEventListener('dragend', () => { dragging = null; });

    const head = el(document, 'div', 'svs-card-head');
    const grip = el(document, 'span', 'svs-handle', '⋮⋮');
    grip.title = 'Drag to move';
    head.append(grip, el(document, 'span', 'svs-id', scene.id), el(document, 'span', 'svs-section', scene.section));
    const progress = el(document, 'div', 'svs-progress');
    const fill = el(document, 'span');
    progress.append(fill);
    const playButton = button('▶', () => play(scene, playButton, fill), 'svs-play');
    playButton.setAttribute('aria-pressed', 'false');
    playButton.setAttribute('aria-label', `Play ${scene.id} in the song`);
    head.append(playButton);
    card.append(head);

    const pic = el(document, 'div', 'svs-pic');
    picture(pic, scene.pictures[aspect], `${scene.id}: ${scene.lyric}`);
    pic.append(progress);
    const job = jobs.find((candidate) => jobScenes(candidate).includes(scene.id) && isOpen(candidate));
    if (job) pic.append(el(document, 'span', `svs-state svs-job svs-state-${job.status}`, `${STEP_LABEL[job.step] ?? job.step}: ${JOB_WORDS[job.status]}`));
    card.append(pic);

    const content = el(document, 'div', 'svs-body');
    const lyric = hold(el(document, 'input', 'svs-lyric'));
    lyric.value = scene.lyric;
    lyric.placeholder = 'Lyric line';
    lyric.setAttribute('aria-label', `Lyric line of ${scene.id}`);
    lyric.addEventListener('change', () => change([{ op: 'set', scene: scene.id, field: 'lyric', value: lyric.value }]).catch(fail));
    content.append(lyric);

    const times = el(document, 'div', 'svs-times');
    const time = (field) => {
      const input = hold(el(document, 'input'));
      input.value = clockOf(scene[field]);
      input.setAttribute('aria-label', `${field === 'start' ? 'Start' : 'End'} of ${scene.id} in the song`);
      input.addEventListener('change', () => {
        const value = input.value.trim() ? parseClock(input.value) : null;
        if (Number.isNaN(value)) return say('Write a time as 1:02.5 or 62.5');
        return change([{ op: 'set', scene: scene.id, field, value }]).catch(fail);
      });
      return input;
    };
    times.append(time('start'), el(document, 'span', '', 'to'), time('end'));
    content.append(times);

    const status = el(document, 'div', 'svs-status');
    for (const s of SCENE_STATUSES) {
      const choice = button(s, () => change([{ op: 'set', scene: scene.id, field: 'status', value: s }]));
      choice.setAttribute('aria-pressed', String(scene.status === s));
      status.append(choice);
    }
    content.append(status);

    const redo = el(document, 'div', 'svs-add');
    const note = hold(el(document, 'textarea'));
    note.value = scene.note;
    note.placeholder = 'Redo note: what should change in this picture?';
    note.setAttribute('aria-label', `Redo note for ${scene.id}`);
    redo.append(note, button(Object.keys(scene.pictures).length ? 'Redo this scene' : 'Make the pictures', async () => {
      if (!note.value.trim() && Object.keys(scene.pictures).length) return say('Say what should change first.');
      const step = Object.keys(scene.pictures).length ? 'redo' : 'add';
      await change([{ op: 'set', scene: scene.id, field: 'note', value: note.value }, { op: 'set', scene: scene.id, field: 'status', value: step === 'redo' ? 'redo' : 'new' }]);
      await ask({ step, scene: scene.id }, `Asked for new pictures for ${scene.id}.`);
    }, 'svs-btn svs-primary'));
    if (Object.keys(scene.pictures).length && !job) {
      const reroll = button('Reroll', async () => {
        await change([{ op: 'set', scene: scene.id, field: 'status', value: 'redo' }]);
        await ask({ step: 'redo', scene: scene.id, ...(note.value.trim() ? {} : { note: 'Reroll: same prompt, a different take.' }) }, `Asked for another take of ${scene.id}.`);
      });
      reroll.title = 'Another take of the same prompt (and the redo note, if there is one), in one click';
      redo.append(reroll);
    }
    content.append(redo);

    const promptBox = el(document, 'details');
    promptBox.append(el(document, 'summary', '', `Prompt and reference photos${scene.refs.length ? ` (${scene.refs.join(', ')})` : ''}`));
    const prompt = hold(el(document, 'textarea'));
    prompt.value = scene.prompt;
    prompt.setAttribute('aria-label', `Prompt for ${scene.id}`);
    prompt.addEventListener('change', () => change([{ op: 'set', scene: scene.id, field: 'prompt', value: prompt.value }]).catch(fail));
    const refs = hold(el(document, 'input'));
    refs.value = scene.refs.join(', ');
    refs.placeholder = 'Reference photos, such as o47, o50';
    refs.setAttribute('aria-label', `Reference photos for ${scene.id}`);
    refs.addEventListener('change', () => change([{ op: 'set', scene: scene.id, field: 'refs', value: refs.value }]).catch(fail));
    promptBox.append(prompt, refs);
    content.append(promptBox);

    if (scene.history.length) {
      const history = el(document, 'details');
      history.append(el(document, 'summary', '', `Earlier pictures (${scene.history.length})`));
      const strip = el(document, 'div', 'svs-history');
      scene.history.forEach((old, at) => {
        const figure = el(document, 'figure');
        const thumb = el(document, 'div');
        picture(thumb, old.pictures[aspect], `${scene.id} earlier`);
        figure.append(thumb, el(document, 'figcaption', '', `${String(old.at).slice(0, 10)}${old.by ? ` · ${old.by}` : ''}`));
        figure.append(button('Use this one', () => change([{ op: 'use-picture', scene: scene.id, history: at }], `Put back an earlier picture for ${scene.id}.`)));
        strip.append(figure);
      });
      history.append(strip);
      content.append(history);
    }

    const actions = el(document, 'div', 'svs-row');
    const up = button('↑', () => change([{ op: 'move', scene: scene.id, to: index - 1 }], `Moved ${scene.id}.`));
    up.disabled = index === 0;
    up.setAttribute('aria-label', `Move ${scene.id} earlier`);
    const down = button('↓', () => change([{ op: 'move', scene: scene.id, to: index + 1 }], `Moved ${scene.id}.`));
    down.disabled = index === board.scenes.length - 1;
    down.setAttribute('aria-label', `Move ${scene.id} later`);
    const addAfter = el(document, 'div');
    actions.append(up, down, button('Add scene after', () => {
      addAfter.replaceChildren();
      addAfter.append(drawAddForm(scene.id));
    }), confirmButton('Remove', () => change([{ op: 'remove', scene: scene.id }], `Removed ${scene.id}.`)));
    content.append(actions, addAfter);
    card.append(content);
    return card;
  }

  function drawAddForm(after) {
    const box = el(document, 'div', 'svs-add');
    const lyric = hold(el(document, 'input'));
    lyric.placeholder = 'Lyric line';
    lyric.setAttribute('aria-label', 'Lyric line of the new scene');
    const prompt = hold(el(document, 'textarea'));
    prompt.placeholder = 'What the picture shows';
    prompt.setAttribute('aria-label', 'Prompt for the new scene');
    box.append(lyric, prompt, button('Add and make its pictures', async () => {
      if (!prompt.value.trim()) return say('Say what the new picture shows first.');
      const next = await change([{ op: 'add-after', after, scene: { lyric: lyric.value, prompt: prompt.value } }], 'Added a scene.');
      const added = next.added?.[0];
      if (added) await ask({ step: 'add', scene: added }, `Asked for pictures for the new scene ${added}.`);
    }, 'svs-btn svs-primary'));
    return box;
  }

  // ---------- notes and fast redos ----------
  let notesDraft = '';
  function drawQuick() {
    const panel = el(document, 'section', 'svs-panel');
    panel.append(el(document, 'h3', '', 'Notes and redos'));
    const row = el(document, 'div', 'svs-row');
    const queue = redoQueue(board, jobs);
    const batch = button(queue.length ? `Redo the ${queue.length} marked scene${queue.length === 1 ? '' : 's'} in one batch` : 'No scenes marked redo', async () => {
      const scenes = redoQueue(board, jobs).slice(0, 24);
      if (!scenes.length) return say('Mark scenes redo (or write notes below) first.');
      await ask({ step: 'batch', scenes }, `Asked for new pictures for ${scenes.join(', ')} in one batch.`);
    }, 'svs-btn svs-primary');
    batch.disabled = !queue.length;
    row.append(batch);
    const held = jobs.filter((job) => job.status === 'held');
    if (host && held.length) {
      row.append(button(`Let all ${held.length} waiting request${held.length === 1 ? '' : 's'} run`, async () => {
        for (const job of held) await api.decideJob(board.id, job.id, true);
        say(`${held.length} request${held.length === 1 ? '' : 's'} will run on the Mac, oldest first.`);
        await loadJobs();
      }));
    }
    const stale = board.cuts.filter((cut) => cutState(board, cut).state === 'stale' && !jobs.some((job) => job.cut === cut.id && isOpen(job)));
    if (stale.length) {
      row.append(button(`Render the ${stale.length} out-of-date cut${stale.length === 1 ? '' : 's'}`, async () => {
        for (const cut of stale) await api.createJob(board.id, { step: 'render', cut: cut.id });
        say(host ? `Asked for ${stale.length} render${stale.length === 1 ? '' : 's'}.` : `Asked for ${stale.length} render${stale.length === 1 ? '' : 's'}; they wait for the host to let them run.`);
        await loadJobs();
      }));
    }
    panel.append(row);

    const notes = el(document, 'details');
    notes.open = Boolean(notesDraft);
    notes.append(el(document, 'summary', '', 'Paste notes (an email or a text from the artist)'));
    notes.append(el(document, 'p', 'svs-lead', 'Write or paste notes as they came. A note names its scene by id (e05: older), by number (scene 5, #5) or by quoting its lyric. Each note goes on its card and the cards are redone in one batch.'));
    const text = hold(el(document, 'textarea'));
    text.setAttribute('aria-label', 'Notes from the artist');
    text.placeholder = 'e05: he looks too young here\n"so this is how it ends" is too dark\nscene 12 - lose the hat';
    text.value = notesDraft;
    const preview = el(document, 'ul', 'svs-notes-preview');
    const show = () => {
      notesDraft = text.value;
      const found = parseNotes(board, text.value);
      preview.replaceChildren();
      for (const n of found.notes) preview.append(el(document, 'li', '', `${n.scene}${n.keep ? ' (keep)' : ''}: ${n.note}`));
      for (const line of found.general) preview.append(el(document, 'li', 'svs-general', `On no card: ${line}`));
      return found;
    };
    text.addEventListener('input', show);
    show();
    notes.append(text, preview, button('Put the notes on the cards and redo them', async () => {
      const found = show();
      if (!found.notes.length) return say('None of these notes names a scene. Start a line with its id, such as e05:, or quote its lyric.');
      const sent = await api.sendNotes(board.id, { text: text.value });
      notesDraft = '';
      if (sent.board) board = sent.board;
      const where = sent.notes.map((n) => n.scene).join(', ');
      say(sent.job ? `Notes put on ${where}; ${sent.job.status === 'held' ? 'the batch waits for the host to let it run' : 'the batch is queued for the Mac'}.` : `Notes put on ${where}.`);
      await loadJobs();
      draw();
    }, 'svs-btn svs-primary'));
    panel.append(notes);
    return panel;
  }

  // ---------- jobs ----------
  function drawJobs() {
    const panel = el(document, 'section', 'svs-panel');
    panel.append(el(document, 'h3', '', 'Requests to the team'));
    const list = el(document, 'ul', 'svs-jobs');
    if (!jobs.length) list.append(el(document, 'li', 'svs-lead', 'No requests yet.'));
    for (const job of jobs.slice(0, 15)) {
      const item = el(document, 'li');
      const what = job.cut ? board.cuts.find((c) => c.id === job.cut)?.name ?? job.cut : jobScenes(job).join(', ');
      item.append(el(document, 'b', '', `${STEP_LABEL[job.step] ?? job.step}: ${what} `), el(document, 'span', `svs-state svs-state-${job.status}`, JOB_WORDS[job.status] ?? job.status));
      item.append(el(document, 'span', 'svs-lead', ` asked by ${job.by} ${ago(job.createdAt)}`));
      if (job.note) item.append(el(document, 'p', '', job.note));
      if (job.status === 'held' && host) {
        const row = el(document, 'div', 'svs-row');
        row.append(
          button('Let it run', async () => { await api.decideJob(board.id, job.id, true); say('It will run on the Mac.'); await loadJobs(); }, 'svs-btn svs-primary'),
          button('Decline', async () => { await api.decideJob(board.id, job.id, false); say('Declined.'); await loadJobs(); }),
        );
        item.append(row);
      }
      if (job.status === 'running' && job.log?.length) item.append(el(document, 'pre', 'svs-lead', job.log.slice(-3).join('\n')));
      if (job.report) {
        const details = el(document, 'details');
        details.append(el(document, 'summary', '', 'The team\'s report'), el(document, 'div', '', job.report));
        item.append(details);
      }
      list.append(item);
    }
    panel.append(list);
    return panel;
  }

  async function loadJobs() {
    if (!board) return;
    const before = JSON.stringify(jobs);
    try {
      jobs = await api.listJobs(board.id);
    } catch (error) {
      fail(error);
    }
    let finished = false;
    for (const job of jobs) {
      if (isOpen(job)) seenOpen.add(job.id);
      else if (seenOpen.delete(job.id)) finished = true;
    }
    if (finished) board = await api.getBoard(board.id).catch(() => board);
    if (!editingNow() && (finished || JSON.stringify(jobs) !== before)) draw();
  }

  // Every 10 seconds an open board asks again, so another person's changes and the team's pictures arrive.
  async function poll() {
    if (gone) return;
    // Not while the song plays or a card is dragged or a field is being typed in: a redraw would stop them.
    if (board && !editingNow() && !dragging && !playing) {
      try {
        const fresh = await api.getBoard(board.id);
        if (fresh.version !== board.version) {
          board = fresh;
          draw();
        }
        await loadJobs();
      } catch (error) {
        fail(error);
      }
    }
    window?.clearTimeout?.(timer);
    if (!gone) timer = window?.setTimeout?.(poll, every);
  }

  const ready = (initial ? open(initial).catch((error) => { fail(error); return showList(); }) : showList()).then(() => {
    timer = window?.setTimeout?.(poll, every);
  });

  return {
    ready,
    open,
    refresh: () => (board ? open(board.id) : showList()),
    get board() { return board; },
    update() {},
    destroy() {
      gone = true;
      stop();
      window?.clearTimeout?.(timer);
      for (const pending of urls.values()) pending.then((url) => url && window?.URL?.revokeObjectURL?.(url));
      root.remove();
    },
  };
}
