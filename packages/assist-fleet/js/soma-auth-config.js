// SOMA Auth config — safe in client code (anon/public key only).
// Copy this file alongside soma-auth.iife.js when deploying to a new app.
// Do NOT commit service_role keys here.
window.SOMA_AUTH_CONFIG = {
  url: 'https://omfwcodoimjmbrhssvfl.supabase.co',
  anonKey: 'sb_publishable_vi2qDWjozUJ5mi9dwirkLA_rj6UaqLf' // client-safe publishable key (successor to anon), public by design — gitleaks:allow
};
