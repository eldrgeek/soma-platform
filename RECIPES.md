# soma-platform RECIPES

## Ask Bill widget is broken (soma-guide 404)

**Symptom:** Clicking "Ask Bill" in nav does nothing. Browser network tab shows
`GET https://soma-guide.netlify.app/soma-guide.js` → 404.

**Diagnostic:**
```bash
curl -I https://soma-guide.netlify.app/soma-guide.js
# Expect 200. If 404, the CDN is not serving dist/.
```

**Fix:**
1. Ensure `~/Projects/soma-platform/netlify.toml` exists with `publish = "dist"`.
2. Ensure `dist/soma-guide.js` and `dist/soma-guide.css` exist and are up to date.
3. Push to the branch Netlify is tracking (typically `main` or the connected branch):
```bash
cd ~/Projects/soma-platform
git push origin fix/ask-bill   # then merge PR
# or if already on main:
git push origin main
```
4. Netlify will auto-deploy. Verify:
```bash
curl -I https://soma-guide.netlify.app/soma-guide.js   # expect 200
```

**Root cause history:** 2026-06-08 — `.netlify/netlify.toml` (local CLI state, not committed)
had publish set to repo root. Repo-tracked `netlify.toml` was missing. Added and fixed on
branch `fix/ask-bill`.

---

## ElevenLabs voice fails / TTS silent

**Symptom:** Widget loads, voice chat errors out, or tour narration is silent.

**Diagnostic:**
```bash
curl "https://bill-talk.netlify.app/.netlify/functions/el-proxy?action=list&agent_id=agent_2401ks53q6t8e2drt1h7va3f2c52"
```
- `{"conversations":[...]}` → proxy and key are fine; problem is elsewhere
- `{"error":"ELEVENLABS_API_KEY not set"}` → add key in Netlify env for bill-talk site
- HTTP 401/403 or error body about invalid key → key expired; rotate in ElevenLabs dashboard and update Netlify env var `ELEVENLABS_API_KEY` on the bill-talk site (siteId: see bill-talk/.netlify/state.json)

---

## Text Q&A ("Ask Bill" chat answers) failing

**Symptom:** Widget loads, voice works, but typed questions return errors.

**Diagnostic:**
```bash
curl -X POST https://vpsmikewolf.duckdns.org/infer/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"test","context":"test"}'
```
- JSON answer → OK
- `{"error":"inference failed","detail":"...credit balance is too low..."}` → Anthropic API key on VPS out of credits; top up at console.anthropic.com or rotate key

**Fix:** SSH to VPS and update the Anthropic API key env var used by the inference service.
```bash
sshpass -p 'magicalaisystem' ssh root@217.77.6.197
# find and update the key in the inference service config / pm2 env
```
