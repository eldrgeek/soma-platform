/* {{SITE_NAME}} — static knowledge pack for {{PERSONA_NAME}} (soma-guide inference).
 * ---------------------------------------------------------------------------
 * This string is the grounding context sent to the inference endpoint with each
 * question. The engine reads it from window.SiteKnowledge via the Bill config's
 * `knowledge` field, so this file MUST be included BEFORE soma-guide-config.js.
 *
 *   <script src="/js/knowledge.js"></script>          <-- this file
 *   <script src="/js/soma-guide-config.js"></script>  <-- reads window.SiteKnowledge
 *
 * GUIDANCE — what makes a good knowledge pack:
 *   - Keep it factual and current. Bill answers FROM this text; anything not here
 *     either gets deflected by scopeGuard or risks a hallucinated answer.
 *   - Cover the three in-scope domains your scopeGuard.contextNote names:
 *       1. the organization / its offerings, 2. how to use the site, 3. SOMA + Bill.
 *   - Mirror the site map: one short blurb per page so "where do I find X?" works.
 *   - Use plain prose with light headers (LLM-friendly). No HTML, no markdown
 *     tables needed — newlines and CAPS headers are enough.
 *   - Re-generate or hand-edit whenever site content changes meaningfully. If you
 *     pre-generate tour audio, remember narration text is separate (in the config).
 *   - Naming conventions: if the org must always be called X (never an acronym),
 *     say so here AND in scopeGuard.contextNote.
 *
 * PLACEHOLDERS: {{SITE_NAME}}, {{PERSONA_NAME}}, {{SITE_URL}}
 */
window.SiteKnowledge = `
{{SITE_NAME}}
Site: {{SITE_URL}}

ORGANIZATION OVERVIEW:
[One or two paragraphs: who this organization is, what it does, who it serves,
and any naming rules (e.g. "always call it X, never the acronym Y").]

KEY PEOPLE / OFFERINGS:
[List the people, products, programs, or benefits a visitor would ask about,
each with a one-line description Bill can quote.]

SITE SECTIONS:
- Home (index.html): [what it shows]
- [Page] ([page].html): [what it shows / what you can do there]
- [Page] ([page].html): [...]

HOW THINGS WORK:
[Common how-to answers: how to sign in, how to submit a form, where to find the
most-requested items, how access levels work, who to contact.]

WHAT IS SOMA (Shared Orchestration & Memory Architecture):
SOMA is the human + AI collaboration model behind this site. {{PERSONA_NAME}} is
the site's AI guide: it can tell you things, show you around with a live
walkthrough, and do certain reversible tasks for you on the page. Anything
consequential (publishing, deleting, contacting people) {{PERSONA_NAME}} routes
to a human reviewer for approval rather than doing it directly.
`;
