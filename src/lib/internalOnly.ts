import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Gate for /internal/* — routes callable from our other VMs and nowhere else.
 *
 * Two independent checks, both required:
 *
 *  1. Source address. Other VMs reach this host directly on the LAN
 *     (10.0.0.0/24, ufw allows :80 only), so their peer address is their own
 *     10.0.0.x. Public traffic arrives at the same port from the Proxmox front
 *     proxy at 10.0.0.1, so that one address is denied even though it is inside
 *     the LAN range. nginx denies the same set before proxying; this is the
 *     second lock on the same door.
 *  2. A shared key in x-lt-internal-key, compared in constant time.
 *
 * Fails closed: with INTERNAL_API_KEY unset, nothing is callable.
 */

const DEFAULT_ALLOW = '10.0.0.0/24,127.0.0.1';
const DEFAULT_DENY = '10.0.0.1'; // the front proxy: anything public comes from here

const normalize = (ip: string) => ip.replace(/^::ffff:/, '').trim();

const inCidr = (ip: string, cidr: string): boolean => {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const toInt = (addr: string) => {
    const parts = addr.split('.');
    if (parts.length !== 4) return null;
    return parts.reduce((acc, part) => {
      const n = Number(part);
      return acc === null || !Number.isInteger(n) || n < 0 || n > 255 ? null : (acc as number) * 256 + n;
    }, 0 as number | null);
  };
  const a = toInt(ip);
  const b = toInt(range);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
};

const listFromEnv = (name: string, fallback: string) =>
  (process.env[name] || fallback)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export const isInternalAddress = (ip: string): boolean => {
  const addr = normalize(ip);
  if (listFromEnv('INTERNAL_API_DENY', DEFAULT_DENY).some(c => inCidr(addr, c))) return false;
  return listFromEnv('INTERNAL_API_ALLOW', DEFAULT_ALLOW).some(c => inCidr(addr, c));
};

const keyMatches = (given: string): boolean => {
  const expected = process.env.INTERNAL_API_KEY || '';
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export function internalOnly(req: Request, res: Response, next: NextFunction): Response | void {
  if (!process.env.INTERNAL_API_KEY) {
    console.error('internal API call refused: INTERNAL_API_KEY is not set');
    return res.status(503).json({ error: 'Internal API is not configured' });
  }

  // The peer address, never a forwarded header: our own nginx overwrites
  // X-Real-IP, and a caller's own X-Forwarded-For is not evidence of anything.
  const peer = normalize(req.socket.remoteAddress || '');
  const viaOurNginx = peer === '127.0.0.1' || peer === '::1';
  const claimed = viaOurNginx ? normalize((req.headers['x-real-ip'] as string) || '') : peer;

  if (!claimed || !isInternalAddress(claimed)) {
    console.error(`internal API call refused: source ${claimed || 'unknown'} (peer ${peer})`);
    return res.status(403).json({ error: 'Not available from this address' });
  }

  if (!keyMatches((req.headers['x-lt-internal-key'] as string) || '')) {
    console.error(`internal API call refused: bad or missing key from ${claimed}`);
    return res.status(401).json({ error: 'Bad internal key' });
  }

  return next();
}
