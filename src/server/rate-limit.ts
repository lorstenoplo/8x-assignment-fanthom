import "server-only";

/**
 * Best-effort in-process rate limiter. Serverless platforms run multiple
 * instances, so this does not enforce a hard global limit — but it does stop
 * the common case (a runaway client, a stuck retry loop, a single abusive
 * visitor hammering one warm instance) from generating unbounded paid model
 * calls. A production deployment would back this with Redis/Upstash; noted
 * here rather than pretended away.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const retryAfterMs = windowMs - (now - hits[0]);
    return { allowed: false, retryAfterMs };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Bound memory: forget keys that haven't been touched recently.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t > windowMs)) buckets.delete(k);
    }
  }

  return { allowed: true };
}

export function clientKey(req: Request, workspaceId?: string | null): string {
  if (workspaceId) return `ws:${workspaceId}`;
  const fwd = req.headers.get("x-forwarded-for");
  return `ip:${fwd?.split(",")[0]?.trim() || "unknown"}`;
}
