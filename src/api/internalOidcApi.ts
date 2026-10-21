import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

/**
 * Registering and maintaining OIDC clients ("Sign in with LinkedTrust" relying
 * apps) over HTTP, for our other VMs — the same job as
 * scripts/register-oidc-client.ts, without an ssh session.
 *
 * Mounted under /internal/, behind internalOnly(). A client secret is returned
 * exactly once, at creation or rotation; only its bcrypt hash is stored.
 */

const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'trust'];

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  return [];
};

// A redirect_uri is matched exactly at authorize time, so a typo here is a
// support ticket later. Absolute http(s) with no fragment, as OIDC requires.
const badRedirect = (uri: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return `${uri} is not an absolute URL`;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return `${uri} is not http(s)`;
  if (parsed.hash) return `${uri} has a fragment`;
  return null;
};

const publicShape = (c: {
  clientId: string;
  name: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  isPublic: boolean;
  createdAt: Date;
}) => ({
  client_id: c.clientId,
  name: c.name,
  redirect_uris: c.redirectUris,
  allowed_scopes: c.allowedScopes,
  type: c.isPublic ? 'public' : 'confidential',
  created_at: c.createdAt,
});

export async function listClients(_req: Request, res: Response): Promise<Response | void> {
  const clients = await prisma.oidcClient.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ clients: clients.map(publicShape) });
}

export async function createClient(req: Request, res: Response): Promise<Response | void> {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const redirectUris = asList(req.body?.redirect_uris ?? req.body?.redirectUris);
    const scopes = asList(req.body?.scopes ?? req.body?.allowed_scopes);
    const isPublic = req.body?.public === true || req.body?.isPublic === true;

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (redirectUris.length === 0) return res.status(400).json({ error: 'redirect_uris is required' });

    for (const uri of redirectUris) {
      const problem = badRedirect(uri);
      if (problem) return res.status(400).json({ error: problem });
    }

    const clientId = `lt_${crypto.randomBytes(12).toString('hex')}`;
    let plaintextSecret = '';
    let clientSecret = '';
    if (!isPublic) {
      plaintextSecret = crypto.randomBytes(32).toString('base64url');
      clientSecret = await bcrypt.hash(plaintextSecret, 10);
    }

    const created = await prisma.oidcClient.create({
      data: {
        clientId,
        clientSecret,
        name,
        redirectUris,
        allowedScopes: scopes.length ? scopes : DEFAULT_SCOPES,
        isPublic,
      },
    });

    console.log(`internal API: registered OIDC client ${clientId} (${name})`);
    return res.status(201).json({
      ...publicShape(created),
      ...(isPublic ? {} : { client_secret: plaintextSecret }),
      note: isPublic
        ? 'Public client: PKCE required, no secret.'
        : 'client_secret is shown only here. Store it now; only its hash is kept.',
    });
  } catch (err) {
    console.error('internal API: create OIDC client failed', err);
    return res.status(500).json({ error: 'Could not register client' });
  }
}

export async function updateClient(req: Request, res: Response): Promise<Response | void> {
  try {
    const { clientId } = req.params;
    const existing = await prisma.oidcClient.findUnique({ where: { clientId } });
    if (!existing) return res.status(404).json({ error: 'No such client' });

    const data: { name?: string; redirectUris?: string[]; allowedScopes?: string[] } = {};

    if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim();

    if (req.body?.redirect_uris !== undefined || req.body?.redirectUris !== undefined) {
      const redirectUris = asList(req.body.redirect_uris ?? req.body.redirectUris);
      if (redirectUris.length === 0) return res.status(400).json({ error: 'redirect_uris cannot be empty' });
      for (const uri of redirectUris) {
        const problem = badRedirect(uri);
        if (problem) return res.status(400).json({ error: problem });
      }
      data.redirectUris = redirectUris;
    }

    if (req.body?.scopes !== undefined || req.body?.allowed_scopes !== undefined) {
      const scopes = asList(req.body.scopes ?? req.body.allowed_scopes);
      if (scopes.length === 0) return res.status(400).json({ error: 'scopes cannot be empty' });
      data.allowedScopes = scopes;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nothing to change: send name, redirect_uris or scopes' });
    }

    const updated = await prisma.oidcClient.update({ where: { clientId }, data });
    console.log(`internal API: updated OIDC client ${clientId} (${Object.keys(data).join(', ')})`);
    return res.json(publicShape(updated));
  } catch (err) {
    console.error('internal API: update OIDC client failed', err);
    return res.status(500).json({ error: 'Could not update client' });
  }
}

export async function rotateSecret(req: Request, res: Response): Promise<Response | void> {
  try {
    const { clientId } = req.params;
    const existing = await prisma.oidcClient.findUnique({ where: { clientId } });
    if (!existing) return res.status(404).json({ error: 'No such client' });
    if (existing.isPublic) return res.status(400).json({ error: 'Public clients have no secret' });

    const plaintextSecret = crypto.randomBytes(32).toString('base64url');
    const updated = await prisma.oidcClient.update({
      where: { clientId },
      data: { clientSecret: await bcrypt.hash(plaintextSecret, 10) },
    });

    console.log(`internal API: rotated secret for OIDC client ${clientId}`);
    return res.json({
      ...publicShape(updated),
      client_secret: plaintextSecret,
      note: 'The previous secret stops working immediately.',
    });
  } catch (err) {
    console.error('internal API: rotate OIDC secret failed', err);
    return res.status(500).json({ error: 'Could not rotate secret' });
  }
}

export async function deleteClient(req: Request, res: Response): Promise<Response | void> {
  try {
    const { clientId } = req.params;
    const existing = await prisma.oidcClient.findUnique({ where: { clientId } });
    if (!existing) return res.status(404).json({ error: 'No such client' });

    await prisma.oidcClient.delete({ where: { clientId } });
    console.log(`internal API: deleted OIDC client ${clientId}`);
    return res.json({ deleted: clientId });
  } catch (err) {
    console.error('internal API: delete OIDC client failed', err);
    return res.status(500).json({ error: 'Could not delete client' });
  }
}
