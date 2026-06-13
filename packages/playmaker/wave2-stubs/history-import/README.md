# F3 — AI History Import Workflow (Wave 2 / W3)

**Owner:** W3 · **Status:** stub · **Spec:** playmaker-v0.1-spec.md §F3

## What goes here

A guided in-browser workflow: "bring your history from another AI into Playmaker." Specifically, import Eric's ChatGPT export into the Playmaker character knowledge base.

## Interface contract (W3 must honor)

```js
// Entry point for the history-import workflow.
// @param {string} targetCharacterId - Which character's knowledge to augment (e.g. 'izzy', 'chatgpt')
// @param {object} options
// @param {string} [options.exportSource='chatgpt'] - Source of the export
// @param {Function} options.onComplete - Called with { importedCount, skippedCount } on success
export function startHistoryImport(targetCharacterId, options) { /* W3 implements */ }
```

## Reusable assets (W3 should check before building)

- `~/Projects/yeshie/sites/chatgpt.com` — Yeshie recipe for ChatGPT export request
- `~/Projects/do-it-once/chat-log-export` — Do-It-Once skill for export
- `~/Projects/second-brain/` — Second-brain import pipeline (Obsidian vault)
- `~/Projects/SOMA/eric/witness-projection-archive/` — **Already parsed**: 124 relevant + 39 borderline conversations from Eric's ChatGPT export. W3 can use this as the seed import — **do not re-parse from scratch**.
- `~/Projects/SOMA/eric/witness-projection-archive/INDEX.md` — Index of the parsed archive

## What's already done

Eric's ChatGPT export was already parsed in Phase 0. 124 conversations are classified as relevant to *Witness Projection* and live in `SOMA/eric/witness-projection-archive/conversations/`. These should be the **first import** — the workflow just needs to ingest them into Izzy's knowledge pack.

## Email-delivery handling

ChatGPT exports are email-delivered. The workflow should handle the "requested but not yet arrived" state by ending at "requested" and letting the email-daemon hook complete it when the export lands at `claude@mike-wolf.com`.

## Open question (for Mike)

Eric's ChatGPT archives URL/Drive location needed to ingest any new exports beyond the already-parsed set. (Spec §Open Q2)
