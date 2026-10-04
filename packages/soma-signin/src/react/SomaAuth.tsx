import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { safeNext } from '../safeNext.js';
import { providerMeta } from '../somaAuthConfig.js';
import type { SomaAuthConfig, SomaAuthMethods } from '../somaAuthConfig.js';
import './soma-signin.css';

// ─────────────────────────────────────────────────────────────────────────────
// SomaAuth — React port of the Legends SOMA Auth component (soma-auth.js +
// login.html). Config-driven: it renders only the methods enabled in
// SOMA_AUTH_CONFIG.methods, and degrades gracefully (inline error, no crash) if
// an enabled method's Supabase backend isn't configured yet.
//
// Uses Playmaker's existing shared `supabase` client (one client only). All
// sign-ins converge on the same Supabase JWT session that AuthProvider listens
// to, so RequireAuth keeps working unchanged regardless of how the user signs in.
//
// Layout: the canvas "Coming in" board (docs/canvas/ComingIn.dc.html).
// ─────────────────────────────────────────────────────────────────────────────

export interface SomaAuthCopy {
  wordmark: string;
  guideCue: string;
  aiDisclosure: string;
  signInTitle: string;
  signUpTitle: string;
  subtitle: string;
  noMethods: string;
  whatAlreadyHave: string;
  knownEmail: string;
  knownPhone: string;
  oauthContinueOne: string;
  oauthContinueMany: string;
  magicLinkCta: string;
  magicSentTitle: string;
  magicSentBody: string;
  magicSentBack: string;
  signupConfirmTitle: string;
  signupConfirmBody: string;
  signupConfirmCta: string;
  recoveryTitle: string;
  newPasswordLabel: string;
  savingPassword: string;
  savePassword: string;
  otherWaysIn: string;
  finePrintLead: string;
  invitationOnly: string;
  notAskedTitle: string;
  notAsked: string[];
  notAskedFooter: string;
}

export const DEFAULT_SOMA_AUTH_COPY: SomaAuthCopy = {
  wordmark: 'SOMA',
  guideCue: 'Sign in',
  aiDisclosure: 'AI-assisted',
  signInTitle: 'Sign in',
  signUpTitle: 'Create account',
  subtitle: 'Choose how you want to continue.',
  noMethods: 'No sign-in methods are enabled.',
  whatAlreadyHave: 'What we already have',
  knownEmail: 'Email',
  knownPhone: 'Phone',
  oauthContinueOne: 'Continue with {provider}',
  oauthContinueMany: 'Continue with a provider',
  magicLinkCta: 'Email me a sign-in link',
  magicSentTitle: 'Check your email',
  magicSentBody: 'We sent a sign-in link to {email}.',
  magicSentBack: 'Use a different email',
  signupConfirmTitle: 'Confirm your email',
  signupConfirmBody: 'We sent a confirmation link to {email}.',
  signupConfirmCta: 'Back to sign in',
  recoveryTitle: 'Set a new password',
  newPasswordLabel: 'New password',
  savingPassword: 'Saving…',
  savePassword: 'Save password',
  otherWaysIn: 'Other ways in',
  finePrintLead: 'By continuing you agree to the terms of this app.',
  invitationOnly: '',
  notAskedTitle: 'We never ask for',
  notAsked: ['Your password over chat', 'Payment details in a link'],
  notAskedFooter: 'If something feels off, stop and ask your host.',
};

export interface SomaAuthProps {
  supabase: SupabaseClient;
  config: SomaAuthConfig;
  loginPath?: string;
  appName?: string;
  copy?: Partial<SomaAuthCopy>;
  brandMark?: ReactNode;
  className?: string;
}

function mergeCopy(partial?: Partial<SomaAuthCopy>): SomaAuthCopy {
  return { ...DEFAULT_SOMA_AUTH_COPY, ...partial, notAsked: partial?.notAsked ?? DEFAULT_SOMA_AUTH_COPY.notAsked };
}

type Status = { kind: 'idle' | 'error' | 'success'; msg?: string };

