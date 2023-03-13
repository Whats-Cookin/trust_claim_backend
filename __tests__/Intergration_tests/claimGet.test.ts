import request from 'supertest';
import { prismaMock } from "../../singleton";
import { app } from '../../src';

describe('claimGet', () => {
  afterAll(async () => {
    await prismaMock.$disconnect();
  });

  it('should return all claims if no search query is provided', async () => {
    const response = await request(app).get('/api/claim/');
    expect(response.status).toBe(201);
    expect(response.body.claims.length).toBeGreaterThan(0);
    expect(response.body.count).toBeGreaterThan(0);
  });

  it('should return filtered claims if search query is provided', async () => {
    const response = await request(app).get('/api/claim/search?=""');
    expect(response.status).toBe(201);
    expect(response.body.claims.length).toBeGreaterThan(0);
    expect(response.body.count).toBeGreaterThan(0);
    expect(response.body.claims.every((claim: { subject: string | string[]; object: string | string[]; }) => claim.subject.includes('test') || claim.object.includes('test'))).toBe(true);
  });

  it('should return a specific claim if claimId is provided', async () => {
    const claim = await prismaMock.claim.findFirst();
    const response = await request(app).get(`/api/claim/${claim?.id}`);
    expect(response.status).toBe(201);
    expect(response.body).toEqual(claim);
  });

  it('should return 404 if claimId is not found', async () => {
    const response = await request(app).get(`/api/claim/12345`);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Claim does not exist");
  });
});
