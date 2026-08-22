/**
 * Netlify Functions adapter.
 *
 * In a consuming app, `netlify/functions/onboard.js` is two lines:
 *
 *   import { mountNetlify } from './_onboard.js';
 *   export const handler = mountNetlify('prepare-invite');
 *
 * or, with a single splat function and a redirect
 * (`/api/* → /.netlify/functions/onboard/:splat`):
 *
 *   export const handler = routeNetlify(handlers);
 */

/**
 * One Netlify function per handler name.
 * @param {Record<string, Function>} handlers
 */
export function mountNetlify(handlers) {
  return (name) => {
    const handler = handlers[name];
    if (!handler) {
      throw new Error(
        `soma-onboard: unknown handler ${JSON.stringify(name)}. ` +
          `Available: ${Object.keys(handlers).filter((k) => k !== '_internal').join(', ')}`
      );
    }
    return async (event) => handler(event);
  };
}

/**
 * One Netlify function for all of them, dispatching on the last path segment.
 * @param {Record<string, Function>} handlers
 */
export function routeNetlify(handlers) {
  return async (event) => {
    const path = String(event.path || '').replace(/\/+$/, '');
    const name = path.split('/').filter(Boolean).pop() || '';
    const handler = handlers[name];
    if (!handler || name === '_internal') {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Unknown onboarding route: ${name}` }),
      };
    }
    return handler(event);
  };
}

/**
 * Web-standard `Request` → `Response`, for Deno / Hono / Netlify Edge / Vercel.
 * @param {Record<string, Function>} handlers
 */
export function toFetchHandler(handlers) {
  return async (request) => {
    const url = new URL(request.url);
    const name = url.pathname.split('/').filter(Boolean).pop() || '';
    const handler = handlers[name];
    if (!handler || name === '_internal') {
      return new Response(JSON.stringify({ error: `Unknown onboarding route: ${name}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const event = {
      httpMethod: request.method,
      path: url.pathname,
      headers: Object.fromEntries(request.headers.entries()),
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: ['GET', 'HEAD'].includes(request.method) ? null : await request.text(),
      isBase64Encoded: false,
    };

    const result = await handler(event);
    return new Response(result.body, {
      status: result.statusCode,
      headers: result.headers || { 'Content-Type': 'application/json' },
    });
  };
}
