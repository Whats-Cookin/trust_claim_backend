import { Request, Response, NextFunction } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

// The process is single (PM2 fork mode), so an in-memory window is the whole
// picture. Sweep on write so an idle key never outlives its window.
function sweep(now: number) {
  for (const [key, w] of buckets) if (w.resetAt <= now) buckets.delete(key);
}

/**
 * Cheap per-IP limiter for the routes a stranger can reach without a login.
 * Not a defence against a determined attacker with many addresses — it keeps a
 * single caller from enumerating tokens or filling the table.
 */
export function rateLimit(opts: { name: string; max: number; windowMs: number; key?: (req: Request) => string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (buckets.size > 10000) sweep(now);

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() || req.ip || 'unknown';
    const key = `${opts.name}:${opts.key ? opts.key(req) : ip}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (existing.count >= opts.max) {
      res.set('Retry-After', String(Math.ceil((existing.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests, please wait a moment' });
    }
    existing.count += 1;
    next();
  };
}
