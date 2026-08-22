/**
 * The onboarding engine.
 *
 * `createOnboardHandlers(cfg, { store, sender })` returns a map of named
 * handlers. Nothing in here knows the app's brand, tables, or roles — that all
 * arrives through cfg. This is the whole point of the extraction: Vegas Connect
 * and Revolution 1x1 ran two copies of this logic whose only real difference
 * was a table prefix and a list of role labels.
 *
 * The invitation lifecycle:
 *
 *   prepare-invite  inviter names a person → invite row + (optionally) a
 *                   `contact_only` member they can claim → tagged URL per channel
 *   invite-send     optional: the app emails it instead of the inviter's client
 *   invite-info     invitee opens the link → who invited me, into what
 *   one-click-join  invitee had email+phone on file → consent, tap, in
 *   join            invitee fills the short form → in
 *
 * Both join paths converge on: member goes `active`, a connection edge carries
 * the relationship, the invite row is marked joined, and a session token comes
 * back so the invitee is signed in without a password.
 */

import { nowIso, uniqueCode } from './codes.js';
import { channelTargets } from './channels.js';
import { inviteUrl } from './invite-link.js';
import { tables, defaultRole } from './config.js';
import { consumeAttempt, clearAttempts } from './abuse.js';
import {
  ok,
  created,
  badRequest,
  forbidden,
  unauthorized,
  notFound,
  methodNotAllowed,
  tooManyRequests,
  serverError,
  parseBody,
  getBearerToken,
  isBlank,
  publicMember,
  privateMember,
} from './http.js';
import {
  relationshipValue,
  looksLikeBot,
  nameValue,
  emailValue,
  phoneValue,
  roleValue,
} from './validate.js';

const RATE_WINDOW_MS = 60_000;
const PREPARE_LIMIT = 20;
const JOIN_LIMIT = 8;

/**
 * @param {import('./config.js').OnboardConfig} cfg
 * @param {{ store: any, sender?: { send: (msg: any) => Promise<any> } | null }} deps
 */
