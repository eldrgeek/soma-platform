# @soma/feedback

Client hooks for the **SOMA feedback chip** ([SOMA-APP-STANDARD §8](https://github.com/eldrgeek/soma-platform)): the vendored `soma-feedback.js` widget reads two optional globals on the host page:

| Global | Purpose |
|--------|---------|
| `window.somaFeedbackIdentity` | Auto-fill name/email for signed-in users (fresh on every panel open). |
| `window.somaFeedbackAuthHeader` | `Authorization: Bearer <access_token>` on submit so the app can verify the caller server-side. |

This package installs those hooks against an injected Supabase client — **no env reads, no app imports inside the package**.

## Usage

```js
import { supabase } from './supabase';
import { installSomaFeedbackHooks } from '@soma/feedback';

installSomaFeedbackHooks({ supabase });
```

Or install individually:

```js
import {
  installSomaFeedbackIdentityHook,
  installSomaFeedbackAuthHook,
} from '@soma/feedback';
```

Call once at app startup (before the widget can open). The widget re-invokes the hooks on each open/submit; this package does not cache sessions.

## Widget assets

Same-origin chip UI/CSS lives under `widget/` (synced from PlayMaker’s `public/vendor/soma-feedback/`). The react-app scaffolder copies them to `public/vendor/soma-feedback/` and adds the `<link>` / `<script data-endpoint="…">` tags to `index.html`.

## PlayMaker

PlayMaker still ships its own `src/lib/somaFeedbackIdentity.ts` / `somaFeedbackAuth.ts` today. A follow-up bead will switch PlayMaker to this package; this bead only adds the shared kit and scaffolder wiring.

## Tests

```bash
cd packages/soma-feedback && npm test
```
