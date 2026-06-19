# Building Soma Apps — knowledge base

The single source of truth for what a Soma app is, the parts it can be made of, how
a new one is specified, and how it gets built. **One knowledge base, two readers:**
the Guide ("Bill") reads it to advise a person building an app, and the build agents
read it to assemble the app. When this doc and the code diverge, the code wins —
update this doc.

> Status: v0 spine (2026-06-19). Solo affordances are grounded in `soma-platform`
> and `legends-membership-site`. The community tier (Room) is grounded in the
> Unified Room model and `FrontRow`; the campus is a branch-deploy off FrontRow and
> is flagged where details still need to be pulled from source.

## What a Soma app is

A Soma app is a **static site + a Supabase backend + a CDN-delivered engine**,
assembled from a fixed menu of reusable **affordances**. Concretely:

- **Hosting:** a Netlify site, one per app, deployed from its own repo. Push to
  rebuild. Serverless logic runs as Netlify Functions.
- **Backend:** a Supabase project (auth, Postgres with row-level security, the
  tables each affordance needs).
- **Engine:** the SOMA-Guide widget (`soma-guide.js`) loaded from the shared CDN
  (`soma-guide.netlify.app`), so every app picks up engine upgrades without a
  re-copy. Everything app-specific is configuration, not engine code.

A Soma app is therefore not written from scratch. It is **composed**: you choose
affordances, configure them, and the build agents wire them into a new site.

## The bounded-menu principle (v1)

In v1 a Soma app is a **selection from a known set of affordances**, each
configured — not arbitrary invented functionality. This is what makes the app
buildable today: the Guide's job is to help a person choose and configure from the
menu, and the build agents' job is to assemble the chosen parts. Open-ended
"invent any feature" is explicitly out of scope for v1.

## The two affordance tiers

| Tier | Scope | What it provides | Source |
|------|-------|------------------|--------|
| **Solo** | 1:1, person ↔ app | Guide/Bill, Auth, Identity, Intake, Change Log, Feedback | `soma-platform/` (live) |
| **Community** | many ↔ many, shared presence | Room (floor + private channels), dyad/consigliere, per-persona public dialogue, live presence | FrontRow + campus (converging) |

See [AFFORDANCES.md](AFFORDANCES.md) for the full catalog.

## How the pieces relate

The app-for-building-Soma-apps is itself a Soma app, and most of its machinery
already exists:

- The **Guide** is the conversational specialist that explains Soma and helps spec
  an app.
- The **Intake** flow is the conversation that produces a structured spec — today
  it produces *change requests* against an existing app; for the meta-app it
  produces an *app spec* (see [APP-SPEC.md](APP-SPEC.md)).
- The **build pipeline** (cc-dispatch + Change Log + Netlify) is the "team of
  specialists" — today it *modifies* one app; for the meta-app it *scaffolds a new
  one* (see [BUILD-MODEL.md](BUILD-MODEL.md)).
- The **Room** is both a community affordance an app can include and the
  observation surface for the build itself (the dark factory's glass wall).

Two kinds of guide run the system. The **AI guide** (Bill) carries the
conversation and does the work; a **human guide/manager** stands alongside it —
owning judgment calls, approvals, and the decisions a low-skilled requester
defers to the team. The build "team" is human-manager + AI specialists together.

## Contents

- [AFFORDANCES.md](AFFORDANCES.md) — the menu: every affordance, its choices,
  requirements, and source files.
- [APP-SPEC.md](APP-SPEC.md) — the structured spec the Guide fills and the agents
  build from, with a worked example.
- [BUILD-MODEL.md](BUILD-MODEL.md) — repo-per-app, dark-factory build, Room-as-glass-wall.

## Related source docs (canonical for their slice)

- `soma-platform/templates/soma-affordances/` — the drop-in kit + INTEGRATION-CHECKLIST.
- `soma-platform/docs/SOMA-INTAKE.md` — Bill as the change membrane.
- `soma-platform/docs/SOMA-DELIVERY.md` — embedded vs vendored vs iframe engine delivery.
- `soma-platform/docs/SOMA-IDENTITY.md` — the two-tier identity/profile model.
- `legends-membership-site/SOMA-GUIDE-README.md` — the reference instance + what's stubbed.
