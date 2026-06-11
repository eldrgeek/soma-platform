# soma-edit

In-place editable canonical content + frictionless visitor feedback. A SOMA-site primitive.

## What it does

- **Owner editing**: elements marked `data-soma-editable="key"` become click-to-edit for the site owner. Edits persist server-side (Netlify Blobs via `soma-content` function) and are served as canonical content to all visitors on next load.
- **Visitor feedback**: a "Suggest a change" FAB appears for non-owners. Posts to your feedback endpoint in the same schema soma-guide.js uses.
- **Versioned**: each PUT keeps the last 10 prior versions for rollback (read them via GET with `?versions=true`).

## Adoption — 3 steps

### 1. Add scripts in `<head>`

```html
<!-- Owner gate (must come first) -->
<script src="https://soma-guide.netlify.app/soma-owner.js"></script>

<!-- Config (before soma-edit.js) -->
<script>
  window.SomaEditConfig = {
    siteId: 'my-site',                         // required — unique per site
    feedbackUrl: 'https://…/api/feedback',     // optional — omit to disable FAB
    feedbackLabel: 'Suggest a change',         // optional — FAB label
    // contentStoreUrl: '...',                 // optional — override store API
  };
</script>

<!-- Edit engine -->
<script src="https://soma-guide.netlify.app/soma-edit.js"></script>
```

### 2. Mark editable elements

```html
<h1 data-soma-editable="hero-headline">Default headline shown until store loads</h1>
<p  data-soma-editable="hero-body">Default body copy.</p>
```

The attribute value is the content key. Each key is scoped to your `siteId`.

### 3. Set env var in Netlify

In the **soma-guide Netlify site** environment settings, add:

```
SOMA_OWNER_SECRET = <your SOMA_OWNER_SECRET value from .env>
```

This is how the content store API verifies write requests.

## Owner flow

1. Activate owner mode: visit `?soma_owner_key=<OWNER_SECRET>` (same as always).
2. Editable elements show a dashed amber outline + "✏ click to edit" hint on hover.
3. Click → edit inline → **Save changes** button (or `Cmd/Ctrl+Enter`).
4. **Cancel** (or `Escape`) discards changes.
5. On save, the new content is stored and served to all visitors immediately.

## Visitor flow

A "✏ Suggest a change" button appears in the bottom-right. Clicking opens a modal with a textarea. On submit, the suggestion is POSTed to `feedbackUrl`:

```json
{
  "type": "feature",
  "description": "<user text>",
  "member_name": null,
  "page_context": "<current URL>",
  "assistant_id": "<siteId>"
}
```

This matches the soma-guide.js feedback schema, so any endpoint that handles soma-guide feedback already handles soma-edit feedback.

## Content store API

Hosted at `https://soma-guide.netlify.app/.netlify/functions/soma-content`.

```
GET  ?site=<siteId>&key=<contentKey>
     → { content: "<html string> | null", versionCount: <n> }

PUT  { site, key, content, token }
     → { ok: true }  |  { error: "..." }
     token = localStorage.getItem('soma_owner')  (SHA-256 of SOMA_OWNER_SECRET)
```

## Source

`packages/soma-edit/soma-edit.js` → built to `dist/soma-edit.js` (currently identical — no build step).