function oauthPrimaryLabel(providers: string[], copy: SomaAuthCopy): string {
  if (providers.length === 1) {
    return copy.oauthContinueOne.replace('{provider}', providerMeta(providers[0]).label);
  }
  return copy.oauthContinueMany;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5C5445" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18 M3 12h18" />
    </svg>
  );
}

function NotAskedPanel({ copy }: { copy: SomaAuthCopy }) {
  return (
    <aside className="soma-signin-side" aria-labelledby="coming-in-not-asked">
      <span id="coming-in-not-asked" className="soma-signin-side-title">{copy.notAskedTitle}</span>
      {copy.notAsked.map((text) => (
        <div key={text} className="soma-signin-side-row">
          <XIcon />
          <span>{text}</span>
        </div>
      ))}
      <p className="soma-signin-side-foot">{copy.notAskedFooter}</p>
    </aside>
  );
}

function ComingInPage({
  children,
  copy,
  className,
}: {
  children: React.ReactNode;
  copy: SomaAuthCopy;
  className?: string;
}) {
  return (
    <div className={className ? `soma-signin-ground ${className}` : 'soma-signin-ground'}>
      <div className="soma-signin">
        <div className="soma-signin-stack">{children}</div>
        <NotAskedPanel copy={copy} />
      </div>
    </div>
  );
}

function ComingInBrand({ brandMark, wordmark }: { brandMark?: ReactNode; wordmark: string }) {
  return (
    <header className="soma-signin-brand">
      {brandMark ?? <span className="soma-signin-mark" aria-hidden="true">{wordmark.charAt(0)}</span>}
      <span className="soma-signin-wordmark">{wordmark}</span>
    </header>
  );
}

