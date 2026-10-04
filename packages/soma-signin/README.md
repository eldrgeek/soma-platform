# @soma/signin

PlayMaker’s config-driven sign-in screen, session provider, and auth helpers — extracted for SOMA app-kit consumers. Pure logic lives in `src/*.js` (no env reads); React surfaces live under `src/react/` for vendoring into Vite apps.

PlayMaker will adopt this package in a follow-up bead; this repo ships the kit only.

## Pure exports

| Export | Role |
|--------|------|
| `inAuthRoundTrip(search, hash)` | True during OAuth / magic-link / recovery hops |
| `safeNext(search)`, `loginHref(path)` | Safe post-login redirect targets |
| `createSomaAuthConfig({ url, anonKey, methods })` | Methods map with PlayMaker defaults |
| `providerMeta(provider)` | OAuth button labels/colors |
| `createSomaKnownDevice({ storageKey, storage })` | First-party “known device” marker (no PII) |

## React (vendored)

| Module | Role |
|--------|------|
| `src/react/SomaAuth.tsx` | Full sign-in UI (magic link, password, OTP, OAuth, recovery) |
| `src/react/AuthProvider.tsx` | Session context + known-device mark |
| `src/react/soma-signin.css` | Neutral layout styles |

Inject `supabase`, `config`, and optional branding (`appName`, `brandMark`, `copy`).

## Example

```tsx
import { createClient } from '@supabase/supabase-js';
import { createSomaAuthConfig } from '@soma/signin';
import { AuthProvider } from '@/lib/soma/signin/react/AuthProvider';
import SomaAuth from '@/lib/soma/signin/react/SomaAuth';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const config = createSomaAuthConfig({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

export function App() {
  return (
    <AuthProvider supabase={supabase}>
      <SomaAuth supabase={supabase} config={config} loginPath="/sign-in" appName="My App" />
    </AuthProvider>
  );
}
```

## Tests

```bash
cd packages/soma-signin && npm test
```