export function createOnboardHandlers(cfg, deps) {
  const { store, sender = null } = deps;
  if (!store) throw new Error('soma-onboard: createOnboardHandlers needs a store');

  // -------------------------------------------------------------------------
  // auth
  // -------------------------------------------------------------------------
  async function requireAuth(headers) {
    const token = getBearerToken(headers);
    if (!token) return { ok: false, response: unauthorized('Missing session token') };
    const row = await store.getSession(token);
    if (!row) return { ok: false, response: unauthorized('Invalid session') };
    if (row.member.status === 'deactivated') {
      return { ok: false, response: forbidden('Account deactivated') };
    }
    store.touchSession(token).catch(() => {});
    return { ok: true, token, member: row.member, session: row.session };
  }

  /** Origin the invite links should use. Preview deploys differ from cfg.origin. */
  function originFor(event) {
    const headers = event.headers || {};
    const host = headers['x-forwarded-host'] || headers.host || headers.Host;
    const proto = headers['x-forwarded-proto'] || 'https';
    if (!host) return cfg.origin;

    // A spoofed Host header must not be able to mint invite links pointing at
    // someone else's domain — the whole value of an invite is that it goes
    // where the inviter thinks it goes.
    //
    // Netlify previews are `deploy-preview-12--<site>.netlify.app` and
    // `<branch>--<site>.netlify.app`, so they are matched by the `--<configured
    // host>` suffix specifically. Trusting `*.netlify.app` wholesale would
    // accept `evil.netlify.app`, which is a domain anyone can register.
    const configured = new URL(cfg.origin).host;
    const trusted =
      host === configured ||
      host.endsWith(`--${configured}`) ||
      /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    return trusted ? `${proto}://${host}` : cfg.origin;
  }

  function inviteContext(inviter, extra = {}) {
    return {
      brandName: cfg.brandName,
      inviterName: inviter?.name || cfg.hostName || cfg.brandName,
      purposeOneLiner: cfg.purposeOneLiner,
      ...extra,
    };
  }

  // -------------------------------------------------------------------------
  // GET invite-info — what an invitee sees before deciding
  // -------------------------------------------------------------------------
  async function handleInviteInfo(event) {
    if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
    const q = event.queryStringParameters || {};
    const code = q.code || q.c || '';
    if (isBlank(code)) return badRequest('code is required');

    const rel = relationshipValue(q.rel);
    if (rel.error) return badRequest(rel.error);

    try {
      const inviter = await store.getMemberByCode(String(code).trim());
      if (!inviter || inviter.status === 'deactivated') return notFound('Invite not found');

      const member_count = await store.activeMemberCount();

      // A claim code names a member the inviter pre-created for this person.
      let claim_member = null;
      if (q.claim) {
        const existing = await store.getMemberByCode(String(q.claim).trim());
        if (
          existing &&
          existing.status !== 'deactivated' &&
          (!existing.invited_by || existing.invited_by === inviter.id)
        ) {
          const hasContact = !!(existing.email && existing.phone);
          claim_member = {
            code: existing.code,
            name: existing.name,
            has_contact: hasContact,
            one_click: hasContact && existing.status === 'contact_only',
            status: existing.status,
          };
        }
      }

      // Attribution beacon: opening the link is the "opened" event. Fire and
      // forget — a failed beacon must never block someone joining.
      if (q.invite) {
        store.markInviteOpened(String(q.invite), q.ch || null).catch(() => {});
      }

      return ok({
        app: cfg.appId,
        brand_name: cfg.brandName,
        purpose: cfg.purposeOneLiner,
        host_name: cfg.hostName || null,
        virtual_host_name: cfg.virtualHostName || null,
        inviter_name: inviter.name,
        inviter_code: inviter.code,
        inviter_photo_url: inviter.photo_url || null,
        member_count,
        relationship: rel.value,
        invitee_name: q.for || claim_member?.name || null,
        channel: q.ch || null,
        claim_member,
        roles: cfg.roles,
        relationships: cfg.relationships,
        require_consent: cfg.requireConsent,
      });
    } catch (e) {
      console.error('[soma-onboard] invite-info', e);
      return serverError('Failed to load invite');
    }
  }

  // -------------------------------------------------------------------------
  // POST prepare-invite — "I want to invite Dana, my wife"
  // -------------------------------------------------------------------------
  async function handlePrepareInvite(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
    const auth = await requireAuth(event.headers);
    if (!auth.ok) return auth.response;

    const rate = consumeAttempt('prepare-invite', event, PREPARE_LIMIT, RATE_WINDOW_MS);
    if (rate.limited) return tooManyRequests('Too many invites, slow down', rate.retryAfter);

    const body = parseBody(event);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest('Invalid JSON');
    }

    const name = nameValue(body.name);
    if (name.error) return badRequest(name.error);
    if (looksLikeBot(name.value, body.email)) return badRequest('Invalid invite');

    const rel = relationshipValue(body.rel ?? body.relationship);
    if (rel.error) return badRequest(rel.error);
    const email = emailValue(body.email);
    if (email.error) return badRequest(email.error);
    const phone = phoneValue(body.phone);
    if (phone.error) return badRequest(phone.error);
    const role = roleValue(cfg, body.role);
    if (role.error) return badRequest(role.error);

    const hasContact = !!(email.value && phone.value);

    try {
      // With any contact detail on file we pre-create a `contact_only` member.
      // That is what makes one-click join possible: the invitee taps once and
      // is in, instead of retyping what their inviter already knows.
      let claim = null;
      if (email.value || phone.value) {
        const code = await uniqueCode(store, cfg.codeLength);
        claim = await store.createMember({
          code,
          name: name.value,
          email: email.value,
          phone: phone.value,
          city: null,
          role: role.value,
          bio: null,
          photo_url: null,
          invited_by: auth.member.id,
          status: 'contact_only',
          is_admin: false,
          onboarding_complete: false,
          consent_at: null,
        });
        await store.createConnection(auth.member.id, claim.id, rel.value || 'invited');
      }

      const invite = await store.createInvite({
        inviter_id: auth.member.id,
        claim_member_id: claim?.id || null,
        invitee_name: name.value,
        relationship: rel.value,
        channel: null,
      });

      const origin = originFor(event);
      const url = inviteUrl(
        cfg,
        {
          inviterCode: auth.member.code,
          claimCode: claim?.code,
          relationship: rel.value || undefined,
          inviteeName: claim ? undefined : name.value,
        },
        origin
      );
      // Carry the invite id so `opened` can be attributed on the landing page.
      const trackedUrl = withInvite(url, invite.id);

      const ctx = inviteContext(auth.member, {
        url: trackedUrl,
        inviteeName: name.value,
        relationship: rel.value || undefined,
        note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
      });

      return created({
        invite_id: invite.id,
        invitee_name: name.value,
        relationship: rel.value,
        one_click_ready: !!(claim && hasContact),
        claim_code: claim?.code || null,
        url: trackedUrl,
        inviter_code: auth.member.code,
        channels: channelTargets(cfg, ctx, {
          email: email.value || undefined,
          phone: phone.value || undefined,
        }),
        message: hasContact
          ? `${name.value} only needs to open this and confirm — email and phone are already on file.`
          : `Send this to ${name.value}, or show the QR if they're standing next to you.`,
      });
    } catch (e) {
      console.error('[soma-onboard] prepare-invite', e);
      return serverError('Could not prepare invite');
    }
  }

  // -------------------------------------------------------------------------
  // POST invite-send — the app sends it, rather than the inviter's mail client
  // -------------------------------------------------------------------------
  async function handleInviteSend(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
    const auth = await requireAuth(event.headers);
    if (!auth.ok) return auth.response;

    const body = parseBody(event);
    if (body === null || typeof body !== 'object') return badRequest('Invalid JSON');

    const channel = String(body.channel || 'email');
    if (channel !== 'email') {
      // Honest failure beats a stub that pretends. SMS needs a Twilio-class
      // account nobody has provisioned for this yet; until then the handoff
      // path (sms: link on the inviter's own phone) is the working answer.
      return badRequest(
        `Server-side sending is only implemented for email. ` +
          `Use the '${channel}' channel target from prepare-invite instead — ` +
          `it opens the inviter's own app with the message prefilled.`
      );
    }
    if (!sender) {
      return badRequest(
        'No email sender is configured for this app. Pass a sender to ' +
          'createOnboardHandlers (see senders/resend.js), or use the mailto handoff.'
      );
    }

    if (isBlank(body.invite_id)) return badRequest('invite_id is required');
    const to = emailValue(body.to);
    if (to.error) return badRequest(to.error);
    if (!to.value) return badRequest('to (email address) is required');

    try {
      const invite = await store.getInviteById(String(body.invite_id));
      if (!invite) return notFound('Invite not found');
      if (invite.inviter_id !== auth.member.id) {
        return forbidden('That invite belongs to someone else');
      }

      const claim = invite.claim_member_id
        ? await store.getMemberById(invite.claim_member_id)
        : null;

      const url = withInvite(
        inviteUrl(
          cfg,
          {
            inviterCode: auth.member.code,
            claimCode: claim?.code,
            relationship: invite.relationship || undefined,
            inviteeName: claim ? undefined : invite.invitee_name || undefined,
            channel: 'email',
          },
          originFor(event)
        ),
        invite.id
      );

      const [target] = channelTargets({ ...cfg, channels: ['email'] },
        inviteContext(auth.member, {
          url,
          inviteeName: invite.invitee_name || undefined,
          relationship: invite.relationship || undefined,
          note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
        }),
        { email: to.value }
      );

      const result = await sender.send({
        to: to.value,
        subject: target.subject,
        text: target.body,
        replyTo: auth.member.email || undefined,
        inviterName: auth.member.name,
        brandName: cfg.brandName,
      });

      await store.markInviteOpened(invite.id, 'email').catch(() => {});

      return ok({
        sent: true,
        to: to.value,
        channel: 'email',
        provider_id: result?.id || null,
        url,
      });
    } catch (e) {
      console.error('[soma-onboard] invite-send', e);
      return serverError(e?.message || 'Could not send invite');
    }
  }

  // -------------------------------------------------------------------------
  // POST one-click-join — email + phone were already on file
  // -------------------------------------------------------------------------
  async function handleOneClickJoin(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
    const rate = consumeAttempt('join', event, JOIN_LIMIT, RATE_WINDOW_MS);
    if (rate.limited) return tooManyRequests('Too many attempts', rate.retryAfter);

    const body = parseBody(event);
    if (body === null || typeof body !== 'object') return badRequest('Invalid JSON');
    if (cfg.requireConsent && body.consent !== true) return badRequest('Consent is required');

    const claimCode = body.claim || body.claim_code;
    if (isBlank(claimCode)) return badRequest('claim is required');

    try {
      const existing = await store.getMemberByCode(String(claimCode).trim());
      if (!existing || existing.status === 'deactivated') return notFound('Invite not found');

      const inviter = existing.invited_by
        ? await store.getMemberById(existing.invited_by)
        : null;

      // Re-scanning an already-claimed invite signs you in rather than erroring.
      if (existing.status === 'active') {
        const session = await store.createSession(existing.id);
        clearAttempts('join', event);
        return ok({
          token: session.token,
          member: publicMember(existing),
          connected_to: connectedTo(inviter),
          already_joined: true,
        });
      }

      if (!(existing.email && existing.phone)) {
        return badRequest(
          'One-click join needs email and phone on file. Use the full join form instead.'
        );
      }

      const rel = relationshipValue(body.rel);
      if (rel.error) return badRequest(rel.error);
      const role = roleValue(cfg, body.role ?? existing.role);
      if (role.error) return badRequest(role.error);

      const updated = await store.updateMember(existing.id, {
        status: 'active',
        onboarding_complete: false,
        consent_at: nowIso(),
        role: role.value,
      });

      if (existing.invited_by && rel.value) {
        await store.createConnection(existing.invited_by, existing.id, rel.value);
      }
      await store.markInviteJoined(existing.id).catch(() => {});

      const session = await store.createSession(updated.id);
      clearAttempts('join', event);
      return created({
        token: session.token,
        member: publicMember(updated),
        connected_to: connectedTo(inviter),
        one_click: true,
      });
    } catch (e) {
      console.error('[soma-onboard] one-click-join', e);
      return serverError('One-click join failed');
    }
  }

  // -------------------------------------------------------------------------
  // POST join — the full form (no contact on file, or a cold invite link)
  // -------------------------------------------------------------------------
  async function handleJoin(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
    const rate = consumeAttempt('join', event, JOIN_LIMIT, RATE_WINDOW_MS);
    if (rate.limited) return tooManyRequests('Too many attempts', rate.retryAfter);

    const body = parseBody(event);
    if (body === null || typeof body !== 'object') return badRequest('Invalid JSON');
    if (cfg.requireConsent && body.consent !== true) return badRequest('Consent is required');

    const inviterCode = body.code_of_inviter || body.inviter_code || body.code;
    if (isBlank(inviterCode)) return badRequest('inviter code is required');

    const name = nameValue(body.name);
    if (name.error) return badRequest(name.error);
    if (looksLikeBot(name.value, body.email)) return badRequest('Invalid registration');

    const email = emailValue(body.email);
    if (email.error) return badRequest(email.error);
    const phone = phoneValue(body.phone);
    if (phone.error) return badRequest(phone.error);
    const role = roleValue(cfg, body.role);
    if (role.error) return badRequest(role.error);
    const rel = relationshipValue(body.rel ?? body.relationship);
    if (rel.error) return badRequest(rel.error);

    try {
      const inviter = await store.getMemberByCode(String(inviterCode).trim());
      if (!inviter || inviter.status === 'deactivated') return notFound('Invite not found');

      // If the inviter pre-created this person, upgrade that row instead of
      // creating a duplicate. Two rows for one human is the bug that makes a
      // relationship graph useless.
      let member = null;
      if (body.claim || body.claim_code) {
        const claimed = await store.getMemberByCode(String(body.claim || body.claim_code).trim());
        if (
          claimed &&
          claimed.status === 'contact_only' &&
          (!claimed.invited_by || claimed.invited_by === inviter.id)
        ) {
          member = await store.updateMember(claimed.id, {
            name: name.value,
            email: email.value ?? claimed.email,
            phone: phone.value ?? claimed.phone,
            role: role.value,
            city: body.city ? String(body.city).trim() : claimed.city,
            status: 'active',
            onboarding_complete: false,
            consent_at: nowIso(),
          });
        }
      }

      if (!member) {
        const code = await uniqueCode(store, cfg.codeLength);
        member = await store.createMember({
          code,
          name: name.value,
          email: email.value,
          phone: phone.value,
          city: body.city ? String(body.city).trim() : null,
          role: role.value,
          bio: null,
          photo_url: null,
          invited_by: inviter.id,
          status: 'active',
          is_admin: false,
          onboarding_complete: false,
          consent_at: nowIso(),
        });
      }

      await store.createConnection(inviter.id, member.id, rel.value || 'invited');
      await store.markInviteJoined(member.id).catch(() => {});

      const session = await store.createSession(member.id);
      clearAttempts('join', event);
      return created({
        token: session.token,
        member: publicMember(member),
        connected_to: connectedTo(inviter),
      });
    } catch (e) {
      console.error('[soma-onboard] join', e);
      return serverError('Join failed');
    }
  }

  // -------------------------------------------------------------------------
  // GET invitees — the inviter's own view, with channel attribution
  // -------------------------------------------------------------------------
  async function handleInvitees(event) {
    if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
    const auth = await requireAuth(event.headers);
    if (!auth.ok) return auth.response;

    try {
      const [invitees, invites, channels] = await Promise.all([
        store.listInvitees(auth.member.id),
        store.listInvitesByInviter(auth.member.id),
        store.channelStats(),
      ]);

      return ok({
        me: privateMember(auth.member),
        invite_url: inviteUrl(cfg, { inviterCode: auth.member.code }, originFor(event)),
        invitees: invitees.map((m) => ({
          id: m.id,
          name: m.name,
          code: m.code,
          status: m.status,
          onboarding_complete: !!m.onboarding_complete,
          created_at: m.created_at,
        })),
        invites: invites.map((i) => ({
          id: i.id,
          invitee_name: i.invitee_name,
          relationship: i.relationship,
          channel: i.channel,
          created_at: i.created_at,
          opened_at: i.opened_at,
          joined_at: i.joined_at,
        })),
        channel_stats: channels,
      });
    } catch (e) {
      console.error('[soma-onboard] invitees', e);
      return serverError('Could not load invitees');
    }
  }

  // -------------------------------------------------------------------------
  // POST invite-open — attribution beacon from the landing page
  // -------------------------------------------------------------------------
  async function handleInviteOpen(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
    const body = parseBody(event) || {};
    const id = body.invite_id || event.queryStringParameters?.invite;
    if (isBlank(id)) return badRequest('invite_id is required');
    try {
      await store.markInviteOpened(String(id), body.channel || null);
      return ok({ recorded: true });
    } catch {
      // Never let analytics break a join.
      return ok({ recorded: false });
    }
  }

  // -------------------------------------------------------------------------
  // GET session — whoami
  // -------------------------------------------------------------------------
  async function handleSession(event) {
    if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
    const auth = await requireAuth(event.headers);
    if (!auth.ok) return auth.response;
    return ok({ member: privateMember(auth.member), app: cfg.appId, brand_name: cfg.brandName });
  }

  return {
    'invite-info': handleInviteInfo,
    'prepare-invite': handlePrepareInvite,
    'invite-send': handleInviteSend,
    'invite-open': handleInviteOpen,
    'one-click-join': handleOneClickJoin,
    join: handleJoin,
    invitees: handleInvitees,
    session: handleSession,
    _internal: { requireAuth, originFor, tables: tables(cfg) },
  };
}

function connectedTo(inviter) {
  return inviter
    ? { id: inviter.id, name: inviter.name, photo_url: inviter.photo_url || null }
    : null;
}

function withInvite(url, inviteId) {
  const u = new URL(url);
  u.searchParams.set('invite', inviteId);
  return u.toString();
}