export default function SomaAuth({
  supabase,
  config,
  loginPath = '/sign-in',
  appName,
  copy: copyPartial,
  brandMark,
  className,
}: SomaAuthProps) {
  const ci = mergeCopy(copyPartial);
  const methods: SomaAuthMethods = config.methods;
  const brandWordmark = appName ?? ci.wordmark;

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const loginRedirect = `${appOrigin}${loginPath}`;
  function loginRedirectTo(next: string | null): string {
    return next ? `${loginRedirect}?next=${encodeURIComponent(next)}` : loginRedirect;
  }
  const recoveryRedirect = `${appOrigin}${loginPath}?recovery=1`;

  const navigate = useNavigate();
  const location = useLocation();
  const next = safeNext(location.search);
  const landing = next ?? '/';
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const carried = (location.state as { identity?: unknown } | null)?.identity;
  const identity = typeof carried === 'string' ? carried.trim() : '';
  const carriedEmail = identity.includes('@') ? identity : '';
  const carriedPhone =
    !carriedEmail && /^\+?[\d\s().-]{7,}$/.test(identity) ? identity : '';

  const [email, setEmail] = useState(carriedEmail);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [phone, setPhone] = useState(carriedPhone);
  const [otpCode, setOtpCode] = useState('');

  const [mode, setMode] = useState<'signin' | 'signup'>(() =>
    location.pathname === '/signup' ? 'signup' : 'signin',
  );
  const [magicSent, setMagicSent] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [signupNeedsConfirm, setSignupNeedsConfirm] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [oauthPickerOpen, setOauthPickerOpen] = useState(false);
  const [magicLinkNeedsEmail, setMagicLinkNeedsEmail] = useState(false);

  const knownRows = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    if (carriedEmail) rows.push({ label: ci.knownEmail, value: carriedEmail });
    if (carriedPhone) rows.push({ label: ci.knownPhone, value: carriedPhone });
    return rows;
  }, [carriedEmail, carriedPhone]);

  const pageTitle = mode === 'signup' ? ci.signUpTitle : ci.signInTitle;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('recovery') === '1') {
      setRecovery(true);
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function reset() {
    setStatus({ kind: 'idle' });
  }
  function fail(error: { message: string } | null, fallback = 'Something went wrong.') {
    setStatus({ kind: 'error', msg: error?.message ?? fallback });
  }

  async function sendMagicLink(e?: FormEvent) {
    e?.preventDefault();
    reset();
    const target = email.trim();
    if (!target) {
      setMagicLinkNeedsEmail(true);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: { emailRedirectTo: loginRedirectTo(next) },
    });
    setBusy(false);
    if (error) return fail(error);
    setMagicSent(true);
  }

  async function sendEmailOtp(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (error) return fail(error);
    setEmailOtpSent(true);
  }
  async function verifyEmailOtp(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' });
    setBusy(false);
    if (error) return fail(error);
    navigate(landing);
  }

  async function signInPassword(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return fail(error);
    navigate(landing);
  }
  async function signUpPassword(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: loginRedirectTo(next),
        data: {
          display_name: displayName.trim(),
          studio_name: studioName.trim() || `${displayName.trim() || 'My'} Studio`,
        },
      },
    });
    setBusy(false);
    if (error) return fail(error);
    if (!data.session) {
      setSignupNeedsConfirm(true);
      return;
    }
    navigate(landing);
  }
  async function sendReset(e: FormEvent) {
    e.preventDefault();
    reset();
    if (!email) return fail(null, 'Enter your email above first.');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirect,
    });
    setBusy(false);
    if (error) return fail(error);
    setStatus({ kind: 'success', msg: `Password-reset link sent to ${email}.` });
  }
  async function setNewPassword(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return fail(error);
    setRecovery(false);
    navigate(landing);
  }

  async function sendPhoneOtp(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (error) return fail(error);
    setPhoneOtpSent(true);
  }
  async function verifyPhoneOtp(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' });
    setBusy(false);
    if (error) return fail(error);
    navigate(landing);
  }

  async function startOAuth(provider: string) {
    reset();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as never,
      options: { redirectTo: loginRedirectTo(next) },
    });
    if (error) {
      setBusy(false);
      fail(error);
    }
  }

  function onOauthPrimaryClick() {
    if (methods.oauth.length === 1) {
      startOAuth(methods.oauth[0]);
      return;
    }
    setOauthPickerOpen((open) => !open);
  }

  if (recovery) {
    return (
      <ComingInPage copy={ci} className={className}>
        <ComingInBrand brandMark={brandMark} wordmark={brandWordmark} />
        <div className="soma-signin-card">
          <h1 className="soma-signin-title">{ci.recoveryTitle}</h1>
          <form onSubmit={setNewPassword} className="space-y-4">
            <Field label={ci.newPasswordLabel}>
              <input
                className={inputCls}
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <StatusLine status={status} />
            <button type="submit" disabled={busy} className={`${btnCls} soma-signin-btn soma-signin-btn--gold`}>
              {busy ? ci.savingPassword : ci.savePassword}
            </button>
          </form>
        </div>
      </ComingInPage>
    );
  }

  if (magicSent) {
    return (
      <ComingInPage copy={ci} className={className}>
        <ComingInBrand brandMark={brandMark} wordmark={brandWordmark} />
        <div className="soma-signin-card">
          <h1 className="soma-signin-title">{ci.magicSentTitle}</h1>
          <p className="soma-signin-sub">
            {ci.magicSentBody.replace('{email}', email)}
          </p>
          <LinkButton onClick={() => setMagicSent(false)}>{ci.magicSentBack}</LinkButton>
        </div>
      </ComingInPage>
    );
  }

  if (signupNeedsConfirm) {
    return (
      <ComingInPage copy={ci} className={className}>
        <ComingInBrand brandMark={brandMark} wordmark={brandWordmark} />
        <div className="soma-signin-card">
          <h1 className="soma-signin-title">{ci.signupConfirmTitle}</h1>
          <p className="soma-signin-sub">
            {ci.signupConfirmBody.replace('{email}', email)}
          </p>
          <LinkButton
            onClick={() => {
              setSignupNeedsConfirm(false);
              setMode('signin');
            }}
          >
            {ci.signupConfirmCta}
          </LinkButton>
        </div>
      </ComingInPage>
    );
  }

  const anyMethod =
    methods.magicLink ||
    methods.emailOtp ||
    methods.password ||
    methods.phone ||
    methods.oauth.length > 0;

  const showMagicEmailField = magicLinkNeedsEmail && !email.trim();

  return (
    <ComingInPage copy={ci} className={className}>
      <ComingInBrand brandMark={brandMark} wordmark={brandWordmark} />
      <div className="soma-signin-card">
        <div className="soma-signin-head">
          <span className="soma-signin-avatar" aria-hidden="true">VE</span>
          <div className="soma-signin-head-text">
            <p className="soma-signin-cue">
              {ci.guideCue}
              <span className="soma-signin-ai-badge">{ci.aiDisclosure}</span>
            </p>
            <h1 className="soma-signin-title">{pageTitle}</h1>
            <p className="soma-signin-sub">{ci.subtitle}</p>
          </div>
        </div>

        {!anyMethod && <p className="soma-signin-sub">{ci.noMethods}</p>}

        {knownRows.length > 0 && (
          <section className="soma-signin-known" aria-label={ci.whatAlreadyHave}>
            <span className="soma-signin-known-label">{ci.whatAlreadyHave}</span>
            {knownRows.map((row) => (
              <div key={row.label} className="soma-signin-known-row">
                <CheckIcon className="soma-signin-check" />
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </section>
        )}

        <div className="soma-signin-actions">
          {methods.oauth.length > 0 && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onOauthPrimaryClick}
                className="soma-signin-btn soma-signin-btn--outline"
              >
                <GlobeIcon />
                {oauthPrimaryLabel(methods.oauth, ci)}
              </button>
              {oauthPickerOpen && methods.oauth.length > 1 && (
                <div className="flex flex-col gap-2">
                  {methods.oauth.map((provider) => {
                    const meta = providerMeta(provider);
                    return (
                      <button
                        key={provider}
                        type="button"
                        disabled={busy}
                        onClick={() => startOAuth(provider)}
                        className="soma-signin-btn soma-signin-btn--outline"
                        style={{ background: meta.color, color: meta.text, borderColor: meta.border }}
                      >
                        Continue with {meta.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {methods.magicLink && (
            <>
              {showMagicEmailField ? (
                <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
                  <Field label={ci.knownEmail}>
                    <input
                      className={inputCls}
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </Field>
                  <button
                    type="submit"
                    disabled={busy}
                    className="soma-signin-btn soma-signin-btn--gold"
                  >
                    {busy ? 'Sending…' : ci.magicLinkCta}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => sendMagicLink()}
                  className="soma-signin-btn soma-signin-btn--gold"
                >
                  {busy ? 'Sending…' : ci.magicLinkCta}
                </button>
              )}
            </>
          )}

          <StatusLine status={status} />
        </div>

        <p className="soma-signin-fine">
          {ci.finePrintLead} {ci.invitationOnly}
        </p>

        {(methods.password || methods.emailOtp || methods.phone) && (
          <details className="soma-signin-disclosure">
            <summary>{ci.otherWaysIn}</summary>
            <div className="soma-signin-disclosure-body">
              {methods.password && (
                <form
                  onSubmit={mode === 'signup' ? signUpPassword : signInPassword}
                  className="space-y-4"
                >
                  {mode === 'signup' && (
                    <>
                      <Field label="Your name">
                        <input
                          className={inputCls}
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Eric"
                          autoComplete="name"
                        />
                      </Field>
                      <Field label="Writers’ Room name (optional)">
                        <input
                          className={inputCls}
                          value={studioName}
                          onChange={(e) => setStudioName(e.target.value)}
                          placeholder="My writers’ room"
                        />
                      </Field>
                    </>
                  )}
                  <Field label="Email">
                    <input
                      className={inputCls}
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Password">
                    <input
                      className={inputCls}
                      type="password"
                      required
                      minLength={mode === 'signup' ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                  </Field>
                  <button type="submit" disabled={busy} className={btnCls}>
                    {busy
                      ? mode === 'signup'
                        ? 'Creating…'
                        : 'Signing in…'
                      : mode === 'signup'
                        ? 'Create account'
                        : 'Sign in'}
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="text-stage-accent hover:underline"
                      onClick={() => {
                        reset();
                        setMode(mode === 'signup' ? 'signin' : 'signup');
                      }}
                    >
                      {mode === 'signup'
                        ? 'Already have an account? Sign in'
                        : 'New here? Create an account'}
                    </button>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        className="text-stage-muted hover:underline"
                        onClick={sendReset}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                </form>
              )}

              {methods.emailOtp && (
                <>
                  {methods.password && <Divider label="or" />}
                  {!emailOtpSent ? (
                    <form onSubmit={sendEmailOtp} className="space-y-3">
                      {!methods.password && (
                        <Field label="Email">
                          <input
                            className={inputCls}
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                          />
                        </Field>
                      )}
                      <button type="submit" disabled={busy} className={btnSecondaryCls}>
                        {busy ? 'Sending…' : 'Email me a 6-digit code'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={verifyEmailOtp} className="space-y-3">
                      <Field label="6-digit code">
                        <input
                          className={inputCls}
                          inputMode="numeric"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          autoComplete="one-time-code"
                        />
                      </Field>
                      <button type="submit" disabled={busy} className={btnCls}>
                        {busy ? 'Verifying…' : 'Verify code'}
                      </button>
                    </form>
                  )}
                </>
              )}

              {methods.phone && (
                <>
                  {(methods.password || methods.emailOtp) && <Divider label="or" />}
                  {!phoneOtpSent ? (
                    <form onSubmit={sendPhoneOtp} className="space-y-3">
                      <Field label="Phone (E.164, e.g. +15551234567)">
                        <input
                          className={inputCls}
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          autoComplete="tel"
                        />
                      </Field>
                      <button type="submit" disabled={busy} className={btnSecondaryCls}>
                        {busy ? 'Sending…' : 'Text me a code'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={verifyPhoneOtp} className="space-y-3">
                      <Field label="6-digit code">
                        <input
                          className={inputCls}
                          inputMode="numeric"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          autoComplete="one-time-code"
                        />
                      </Field>
                      <button type="submit" disabled={busy} className={btnCls}>
                        {busy ? 'Verifying…' : 'Verify code'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </details>
        )}
      </div>
    </ComingInPage>
  );
}

// ─────────────────────────── presentational bits ────────────────────────────

/** @deprecated Legacy split layout — kept for any external import; routes use ComingInPage. */
export function Shell({
  title,
  children,
  copy = DEFAULT_SOMA_AUTH_COPY,
  wordmark = copy.wordmark,
}: {
  title: string;
  children: React.ReactNode;
  copy?: SomaAuthCopy;
  wordmark?: string;
}) {
  return (
    <ComingInPage copy={copy}>
      <ComingInBrand wordmark={wordmark} />
      <div className="soma-signin-card">
        <h1 className="soma-signin-title">{title}</h1>
        <div className="space-y-4">{children}</div>
      </div>
    </ComingInPage>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-stage-muted">{label}</span>
      {children}
    </label>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle' || !status.msg) return null;
  const cls = status.kind === 'error' ? 'text-red-600' : 'text-emerald-700';
  return <p className={`text-sm ${cls}`}>{status.msg}</p>;
}

function Divider({ label }: { label?: string }) {
  if (!label) return <div className="my-2 border-t border-stage-edge" />;
  return (
    <div className="my-2 flex items-center gap-3 text-xs text-stage-muted">
      <span className="h-px flex-1 bg-stage-edge" />
      {label}
      <span className="h-px flex-1 bg-stage-edge" />
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-block text-sm text-stage-accent hover:underline"
    >
      {children}
    </button>
  );
}

export const inputCls =
  'w-full rounded-lg border border-stage-edge bg-stage-bg px-3 py-2 text-stage-ink outline-none focus:border-stage-accent';
export const btnCls =
  'w-full rounded-lg bg-stage-accent px-3 py-2 font-medium text-stage-bg hover:brightness-110 disabled:opacity-50 min-h-[44px]';
export const btnSecondaryCls =
  'w-full rounded-lg border border-stage-edge bg-stage-bg px-3 py-2 font-medium text-stage-ink hover:border-stage-accent disabled:opacity-50 min-h-[44px]';
