// soma-play's Google Doc part: PlayMaker's own Doc reading and conversion, unchanged.
// Bundled by scripts/bundle-playmaker.mjs from PlayMaker's source (eldrgeek/playmaker),
// into src/playmaker/doc.js.
//
// - getDriveToken, pickGoogleDoc, exportDocAsHtml: Google sign-in (Google Identity Services,
//   drive.file scope, the token kept in memory for its hour), the Google Picker, and the Drive
//   export of the chosen Doc as HTML. All in the browser; no secret and no server.
// - importGoogleDocHtml: the Doc's HTML to PlayMaker's Fountain, the same normalizer a Word paste
//   goes through, so a Doc read here becomes the same script PlayMaker would make.
// The Google client id and API key are read from globalThis.__SOMA_GOOGLE_CLIENT_ID__ and
// globalThis.__SOMA_GOOGLE_API_KEY__ (set by the page from the site's public config) instead of
// PlayMaker's build-time VITE_ values.
export { exportDocAsHtml, getDriveToken, googleDocsConfigured, pickGoogleDoc } from '@/lib/googleDocs';
export { importGoogleDocHtml, translateGoogleFailure } from '@/lib/driveImport';
