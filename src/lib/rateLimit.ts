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
export function rateLimit(opts: {
  name: string;
  max: number;
  windowMs: number;
  key?: (req: Request) => string;
  /** Send HTML instead of JSON: this route is a page, not an API call. */
  html?: boolean;
}) {
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
      const seconds = Math.ceil((existing.resetAt - now) / 1000);
      res.set('Retry-After', String(seconds));
      if (opts.html) {
        return res
          .status(429)
          .type('html')
          .send(
            `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
              `<div style="max-width:420px;margin:15vh auto;padding:0 22px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B2430">` +
              `<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">One moment</h1>` +
              `<p style="color:#6B7684;margin:0">This link has been opened a lot in the last few minutes. Try again shortly.</p>` +
              `</div>`
          );
      }
      return res.status(429).json({ error: 'Too many requests, please wait a moment' });
    }
    existing.count += 1;
    next();
  };
}
