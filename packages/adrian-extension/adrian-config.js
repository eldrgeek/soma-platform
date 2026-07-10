(function (global) {
  'use strict';
  if (global.SomaGuideConfig) return;

  global.SomaGuideConfig = {
    tenantId: 'adrian',
    persona: {
      id: 'adrian',
      name: 'Adrian',
      avatar: 'A',
      greeting: "Hi, I’m Adrian. I can help you make sense of this page.",
      shortGreeting: 'What would you like to know?',
      askGreeting: "Hi, I’m Adrian. Ask me anything about this page."
    },
    siteMap: [],
    walkthroughs: [],
    askFirst: false,
    observe: false,
    onUserMessage: function (text) {
      var title = document.title ? '“' + document.title + '”' : 'this page';
      return 'I received “' + text + '”. I’m ready to help with ' + title + '.';
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
