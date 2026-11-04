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
| `SOMA_OAUTH_PROVIDERS`, `orderProviders(list)` | SOMA's providers in display order (Google first, then Facebook, LinkedIn, Microsoft, Apple, GitHub) |
| `fetchAuthSettings({ url, anonKey })`, `enabledProviders(wanted, settings)` | Ask Supabase which providers are switched on; keep only those |
| `providerOAuthOptions(provider)` | Extra `signInWithOAuth` options (Microsoft needs the `email` scope) |
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

## Sign-in providers

`SomaAuth` shows one "Sign in with …" button per provider, each with the provider's official mark and colors (`src/react/ProviderMarks.tsx`), Google first. By default an app asks for every SOMA provider, and the screen keeps only those that the Supabase project's public `/auth/v1/settings` reports enabled. Switching a provider on in Supabase therefore adds its button to every app with no deploy. If the settings check fails, only Google is shown. Pass `methods.oauth` to narrow the list for one app.

### Google through the SOMA sign-in hub

Pass `googleHub` (the soma-auth-relay base URL) to `createSomaAuthConfig`. The Google button then goes to `<hub>/google?to=<this sign-in page>`. The hub checks the app against the SOMA allow-list, signs in with Google (Google's picker shows the hub's address, not `<project>.supabase.co`), exchanges the ID token with Supabase, and returns here with the session in the URL fragment. `SomaAuth` picks it up with `setSession` and clears the fragment. Errors come back as `?error_description=` and are shown inline. The app's origin must be in `auth_redirect_allow`; nothing is needed on the Google client per app (Google allows only 10 domains on an unverified client). Without `googleHub`, Google uses the normal Supabase redirect.

Live check of the shared project: `SUPABASE_ANON_KEY=… node scripts/probe-providers.mjs` reports each provider's enabled flag and whether `/auth/v1/authorize?provider=X` returns a 302 to that provider.

The auth relay (`soma-auth-relay`) needs no change for new providers: the provider is picked at Supabase's `/authorize`, and the relay only validates `?to=` and forwards Supabase's `?code=`/`?error=` and the fragment unchanged.

## Tests

```bash
cd packages/soma-signin && npm test
```
