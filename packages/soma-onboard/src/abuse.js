/**
 * Per-process fixed-window rate limiting.
 *
 * Netlify function instances do not share this map, so it is a first line of
 * defence against bursts from one source, not a distributed rate limiter. It is
 * kept because the alternative — nothing — let a single script mint unlimited
 * contact_only members through prepare-invite.
 */

const buckets = new Map();

function sourceId(event) {
  const headers = event.headers || {};
  const forwarded =
    headers['x-forwarded-for'] ||
    headers['X-Forwarded-For'] ||
    headers['x-nf-client-connection-ip'] ||
    headers['client-ip'] ||
    'unknown';
  return String(forwarded).split(',')[0].trim() || 'unknown';
}

function currentBucket(scope, event, windowMs) {
  const key = `${scope}:${sourceId(event)}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  return { key, bucket, now };
}

export function consumeAttempt(scope, event, limit, windowMs) {
  const { bucket, now } = currentBucket(scope, event, windowMs);
  bucket.count += 1;
  return {
    limited: bucket.count > limit,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function recordFailedAttempt(scope, event, windowMs) {
  currentBucket(scope, event, windowMs).bucket.count += 1;
}

export function clearAttempts(scope, event) {
  buckets.delete(`${scope}:${sourceId(event)}`);
}

export function resetAbuseGuards() {
  buckets.clear();
}
