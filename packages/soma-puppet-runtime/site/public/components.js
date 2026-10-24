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
  return {
    key: `${play.base} ${video.base}`,
    notices: [play.notice, video.notice].filter(Boolean),
    mountPlayView: playView.mountPlayView,
    mountStageRead: stageRead.mountStageRead,
    mountVideoView: videoView.mountVideoView,
    mountVideoRead: videoRead.mountVideoRead,
    mountVideoAssets: videoAssets.mountVideoAssets,
    mountVideoJobs: videoJobs.mountVideoJobs,
    mountStoryboards: storyboards.mountStoryboards,
  };
}
