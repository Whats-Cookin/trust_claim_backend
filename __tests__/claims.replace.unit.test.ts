import { Response } from 'express';

// Storage env (claims.ts creates a lazy S3 client; set to be safe).
process.env.LT_STORAGE_KEY = 'test-key';
process.env.LT_STORAGE_SECRET = 'test-secret';
process.env.LT_STORAGE_BUCKET = 'test-bucket';

// Mock prisma so no DB is touched.
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    claim: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    edge: { deleteMany: jest.fn() },
    image: { deleteMany: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    oidcClient: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// Mock the heavy post-create side effects (not exercised by these early-return tests,
// but mocked so nothing reaches the network).
jest.mock('../src/lib/crypto', () => ({ signClaimWithServerKey: jest.fn().mockResolvedValue('proof') }));
jest.mock('../src/services/entityDetector', () => ({ EntityDetector: { processClaimEntities: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../src/services/pipelineTrigger', () => ({ PipelineTrigger: { processClaim: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../src/services/atprotoPublisher', () => ({ AtprotoPublisher: { publishClaim: jest.fn().mockResolvedValue(undefined) } }));

import { createClaim, deleteClaim } from '../src/api/claims';
import { AuthRequest } from '../src/lib/auth';
import { prisma } from '../src/lib/prisma';

const ALICE = 'did:example:alice';
const BOB = 'did:example:bob';

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { json, status } as unknown as Response;
  return { res, json, status };
}

describe('deleteClaim (plain delete — media never deleted, auth-gated)', () => {
  it('400 on non-numeric id', async () => {
    const { res, status } = mockRes();
    const req = { params: { id: 'abc' }, headers: {}, user: { id: ALICE } } as unknown as AuthRequest;
    await deleteClaim(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('404 when the claim does not exist', async () => {
    (prisma.claim.findUnique as jest.Mock).mockResolvedValue(null);
    const { res, status } = mockRes();
    const req = { params: { id: '5' }, headers: {}, user: { id: ALICE } } as unknown as AuthRequest;
    await deleteClaim(req, res);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('403 when the requester is a different verified issuer', async () => {
    (prisma.claim.findUnique as jest.Mock).mockResolvedValue({ id: 5, issuerId: BOB });
    const { res, status, json } = mockRes();
    const req = { params: { id: '5' }, headers: {}, user: { id: ALICE } } as unknown as AuthRequest;
    await deleteClaim(req, res);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DELETE_FORBIDDEN' }));
    expect(prisma.claim.delete).not.toHaveBeenCalled();
  });

  it('403 when unauthenticated (self-asserted cannot delete)', async () => {
    (prisma.claim.findUnique as jest.Mock).mockResolvedValue({ id: 5, issuerId: ALICE });
    const { res, status } = mockRes();
    const req = { params: { id: '5' }, headers: {} } as unknown as AuthRequest; // no user, no api key
    await deleteClaim(req, res);
    expect(status).toHaveBeenCalledWith(403);
    expect(prisma.claim.delete).not.toHaveBeenCalled();
  });

  it('deletes claim + edges but NEVER touches media, on same-issuer delete', async () => {
    (prisma.claim.findUnique as jest.Mock).mockResolvedValue({ id: 5, issuerId: ALICE });
    (prisma.edge.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.claim.delete as jest.Mock).mockResolvedValue({ id: 5 });
    const { res, json } = mockRes();
    const req = { params: { id: '5' }, headers: {}, user: { id: ALICE } } as unknown as AuthRequest;
    await deleteClaim(req, res);

    expect(prisma.edge.deleteMany).toHaveBeenCalledWith({ where: { claimId: 5 } });
    expect(prisma.claim.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    // The invariant: media is never deleted.
    expect(prisma.image.deleteMany).not.toHaveBeenCalled();
    expect(prisma.image.updateMany).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, deletedClaimId: 5 }));
  });
});

describe('createClaim replace (replaceClaimId — auth-gated, media never deleted)', () => {
  const baseBody = { subject: 'https://example.org/thing', claim: 'RATED' };

  it('404 when replaceClaimId does not exist', async () => {
    (prisma.claim.findUnique as jest.Mock).mockResolvedValue(null);
    const { res, status } = mockRes();
    const req = { body: { ...baseBody, replaceClaimId: 999 }, headers: {}, user: { id: ALICE } } as unknown as AuthRequest;
    await createClaim(req, res);
    expect(status).toHaveBeenCalledWith(404);
    expect(prisma.image.deleteMany).not.toHaveBeenCalled();
  });

  it('400 when replaceClaimId is not an integer', async () => {
    const { res, status } = mockRes();
    const req = { body: { ...baseBody, replaceClaimId: 'xyz' }, headers: {}, user: { id: ALICE } } as unknown as AuthRequest;
    await createClaim(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('403 when the target claim belongs to a different issuer — media untouched', async () => {
    (prisma.claim.findUnique as jest.Mock).mockResolvedValue({ id: 7, issuerId: BOB });
    const { res, status, json } = mockRes();
    const req = { body: { ...baseBody, replaceClaimId: 7 }, headers: {}, user: { id: ALICE } } as unknown as AuthRequest;
    await createClaim(req, res);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'REPLACE_FORBIDDEN' }));
    // Never deleted the old claim's media (or the claim itself).
    expect(prisma.image.deleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('replace media carry-forward is per kind', () => {
  const PHOTO = { id: 11, metadata: { description: 'Photo of Alice' } };
  const VIDEO = { id: 12, metadata: { type: 'video' } };

  /** Run createClaim against a replace target owned by ALICE, with the old
   *  claim holding one photo and one video. Returns the ids carried forward. */
  async function carriedIdsFor(body: Record<string, unknown>) {
    jest.clearAllMocks();
    (prisma.claim.findUnique as jest.Mock).mockResolvedValue({ id: 7, issuerId: ALICE });
    const tx = {
      edge: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      claim: { delete: jest.fn().mockResolvedValue({ id: 7 }), create: jest.fn().mockResolvedValue({ id: 8 }) },
      image: {
        findMany: jest.fn().mockResolvedValue([PHOTO, VIDEO]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(tx));
    (prisma.image.create as jest.Mock).mockResolvedValue({ id: 13 });
    const { res } = mockRes();
    const req = {
      body: { subject: 'https://example.org/thing', claim: 'RATED', replaceClaimId: 7, ...body },
      headers: {},
      user: { id: ALICE },
    } as unknown as AuthRequest;
    await createClaim(req, res);
    const call = tx.image.updateMany.mock.calls[0];
    return call ? call[0].where.id.in : [];
  }

  it('keeps the photo when the replace adds only a video', async () => {
    expect(await carriedIdsFor({ videoUrl: 'https://cdn.example/v.webm' })).toEqual([PHOTO.id]);
  });

  it('keeps the video when the replace brings only a new photo', async () => {
    const images = [{
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      base64: Buffer.from('a-photo').toString('base64'),
      metadata: { description: 'New photo' },
      effectiveDate: '2026-08-05',
    }];
    expect(await carriedIdsFor({ images })).toEqual([VIDEO.id]);
  });

  it('carries both when the replace brings no media at all', async () => {
    expect(await carriedIdsFor({})).toEqual([PHOTO.id, VIDEO.id]);
  });
});
