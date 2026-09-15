import { Request } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export interface VerifiedClient {
  clientId: string;
  name: string | null;
  /** Stable URI for the service itself, e.g. https://workers.vc */
  issuerUri: string | null;
  /** Hosts this client has registered, used to bound anything it can point at. */
  hosts: string[];
}

function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

/**
 * Server-to-server authentication for a registered OIDC client: `x-lt-client-id`
 * + `x-lt-client-secret`. Lets a partner service (workers.vc, act) act on its own
 * behalf with no user login.
 */
export async function getVerifiedClient(req: Request): Promise<VerifiedClient | null> {
  const clientId = (req.headers['x-lt-client-id'] as string | undefined)?.trim();
  const clientSecret = (req.headers['x-lt-client-secret'] as string | undefined)?.trim();
  if (!clientId || !clientSecret) return null;

  try {
    const client = await prisma.oidcClient.findUnique({ where: { clientId } });
    if (!client || !client.clientSecret) return null;
    if (!(await bcrypt.compare(clientSecret, client.clientSecret))) return null;

    const name = (client.name || '').trim();
    const concrete = client.redirectUris?.filter((u) => !u.includes('*')) || [];
    const hosts = concrete.map(hostOf).filter((h): h is string => !!h);

    // Prefer the client name when it is a bare domain (e.g. "workers.vc" ->
    // https://workers.vc), else the first registered redirect host.
    let issuerUri: string | null = null;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name)) issuerUri = `https://${name}`;
    else if (hosts.length) issuerUri = `https://${hosts[0]}`;

    return { clientId: client.clientId, name: client.name, issuerUri, hosts };
  } catch (e) {
    console.warn('getVerifiedClient error:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The client's issuer URI, or null when the credentials are absent or wrong. */
export async function getVerifiedClientIssuer(req: Request): Promise<string | null> {
  return (await getVerifiedClient(req))?.issuerUri ?? null;
}
