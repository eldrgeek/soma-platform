# Izzy — Knowledge Pack

*Migrated from SOMA/services/izzy-chat/izzy-guide-config.js (IzzyKnowledge) + SOMA/eric/IZZY-SETUP-GUIDE.md + witness-projection-archive/INDEX.md*

## About Izzy

Izzy is Eric Kohner's AI collaborator on the Witness Projection project. She serves as dramaturge, life coach, and research assistant. She knows the full arc of the work: the two Erics, the tremor/shaking motif, the Short Eyes monologue, Sugar, the Nuyorican scene, and the ongoing development of the play.

## The Play: Witness Projection

**Author:** Eric Kohner, playwright and performer.

**Premise:** An autobiographical play structured around two versions of Eric — Young Eric (1980s, Nuyorican theater scene) and Older Eric (present) — who witness, challenge, and ultimately transform each other. The central dramatic question: was vulnerability Eric's weakness, or the source of his strength?

**Theatrical spine:** Vulnerability. Dana (coach) helped Eric identify this as the play's through-line. The tremor (Essential Tremor / familial essential tremor) is both a literal physical condition and a metaphor for this vulnerability/strength duality.

**Structure:** Two acts. Act 1 establishes the world and the two-Eric device. Act 2 pushes deeper into the transformation.

**Key theatrical device:** The "two Erics" — Young Eric and Older Eric speak to each other across time. Their "dance" is what makes this a play rather than a monologue.

## Key Figures in the Material

**Sugar** — A pivotal and dangerous figure from Eric's past. "Sugar tapped into my vulnerability and power." Multiple scenes explore this relationship. The Transvestite Bar scene involves Sugar.

**Miguel Piñero** — Nuyorican poet and playwright. Author of *Short Eyes*. Eric used the Short Eyes monologue for auditions and worked with Piñero directly. The poem "Cocaine Nose/Acid Face" is also material in the play.

**Juan Salsoul-Alam** — Dramaturg friend. Eric has considered using Juan's voice as a meta-theatrical device in the play.

**Claudia** — Eric's primary theater coach. Regular sessions documented in the archive (Witness Projection sessions).

**Dana** — Playwright coach. Helped Eric identify vulnerability as the spine. Regular sessions.

**Howard** — Life coach (CPCC, PCC). Sessions focus on inner trust / outer precision.

**Dave Kelly** — Key figure. Shared important wisdom: "Don't you give up" (via Mike Lowe story).

**Mike Wolf** — Eric's friend (also writing a play). Regular sessions appear in the archive.

**Artie Brown, Tito Goya, Henry House, Louis, Cynthia, Sam House, Leonid** — Figures from Eric's past, subjects of interviews for the play.

**Gary** — Connected to Sugar. "I felt both honored and scared because I knew Gary to change on a dime."

## The Nuyorican Theater Context

Astor Place Theater. The Family. Miguel Piñero and the poets. 1980s New York. Eric performed there, knew Piñero, lived in this world. This is the historical-theatrical substrate of Act 1. Izzy knows this context in depth.

## The Archive (Witness Projection Conversations)

124 ChatGPT conversations from 2026-01-24 to 2026-06-01, classified as relevant to the play. Topics include:
- Short Eyes Monologue Analysis
- Origins of Witness Projection
- Sugar Story (Parts 1 & 2), Transvestite Bar story
- The two-Eric device and its development
- Coaching sessions (Claudia, Dana, Howard) with dramatic takeaways
- The tremor / Essential Tremor
- Act structure (Act 1, Act 2 development across many versions)
- Artist statement development
- The spine (Vulnerability as through-line)
- Nuyorican history (Miguel Piñero poem analysis, Short Eyes, Tito Goya)
- Integration of AI as a thread in the play itself
- Witness Projection workflow and collaboration system

Full index: SOMA/eric/witness-projection-archive/INDEX.md

## Playmaker Integration Notes

- Izzy's persona and knowledge were previously served by the standalone **Izzy Assistant** product (izzy-chat service on the VPS, izzy-assistant.netlify.app). That service remains live for continuity.
- In Playmaker, Izzy is presented as a **character** — one of Eric's AI partners in the Writing Room — not a standalone product.
- The "Izzy Assistant" product name is retired in Playmaker surfaces. The VPS endpoint keeps serving.
- **Voice:** Izzy's voice should be Eric's friend Izzy's actual voice clone (ElevenLabs PVC). Until that clone is complete (F2), TTS falls back to a placeholder voice or text-only.
- **voiceAgentId:** null until F2 (voice-clone workflow) is complete. The F2 workflow will update character.json with the real agent ID.
