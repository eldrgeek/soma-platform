export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function createIdentityVerifier({
  fetchImpl = globalThis.fetch,
  env = process.env,
} = {}) {
  return async function verifyIdentity(request) {
    const devUser = request.headers.get('x-dev-user');
    if (env.NETLIFY_DEV === 'true' && devUser) {
      const separator = devUser.indexOf(':');
      const id = (separator === -1 ? devUser : devUser.slice(0, separator)).trim();
      const name = (separator === -1 ? devUser : devUser.slice(separator + 1)).trim();
      if (!id || !name) throw new HttpError(401, 'Invalid x-dev-user header');
      return { id, name };
    }

    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) {
      throw new HttpError(401, 'A Supabase access token is required');
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      throw new HttpError(500, 'Supabase identity is not configured');
    }

    const response = await fetchImpl(
      `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`,
      {
        headers: {
          authorization,
          apikey: env.SUPABASE_ANON_KEY,
        },
      },
    );
    if (!response.ok) throw new HttpError(401, 'Invalid Supabase access token');

    const user = await response.json();
    if (!user?.id) throw new HttpError(401, 'Supabase returned no user');
    return {
      id: user.id,
      name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email ??
        user.id,
      ...(user.email ? { email: user.email } : {}),
    };
  };
}
