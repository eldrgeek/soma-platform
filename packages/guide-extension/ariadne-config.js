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
    greeting: `I'm ${PERSONA_NAME} — ask me anything about this page, or take a tour.`,
    askGreeting: `Ask me anything about this page! I'll answer from what I see here. Or click "Take a tour" to explore the navigation.`,
    shortGreeting: `Hi! I'm ${PERSONA_NAME}. Need help?`,
    tagline: 'Your guide through any unfamiliar page.',
  },

  voiceAgentId: 'agent_2401ks53q6t8e2drt1h7va3f2c52',
  ttsProxyUrl: 'https://bill-talk.netlify.app/.netlify/functions/el-proxy',

  // Public VPS endpoint — works for all users without local soma-infer running.
  // Dev override: set inferenceUrl = 'http://localhost:8131/ask' in console.
  inferenceUrl: 'https://vpsmikewolf.duckdns.org/infer/ask',

  // askFirst: open into conversational ask mode on first load
  askFirst: true,

  siteMap: null,
  walkthroughs: [
    {
      id: 'universal-greeting',
      label: 'Take a tour',
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
