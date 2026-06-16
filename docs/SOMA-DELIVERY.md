# SOMA-Guide delivery modes (Bill's body)

How the engine is delivered to a host site. We run **embedded** today; the engine
is built so switching to **iframe** later is a swap, not a rewrite.

## The three modes

| Mode | What it is | Always-latest? | Show/Do reach | Isolation | Anon cross-site identity |
|------|-----------|----------------|---------------|-----------|--------------------------|
| **Embedded CDN** (default, today) | `<script src=".../soma-guide.js">` runs in the host DOM | Yes — picks up the CDN on next load | Direct (native DOM) | No (shares host DOM/CSS) | No |
| **Vendored** | Site copies `soma-guide.js` locally, pins a version | No — site updates on its own schedule | Direct | No | No |
| **Iframe + host shim** | Brain/UI run in an `<iframe>` on a SOMA origin; a tiny host shim is the hands | Yes | Via postMessage → shim | Yes | **Yes** (first-party storage on the SOMA origin) |

"Always 100% up-to-date" is already true for embedded CDN — that's how Legends gets
new capabilities without touching the site. The reason to reach for **iframe** is
**isolation** + **anonymous cross-site identity** (no third-party cookies), at the
cost of needing a host shim because a cross-origin iframe cannot touch the host DOM.

## Brain / hands split (the seam)

All reach into the host page goes through one object — the **host adapter**
(`this._host` in `soma-guide.js`). Engine logic never touches `document` for host
elements directly; it calls the adapter. Today the adapter is direct-DOM
(`_makeEmbeddedHost`). Iframe delivery provides an adapter with the **same methods**
backed by postMessage to a host shim.

Host adapter contract:

```
find(sel)            -> element handle | null
exists(sel)          -> bool
rect(sel)            -> {top,left,width,height} | null   (for cursor/highlight placement)
click(sel)           -> bool
setValue(sel, val)   -> bool                              (fill inputs / selects)
scrollIntoView(sel)  -> void
highlight(sel)       -> void                              (host renders the highlight)
clearHighlight()     -> void
```

Override per site/build via `cfg.host` (defaults to the embedded adapter).

## To add the iframe mode later

1. **Host shim** (`soma-guide-shim.js`, ~small): the only thing embedded in the host.
   Listens for postMessage commands (find/click/setValue/rect/scrollIntoView/
   highlight/clearHighlight), executes on the host DOM, renders highlight + demo
   cursor host-side, posts results back.
2. **Iframe host adapter**: implements the contract above by messaging the shim;
   pass it as `cfg.host`. Engine logic is unchanged.
3. **Identity**: the iframe is first-party to the SOMA origin → use its storage for
   the anonymous cross-site id, complementing the account-keyed `soma_profiles`.
4. **Remaining migration**: the walkthrough engine (cursor/highlight/demo-click) still
   reads the host DOM directly in places; route those through `this._host` too. The
   Do executor (`_runAction`) already goes through the adapter.
