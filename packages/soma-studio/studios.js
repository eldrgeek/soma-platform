// The studios this site serves. A studio is one project's lasting place: its
// chat, agreements, open questions and live app. Membership is by the email a
// person signs in with; hosts may also correct agreements, drop questions and
// start a new session. A change here ships with the next deploy.
//
// `deciders` (default: the hosts) are the people whose own messages make
// agreements (use case UC1-P4); only their "N: answer" lines answer questions.
// `team.brief` is a file under ~/Projects that the team listener on Mike's Mac
// puts in every prompt for this studio. `devHosts`/`devMembers` are the
// made-up identities of `netlify dev` and count only there.
export default {
  'soma-studio': {
    title: 'SOMA Studio',
    purpose: 'Building SOMA Studio itself: the chat, the agreements, the open questions and the live app.',
    appId: 'sunday-supper',
    hosts: ['mw.personalmail@gmail.com', 'mw@mike-wolf.com'],
    members: [],
    devHosts: ['rosa'],
    devMembers: ['theo'],
    team: { brief: 'SOMA/specs/forge-room-brief.md' },
  },
  'coaching-age-of-ai': {
    title: 'Coaching in the Age of AI',
    purpose: "The collateral for Eric Kohner's new business: the offer, the page, the film.",
    appId: null,
    hosts: ['mw.personalmail@gmail.com', 'mw@mike-wolf.com'],
    members: [],
    devHosts: ['rosa'],
    team: { brief: 'business-ops/revenue/coaching-age-of-ai/README.md' },
  },
};
