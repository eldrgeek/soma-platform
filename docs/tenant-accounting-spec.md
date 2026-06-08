# Tenant / App-ID Accounting Spec

## What the client now sends (shipped in task 3)

### Inference requests (VPS /infer/ask)

Every POST body now includes an `app_id` field:

```json
{
  "question": "...",
  "context":  "...",
  "persona":  "Bill",
  "allowWeb": false,
  "app_id":   "legends-bill"
}
```

`app_id` is resolved as: `cfg.tenantId ?? cfg.persona.id ?? cfg.persona.name ?? 'unknown'`

Known values in production:
| Site / persona       | app_id           |
|----------------------|------------------|
| Legends / Bill       | `legends-bill`   |
| Levinese / Proteus   | `proteus`        |
| WEC / Ariadne (ext)  | `Ariadne`        |

To give Ariadne a stable id, add `persona.id: 'ariadne'` to ariadne-config.js (low-risk change, not required for accounting to work — the name fallback is fine).

### TTS proxy requests (el-proxy on bill-talk.netlify.app)

Every TTS GET now includes `&app_id=<value>`:

```
GET /.netlify/functions/el-proxy?action=tts&text=...&agent_id=...&app_id=legends-bill
```

---

## Server-side changes needed (NOT yet implemented)

### 1. VPS inference service (soma-infer or equivalent)

Location: VPS pm2 service, likely `~/soma-infer/` or `~/infer/`

**Change needed:** Log `app_id` in each inference request record.

Minimal implementation — append to a cost ledger file:

```python
# In the request handler for /infer/ask
import json, datetime, os

def log_inference(app_id, question_len, answer_len, model, approx_tokens):
    entry = {
        "ts":     datetime.datetime.utcnow().isoformat(),
        "app_id": app_id or "unknown",
        "q_len":  question_len,
        "a_len":  answer_len,
        "model":  model,
        "tokens": approx_tokens,
    }
    ledger = os.path.expanduser("~/soma-infer/cost-ledger.jsonl")
    with open(ledger, "a") as f:
        f.write(json.dumps(entry) + "\n")
```

Read the `app_id` from the POST body:
```python
body = request.json()
app_id = body.get("app_id", "unknown")
```

### 2. el-proxy Netlify function (bill-talk.netlify.app)

Location: `~/Projects/bill-talk/.netlify/functions/el-proxy.js` (or similar)

**Change needed:** Log `app_id` from the query string.

Netlify functions don't have persistent disk, so logging options are:
a. **Console.log** — visible in Netlify function logs (free tier, 7-day retention)
b. **External write** — POST to a logging endpoint on VPS
c. **Netlify Blobs / KV** — paid add-on

Recommended minimum (option a):

```javascript
// In the el-proxy handler
const appId = event.queryStringParameters.app_id || 'unknown';
const text  = event.queryStringParameters.text   || '';
console.log(JSON.stringify({
  ts:     new Date().toISOString(),
  app_id: appId,
  action: event.queryStringParameters.action,
  chars:  text.length,
}));
```

### 3. Optional: per-tenant budget caps

Once logging is in place, a daily/weekly budget cap per app_id can be
added on the VPS inference service by reading the ledger and rejecting
requests over a threshold.

---

## Rollout checklist

- [x] Client sends `app_id` in inference POST body
- [x] Client sends `app_id` in TTS proxy URL
- [ ] VPS inference service logs `app_id` to cost-ledger.jsonl
- [ ] el-proxy logs `app_id` to Netlify function console
- [ ] (Optional) Ariadne config gets explicit `persona.id: 'ariadne'`
- [ ] (Optional) Levinese config gets `tenantId: 'levinese'` to override `proteus` id

## Key paths

- VPS: `vpsmikewolf.duckdns.org` (SSH via sshpass, see ~/Projects/CLAUDE.md)
- el-proxy: bill-talk.netlify.app — source in `~/Projects/bill-talk/`
- Client source: `~/Projects/soma-platform/packages/soma-guide/soma-guide.js`
- This spec: `~/Projects/soma-platform/docs/tenant-accounting-spec.md`
