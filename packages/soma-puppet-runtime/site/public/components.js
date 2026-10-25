// Where the page loads each shared component from. An app's description may
// pin a published build (`uses soma-video@<hash>`); the page then loads
// /vendor/soma-video@<hash>/, which never changes. Without a pin it loads
// /vendor/soma-video/, the latest. A pin the store does not have falls back to
// the latest and says so, rather than leaving the app without its components.
// The list of builds is /vendor/manifest.json (scripts/vendor-store.mjs).

export function componentBase(pkg, uses = {}, manifest = {}) {
  const hash = uses[pkg];
  if (!hash) return { base: `/vendor/${pkg}/` };
  if (!manifest[pkg]?.versions?.[hash]) {
    return { base: `/vendor/${pkg}/`, notice: `${pkg}@${hash} is not published; using the latest ${pkg}` };
  }
  return { base: `/vendor/${pkg}@${hash}/` };
}

// The modules the page draws with, from the pinned or latest builds.
// `importer` is `(url) => import(url)` in the page; tests pass their own.
export async function loadComponents(uses, manifest, importer) {
  const play = componentBase('soma-play', uses, manifest);
  const video = componentBase('soma-video', uses, manifest);
  const at = (where, file) => importer(`${where.base}${file}`);
  const [playView, stageRead, videoView, videoRead, videoAssets, videoJobs, storyboards] = await Promise.all([
    at(play, 'play-view.js'),
    at(play, 'stage-read.js'),
    at(video, 'video-view.js'),
    at(video, 'video-read.js'),
    at(video, 'video-assets.js'),
    at(video, 'video-jobs.js'),
    at(video, 'video-storyboard.js'),
  ]);
  // Run lines (v0.8) is newer than the first published soma-play build, so an app pinned to that build
  // has no line-run.js; it gets every other component, and its line-run says it is not available.
  const lineRun = await at(play, 'line-run.js').catch(() => ({}));
  // The evidence ledger (v0.9) is likewise newer than the first published soma-video build.
  const evidence = await at(video, 'evidence.js').catch(() => ({}));
  // The Google Doc import and the PDF print (v0.10) are newer than every earlier soma-play build.
  const docImport = await at(play, 'doc-import.js').catch(() => ({}));
  const playPrint = await at(play, 'play-print.js').catch(() => ({}));
  return {
    key: `${play.base} ${video.base}`,
    notices: [play.notice, video.notice].filter(Boolean),
    mountPlayView: playView.mountPlayView,
    mountStageRead: stageRead.mountStageRead,
    mountLineRun: lineRun.mountLineRun,
    mountDocImport: docImport.mountDocImport,
    mountPlayPrint: playPrint.mountPlayPrint,
    mountVideoView: videoView.mountVideoView,
    mountVideoEvidence: evidence.mountVideoEvidence,
    mountVideoRead: videoRead.mountVideoRead,
    mountVideoAssets: videoAssets.mountVideoAssets,
    mountVideoJobs: videoJobs.mountVideoJobs,
    mountStoryboards: storyboards.mountStoryboards,
  };
}

// The description with one component's pin changed: `hash` pins that build,
// null removes the pin so the app follows the latest. The pin goes right after
// the `puppet` line, or replaces the one already there. The host proposes the
// result, and it is live only once approved, like any other change.
export function withPin(source, pkg, hash) {
  const lines = source.replace(/\r/g, '').split('\n');
  const pinLine = (line) => new RegExp(`^uses\\s+${pkg}@`).test(line.trim());
  const at = lines.findIndex(pinLine);
  const kept = lines.filter((line) => !pinLine(line));
  if (hash) {
    const where = at >= 0 ? at : kept.findIndex((line) => /^puppet\s/.test(line.trim())) + 1;
    kept.splice(where, 0, `uses ${pkg}@${hash}`);
  }
  return kept.join('\n');
}
