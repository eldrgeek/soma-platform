# The Soma app spec

The structured object that sits between the conversation and the build. The Guide's
job is to **fill this in** through dialogue; the build agents' job is to **assemble
an app from it**. Designing it well is the highest-leverage step in the whole
system: the Guide becomes "have a conversation that completes this schema," and the
build team becomes "scaffold a repo + Netlify site + Supabase project from a
completed spec."

It is derived directly from `templates/soma-affordances/INTEGRATION-CHECKLIST.md`
(the placeholders are the fields) plus each affordance's choices in
[AFFORDANCES.md](AFFORDANCES.md).

## Lifecycle

```
conversation (Guide)  →  draft spec  →  human review/refine  →  approved spec
        →  build agents scaffold  →  preview  →  human sign-off  →  live
```

The spec is versioned and carries provenance (a link to the intake transcript), so
any reviewer can see how a choice was made.

## Schema (v0)

```yaml
soma_app:
  # --- identity ---
  name:            "Acme Membership"        # human name
  slug:            "acme"                    # app_id / namespace; lowercase, stable
  description:     "..."                     # one-paragraph purpose (feeds knowledge pack)
  owner:           { name: "...", email: "..." }
  human_manager:   { name: "...", email: "..." }   # human guide/manager alongside the AI guide
  requester_skill: "low"                            # low | medium | high — drives review/autonomy (see BUILD-MODEL)

  # --- build targets (resolved by the build agents; see BUILD-MODEL.md) ---
  targets:
    repo:          "github.com/<org>/acme-soma"   # new repo, one per app
    netlify_site:  "acme-soma"                     # new Netlify site, push-to-rebuild
    supabase:                                      # identity is ALWAYS shared; app data MAY be
      identity_project: "shared-soma"              #   identity → shared SOMA project (soma_profiles)
      app_project:      { ref: "<ref>", shared: false }  # app data → own project, or shared
    delivery:      "embedded"                       # embedded | vendored | iframe (v1: embedded)

  # --- affordances: the menu selection + config ---
  affordances:

    guide:                       # almost always present
      enabled: true
      persona:
        name:    "Bill"
        avatar:  "🏀"
        assistant_id: "acme-bill"
        greeting:      "..."
        short_greeting:"..."
      voice:     { enabled: true,  agent_id: "agent_xxx" }   # ElevenLabs ConvAI
      narration: { enabled: false, tts_proxy_url: null }
      ask:       { enabled: true,  inference_url: "https://..." }
      knowledge_pack:            # the Tell rung — real content
        org: "..."
        sections: [ ... ]
        soma: "..."
      site_map:                  # grounding; auto-mapper can seed this at build time
        - { id: home, label: Home, path: index.html, description: "..." }
      walkthroughs:              # the Show rung — at least one
        - id: site-tour
          label: "Site Tour"
          keywords: [tour, "show me"]
          steps:
            - { target: "nav", label: "Navigation", narration: "...", instruction: "..." }
      scope_guard: { deflect: "...", context_note: "..." }
      actions:                   # the Do rung — risk gate enforced
        - { id: "...", steps: [ ... ] }              # reversible → runs after one confirm
        - { id: "...", risk: "high" }                # high-risk → routed to approval, never auto-run

    auth:
      enabled: true
      roles:   [admin, member]
      admin_emails: ["a@acme.com", "b@acme.com"]
      login_path: "/login.html"

    identity:
      enabled: true
      app_id:  "acme"
      cross_domain_link: false

    intake:
      enabled: true
      observer:        true       # nav + clicks + errors; never input values
      specialist_handoff: true
      routing:         "change_requests_table"   # daemon polls; see SOMA-INTAKE.md

    changelog:
      enabled: true
      publish_agent_email: "claude@acme.com"
      accept_storage_key:  "acme_changelog_accepted"
      admin_home_path:     "/admin.html"

    feedback:
      enabled: true
      owner_email: "owner@acme.com"

    # --- community tier (Room) — confirm requirements from FrontRow/campus source ---
    room:
      enabled: false
      channels: { floor: true, private: ["consigliere"] }
      personas: [ ... ]
      presence: true
      live_av:  true             # LiveKit; false = text presence only

  # --- provenance ---
  meta:
    spec_version: "0.1"
    status: "draft"             # draft | approved | building | preview | live
    intake_transcript: "bill_transcripts/<id>"
```

## Field → requirement resolution

The build agents expand the spec into concrete resources using
[AFFORDANCES.md](AFFORDANCES.md). For each enabled affordance they pull its tables
into `schema.sql`, its env vars into Netlify, its config file into the repo, and its
page includes into the templates — exactly the INTEGRATION-CHECKLIST steps, executed
from the spec instead of by hand.

## Worked example — Legends, re-specified

Legends as if produced by the Guide (it predates the spec; this shows the target
shape):

```yaml
soma_app:
  name: "Legends Membership"
  slug: "legends"
  description: "Membership site for the Legends committee."
  owner: { name: "Greg", email: "..." }
  targets:
    repo: "github.com/eldrgeek/legends-membership"
    netlify_site: "legends-membership-site"   # Netlify ID 47a0da43
    supabase: { project_ref: "<ref>", shared: true }
    delivery: "embedded"
  affordances:
    guide:
      enabled: true
      persona: { name: "Bill", avatar: "🏀", assistant_id: "legends-bill",
                 greeting: "...", short_greeting: "..." }
      voice: { enabled: true, agent_id: "agent_2401ks53q6t8e2drt1h7va3f2c52" }
      walkthroughs: [ { id: site-tour, label: "Site Tour", keywords: [tour, "show me"], steps: [ ... ] } ]
    auth:      { enabled: true, roles: [admin, member] }
    identity:  { enabled: true, app_id: "legends" }
    intake:    { enabled: true, observer: true, specialist_handoff: true }
    changelog: { enabled: true }
    feedback:  { enabled: true }
    room:      { enabled: false }
  meta: { spec_version: "0.1", status: "live" }
```

## Resolved decisions

1. **Supabase.** Identity (`soma_profiles`) is **always** in the shared SOMA project
   so profiles follow a person across apps. App data defaults to its own project but
   `app_project.shared: true` is allowed.
2. **Actions authoring.** The Guide captures **intent** ("users should be able to
   RSVP"); the **build agent** turns intent into a concrete reversible/high-risk
   action in the registry. So `actions` in the spec may be intent strings that the
   scaffolder expands — not hand-authored step lists.
3. **Reviewability scales with the human.** How much of the spec a requester reviews
   depends on `requester_skill`. Low-skill: the team fills and decides; the human
   reacts to what they don't like. High-skill: the human edits the spec directly.

## Still open

- **Room field shape.** Grounded in FrontRow primitives (see AFFORDANCES.md) but the
  unified channel/persona schema is finalized as the Room converges.
