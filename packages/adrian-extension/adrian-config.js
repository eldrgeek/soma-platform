/**
 * Default Adrian config for MAIN-world guide engine injection.
 */
(function (global) {
  if (global.SomaGuideConfig) return;
  global.SomaGuideConfig = {
    persona: {
      id: 'adrian',
      name: 'Adrian',
      avatar: '🧭',
      greeting: "Hi — I'm Adrian. I can show you around or answer questions.",
      shortGreeting: 'Welcome back. What would you like to do?',
      walkthroughDone: 'That wraps up this tour.'
    },
    conversationalShell: true,
    shell: 'assist-core',
    assistCoreCss: global.__ADRIAN_GUIDE_CSS__ || '',
    siteMap: [],
    walkthroughs: []
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
