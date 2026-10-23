/* soma-video video-assets.js: a video script's assets, scene by scene (Puppet v0.6, VideoMaker).
 *
 *   import { mountVideoAssets } from './video-assets.js';
 *   const board = mountVideoAssets(container, { text, listAssets, fetchAsset });
 *   board.update(text);   // redraw from the editor's unsaved text; pictures and the song stay loaded
 *   board.refresh();      // ask for the asset list again
 *
 * For each scene of the script it shows the scene's song times with a button that plays that part of the
 * song, its cards drawn as 16:9 frames, the pictures made for it (with any pieces a picture was cut into),
 * and the lines sung under it. Pictures that name no scene of the script are shown at the end.
 *
 * The assets are the team's files for this script (server/studio.js). listAssets() returns
 * [{ name, type, size, kind?, section?, start?, caption?, prompter?, maker?, parent?, piece? }];
 * fetchAsset(name) returns a Blob. The page fetches with the reader's sign-in, so an <img> or <audio>
 * plays an object URL, never the API address.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-h3i.
 */
import { clock, parseFilm, songTimes } from './film.js';

const STYLE_ID = 'soma-video-assets-style';
const CSS = `
.sva { --sva-ink: #1d2433; --sva-muted: #5d6b82; --sva-line: #d9dfe8; --sva-paper: #fff; --sva-accent: #6b4fa0;
  font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--sva-ink); }
.sva-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 12px; }
.sva-head h2 { margin: 0; font-size: 20px; }
.sva-count { color: var(--sva-muted); font-size: 13px; }
.sva-note { color: var(--sva-muted); font-size: 13px; margin: 0 0 12px; }
.sva-scene { border: 1px solid var(--sva-line); border-radius: 8px; background: var(--sva-paper); margin: 0 0 14px; overflow: hidden; }
.sva-scene-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #eef2f8; border-bottom: 1px solid var(--sva-line); }
.sva-scene-title { font-weight: 600; flex: 1; min-width: 0; }
.sva-time { color: var(--sva-muted); font: 12px/1.4 ui-monospace, Menlo, monospace; white-space: nowrap; }
.sva-play { border: 1px solid var(--sva-accent); color: var(--sva-accent); background: #fff; border-radius: 999px; padding: 3px 12px; font: 600 13px/1.4 system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
.sva-play[aria-pressed="true"] { background: var(--sva-accent); color: #fff; }
.sva-play:disabled { opacity: .45; cursor: default; }
.sva-bar { height: 3px; background: var(--sva-line); }
.sva-bar span { display: block; height: 100%; width: 0; background: var(--sva-accent); }
.sva-body { padding: 10px 12px; display: grid; gap: 10px; }
.sva-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.sva-frame { position: relative; aspect-ratio: 16 / 9; border-radius: 6px; overflow: hidden; background: #0f1420; border: 0; padding: 0; cursor: zoom-in; }
.sva-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sva-frame figcaption, .sva-tag { position: absolute; left: 6px; bottom: 6px; background: rgb(0 0 0 / .6); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.sva-card { aspect-ratio: 16 / 9; border-radius: 6px; background: #141a2a; color: #f5f2ea; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 10px; gap: 4px; position: relative; }
.sva-card b { font: 600 clamp(14px, 2.2vw, 22px)/1.15 Georgia, serif; }
.sva-card small { font-size: 11px; opacity: .8; }
.sva-pieces { display: flex; gap: 4px; margin-top: 4px; }
.sva-pieces .sva-frame { flex: 1; aspect-ratio: auto; height: 54px; cursor: zoom-in; }
.sva-lyrics { margin: 0; padding-left: 8px; border-left: 3px solid var(--sva-accent); font-style: italic; color: #2d3550; font-size: 13px; white-space: pre-line; }
.sva-empty { color: var(--sva-muted); font-size: 13px; }
.sva-video { width: 100%; max-width: 960px; aspect-ratio: 16 / 9; background: #000; border-radius: 6px; }
.sva-box { position: fixed; inset: 0; background: rgb(10 12 20 / .88); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; z-index: 1000; padding: 16px; }
.sva-box img { max-width: 100%; max-height: 80vh; border-radius: 6px; }
.sva-box p { color: #e8e8ee; margin: 0; font-size: 14px; text-align: center; max-width: 900px; }
.sva-box button { background: #fff; border: 0; border-radius: 999px; padding: 6px 16px; font-weight: 600; cursor: pointer; }
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

/** A heading without its song times, in lower case: "VERSE 1 0:14-0:48" is "verse 1". */
export const sectionKey = (heading) => String(heading ?? '').replace(/\s*\d+:\d{2}.*$/, '').trim().toLowerCase();

/** The scenes of a script as the board shows them: heading, song times, cards and sung lines. */
export function boardScenes(text) {
  const scenes = [];
  for (const block of parseFilm(text)) {
    if (block.type === 'scene') scenes.push({ title: block.text, key: sectionKey(block.text), times: songTimes(block.text), cards: [], lyrics: [] });
    const scene = scenes.at(-1);
    if (!scene) continue;
    if (block.type === 'visual' && block.kind === 'CARD') scene.cards.push(block);
    if (block.type === 'lyric') scene.lyrics.push(...block.lines);
  }
  return scenes;
}

/**
 * Which scene each picture belongs to: the scene whose song times hold its `start`, else the first scene
 * whose heading matches its `section`, else none (index -1). Pieces go with their parent picture.
 */
export function placePictures(scenes, assets) {
  const pictures = assets.filter((a) => String(a.type).startsWith('image/') && !a.parent && a.kind !== 'render');
  return pictures.map((picture) => {
    let index = -1;
    if (typeof picture.start === 'number') index = scenes.findIndex((s) => s.times && picture.start >= s.times.start && picture.start < s.times.end);
    if (index < 0 && picture.section) index = scenes.findIndex((s) => s.key === sectionKey(picture.section));
    return { picture, index, pieces: assets.filter((a) => a.parent === picture.name).sort((a, b) => String(a.name).localeCompare(String(b.name))) };
  });
}

// Loaded files by cacheKey (the page passes the row id), kept across redraws of the page so a save or
// a new job does not fetch every picture again.
const LOADED = new Map();

export function mountVideoAssets(container, { text, listAssets, fetchAsset, cacheKey = '', document = container.ownerDocument, window = document.defaultView }) {
  installStyle(document);
  const root = el(document, 'div', 'sva');
  container.append(root);
  if (!LOADED.has(cacheKey)) LOADED.set(cacheKey, new Map());
  const urls = LOADED.get(cacheKey);
  let assets = [];
  let source = text;
  let audio = null;
  let playing = null;
  let loadError = '';

  const urlOf = async (name) => {
    const key = `${name}@${assets.find((a) => a.name === name)?.updatedAt ?? ''}`;
    if (!urls.has(key)) {
      const pending = fetchAsset(name).then((blob) => window?.URL?.createObjectURL?.(blob) ?? '');
      pending.catch(() => urls.delete(key));
      urls.set(key, pending);
    }
    return urls.get(key);
  };
  const song = () => assets.find((a) => a.kind === 'song') ?? assets.find((a) => String(a.type).startsWith('audio/'));

  function showLarge(asset) {
    const box = el(document, 'div', 'sva-box');
    box.setAttribute?.('role', 'dialog');
    const img = el(document, 'img');
    img.alt = asset.caption || asset.name;
    urlOf(asset.name).then((url) => { img.src = url; });
    const credit = [asset.caption, asset.prompter && `written by ${asset.prompter}`, asset.maker && `drawn by ${asset.maker}`].filter(Boolean).join(' · ');
    const close = el(document, 'button', '', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => box.remove());
    box.addEventListener('click', (event) => { if (event.target === box) box.remove(); });
    box.append(img, el(document, 'p', '', credit || asset.name), close);
    document.body.append(box);
  }

  function frame(asset, label) {
    const button = el(document, 'button', 'sva-frame');
    button.type = 'button';
    button.title = asset.caption || asset.name;
    const img = el(document, 'img');
    img.alt = asset.caption || asset.name;
    img.loading = 'lazy';
    urlOf(asset.name).then((url) => { img.src = url; }).catch(() => { button.title = `Could not load ${asset.name}`; });
    button.append(img);
    if (label) button.append(el(document, 'span', 'sva-tag', label));
    button.addEventListener('click', () => showLarge(asset));
    return button;
  }

  function card(block) {
    const box = el(document, 'div', 'sva-card');
    const lines = block.body.length ? block.body : [block.args];
    for (const line of lines) {
      if (line.startsWith('#')) box.append(el(document, 'b', '', line.replace(/^#+\s*/, '')));
      else if (line.trim()) box.append(el(document, 'small', '', line));
    }
    box.append(el(document, 'span', 'sva-tag', `CARD ${block.args}`.trim()));
    return box;
  }

  function stop() {
    if (audio) audio.pause();
    if (playing) {
      playing.button.setAttribute('aria-pressed', 'false');
      playing.button.textContent = '▶ Play';
      playing.bar.style.width = '0';
    }
    playing = null;
  }

  async function play(times, button, bar) {
    if (playing?.button === button) return stop();
    stop();
    const track = song();
    if (!track) return;
    if (!audio) {
      audio = new window.Audio();
      audio.addEventListener('timeupdate', () => {
        if (!playing) return;
        const { start, end } = playing.times;
        playing.bar.style.width = `${Math.min(100, Math.max(0, ((audio.currentTime - start) / (end - start)) * 100))}%`;
        if (audio.currentTime >= end) stop();
      });
    }
    button.textContent = 'Loading…';
    const url = await urlOf(track.name);
    if (audio.src !== url) audio.src = url;
    playing = { times, button, bar };
    button.setAttribute('aria-pressed', 'true');
    button.textContent = '■ Stop';
    audio.currentTime = times.start;
    await audio.play().catch(() => stop());
  }

  function draw() {
    stop();
    root.replaceChildren();
    const scenes = boardScenes(source);
    const placed = placePictures(scenes, assets);
    const pictures = placed.length;
    const head = el(document, 'div', 'sva-head');
    head.append(el(document, 'h2', '', 'Assets'));
    const track = song();
    head.append(el(document, 'span', 'sva-count', [`${pictures} picture${pictures === 1 ? '' : 's'}`, `${assets.filter((a) => a.parent).length} pieces`, track ? 'song loaded' : 'no song yet'].join(' · ')));
    root.append(head);
    if (loadError) root.append(el(document, 'p', 'sva-note', loadError));
    if (!track) root.append(el(document, 'p', 'sva-note', 'The song plays here once the team sends it (Make it → Send the assets).'));

    // The last render: its small preview (loaded only when asked, it is a few MB) and its check sheet.
    const renders = assets.filter((a) => a.kind === 'render');
    if (renders.length) {
      const section = el(document, 'section', 'sva-scene sva-render');
      const top = el(document, 'div', 'sva-scene-head');
      top.append(el(document, 'span', 'sva-scene-title', 'Latest render'));
      const body = el(document, 'div', 'sva-body');
      const video = renders.find((a) => String(a.type).startsWith('video/'));
      if (video) {
        const watch = el(document, 'button', 'sva-play', '▶ Watch the preview');
        watch.type = 'button';
        top.append(watch);
        watch.addEventListener('click', async () => {
          watch.disabled = true;
          watch.textContent = 'Loading…';
          const player = el(document, 'video', 'sva-video');
          player.controls = true;
          player.src = await urlOf(video.name);
          body.prepend(player);
          watch.remove();
          await player.play?.()?.catch?.(() => {});
        });
      }
      const sheets = renders.filter((a) => String(a.type).startsWith('image/'));
      if (sheets.length) {
        const strip = el(document, 'div', 'sva-strip');
        for (const sheet of sheets) strip.append(frame(sheet, 'check sheet'));
        body.append(strip);
      }
      body.append(el(document, 'p', 'sva-empty', [video?.caption, video?.updatedAt && `sent ${String(video.updatedAt).slice(0, 16).replace('T', ' ')} UTC`].filter(Boolean).join(' · ') || 'The render\'s check sheet.'));
      section.append(top, body);
      root.append(section);
    }

    scenes.forEach((scene, index) => {
      const section = el(document, 'section', 'sva-scene');
      const top = el(document, 'div', 'sva-scene-head');
      top.append(el(document, 'span', 'sva-scene-title', scene.title.replace(/\s*\d+:\d{2}.*$/, '')));
      if (scene.times) top.append(el(document, 'span', 'sva-time', `${clock(scene.times.start)}–${clock(scene.times.end)}`));
      const button = el(document, 'button', 'sva-play', '▶ Play');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.disabled = !scene.times || !track;
      top.append(button);
      const bar = el(document, 'div', 'sva-bar');
      const fill = el(document, 'span');
      bar.append(fill);
      if (scene.times) button.addEventListener('click', () => play(scene.times, button, fill));
      const body = el(document, 'div', 'sva-body');
      const strip = el(document, 'div', 'sva-strip');
      for (const block of scene.cards) strip.append(card(block));
      for (const { picture, pieces } of placed.filter((p) => p.index === index)) {
        const cell = el(document, 'div');
        cell.append(frame(picture, picture.name.replace(/\.\w+$/, '')));
        if (pieces.length) {
          const row = el(document, 'div', 'sva-pieces');
          pieces.forEach((piece, n) => row.append(frame(piece, String(n + 1))));
          cell.append(row);
        }
        strip.append(cell);
      }
      if (strip.children.length) body.append(strip);
      else body.append(el(document, 'p', 'sva-empty', 'No cards or pictures for this scene yet.'));
      if (scene.lyrics.length) body.append(el(document, 'p', 'sva-lyrics', scene.lyrics.join('\n')));
      section.append(top, bar, body);
      root.append(section);
    });

    const loose = placed.filter((p) => p.index < 0);
    if (loose.length) {
      const section = el(document, 'section', 'sva-scene');
      const top = el(document, 'div', 'sva-scene-head');
      top.append(el(document, 'span', 'sva-scene-title', 'Pictures not placed in a scene'));
      const strip = el(document, 'div', 'sva-strip');
      for (const { picture, pieces } of loose) {
        const cell = el(document, 'div');
        cell.append(frame(picture, picture.section || picture.name));
        if (pieces.length) {
          const row = el(document, 'div', 'sva-pieces');
          pieces.forEach((piece, n) => row.append(frame(piece, String(n + 1))));
          cell.append(row);
        }
        strip.append(cell);
      }
      const body = el(document, 'div', 'sva-body');
      body.append(strip);
      section.append(top, body);
      root.append(section);
    }
  }

  async function refresh() {
    try {
      assets = await listAssets();
      loadError = '';
    } catch (error) {
      loadError = `Could not load the assets: ${error?.message ?? error}`;
    }
    draw();
  }

  draw();
  const ready = refresh();
  return {
    ready,
    refresh,
    update(next) {
      source = next;
      draw();
    },
    destroy() {
      stop();
      root.remove();
    },
  };
}
