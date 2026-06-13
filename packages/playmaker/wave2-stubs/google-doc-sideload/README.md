# F5 — Google Doc Sideload (Wave 2 / W4)

**Owner:** W4 · **Status:** stub · **Spec:** playmaker-v0.1-spec.md §F5

## What goes here

An affordance in the Writing Room to upload/download/sideload a complete Google Doc (Eric's full first draft) into the Working Document editor, and write back to Drive. Uses the Drive connector + gdocs-bridge.

## Mount point

The sideload UI should be added to the Writing Room's `#action-bar` as a new icon-button (📎 or 📁) next to the existing Script button. It opens a panel or modal for Drive file selection.

## Interface contract (W4 must honor)

```js
// Load a Google Doc into the Working Document editor.
// @param {string} docId - Google Drive file ID
// @param {Function} onLoad - Called with { title, content: string } on success
// @param {Function} onError - Called with an error message on failure
export async function loadGoogleDoc(docId, onLoad, onError) { /* W4 implements */ }

// Write the current Working Document back to a Google Drive file.
// @param {string} docId - Google Drive file ID
// @param {string} content - Current editor content
// @param {Function} onSaved - Called with { title, updatedAt } on success
// @param {Function} onError - Called with an error message on failure
export async function writeGoogleDoc(docId, content, onSaved, onError) { /* W4 implements */ }
```

## Notes for W4

- The Working Document editor (`#script-editor` in assistant.html) is a plain `<textarea>`. Sideloaded content replaces or appends its value.
- The Netlify function layer (`soma-playwriting/netlify/functions/`) should contain the Drive proxy (Google OAuth token exchange + Drive API call).
- The Google OAuth setup skill (`/google-oauth-setup`) may be useful for wiring the auth flow.
- Eric's first draft of the play is in Google Drive — the file ID will be provided by Mike when available.
