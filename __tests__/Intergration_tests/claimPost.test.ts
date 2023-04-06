import request from 'supertest';
import { app } from '../../src';
import { prisma } from "../../src/db/prisma";

describe('POST /claims', () => {
 
  describe('claimPost', () => {
    afterAll(async () => {
      // Disconnect Prisma client after all tests
      await prisma.$disconnect();
    });
  
    it('should create a new claim', async () => {
      const newClaim = {
        subject: 'Test Claim',
        claim: 'This is a test claim',
      };
  
      const response = await request(app)
        .post('/api/claim')
        .send(newClaim);
  
      // Verify that the response status is 201 Created
      expect(response.status).toBe(201);
  
      // Verify that the response body matches the expected claimData
      expect(response.body.subject).toBe(newClaim.subject);
      expect(response.body.claim).toBe(newClaim.claim);
    });
  });
});





