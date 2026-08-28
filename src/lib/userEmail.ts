// Resolving a person from an email address.
//
// Two things every sign-in path needs and none of them used to do:
//
//  1. Case. Postgres compares text case-sensitively, so a user stored as
//     Michael.Metz@AcceleraIQ.com could not log in by typing
//     michael.metz@acceleraiq.com. It returned "Invalid credentials", which
//     reads like a wrong password and sends people to reset a password that
//     was never wrong.
//
//  2. Second addresses. One human often has a work address and a personal one.
//     Signing in with the second made a second account, and since every app
//     behind LinkedTrust SSO keys off the OIDC `sub`, that second account
//     showed up at the dash, the CRM and Taiga as a stranger with none of the
//     person's memberships.
//
// `User.email` stays the primary and is the only address OIDC userinfo hands
// out, so downstream apps see one stable identity however the person signed in.

import { prisma } from './prisma';
import type { User } from '@prisma/client';

/** Trimmed and lowercased. Aliases are STORED in this form; User.email is not. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The person who owns this address: the User whose primary email matches
 * (ignoring case), else the User an alias points at. Null when nobody owns it.
 */
export async function findUserByEmail(email: string | null | undefined): Promise<User | null> {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const primary = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: 'insensitive' } },
  });
  if (primary) return primary;

  const alias = await prisma.userEmail.findUnique({
    where: { email: normalized },
    include: { user: true },
  });
  return alias?.user ?? null;
}

/**
 * Attach another address to an existing person. Idempotent, and it never moves
 * an address off whoever holds it: if the address is already someone's primary
 * or alias, that owner is returned unchanged and the caller can see it is not
 * the user they asked for.
 */
export async function addEmailAlias(userId: number, email: string): Promise<User | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const owner = await findUserByEmail(normalized);
  if (owner) return owner;

  await prisma.userEmail.create({ data: { email: normalized, userId } });
  return prisma.user.findUnique({ where: { id: userId } });
}
