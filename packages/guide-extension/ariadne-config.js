/**
 * Ariadne — universal SOMA guide persona.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  RENAME HERE: change PERSONA_NAME to give her a new name.  │
 * └─────────────────────────────────────────────────────────────┘
 */
const PERSONA_NAME = 'Ariadne';

window.SomaGuideConfig = {
  persona: {
    name: PERSONA_NAME,
    avatar: '🧵',
    greeting: `I'm ${PERSONA_NAME} — I'll give you the thread through this site.`,
    tagline: 'Your guide through any unfamiliar page.',
  },

  // Reusing bill-talk agent for now.
  // TODO: provision a dedicated Ariadne voice via ElevenLabs and update this.
  voiceAgentId: 'agent_01jwdqzd3rfynvfhhe7bskkywm',
  ttsProxyUrl: 'https://bill-talk.netlify.app/.netlify/functions/el-proxy',

  // No pre-mapped site walkthrough for the universal case.
  // Ariadne greets and offers to help; the richer auto-mapper
  // (porting Yeshie's perceive engine) is a separate follow-up.
  siteMap: null,
  walkthroughs: [
    {
      id: 'universal-greeting',
      label: `Meet ${PERSONA_NAME}`,
      steps: [
        {
          id: 'greet',
          label: 'Welcome',
          target: null,
          narration: `Hi! I'm ${PERSONA_NAME}. I'm here to help you find your way through this page. Click on anything you'd like to explore, or ask me a question.`,
          instruction: `I'll guide you through this site. Let me know where you'd like to go.`,
        },
      ],
    },
  ],
};
