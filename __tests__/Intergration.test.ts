import request from 'supertest';
import { app } from '../src';
import { prisma } from "../src/db/prisma";
import jwt from "jsonwebtoken";


describe("Intergration tests", ()=>{
  describe('POST /claims', () => {
    let token: string;
  
    beforeAll(() => {
      // Generate a JWT token for testing
      token = jwt.sign({ aud: 1234 }, process.env.ACCESS_SECRET as string);
    });
    
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
          .post('/api/claim').set('Authorization', `Bearer ${token}`)
          .send(newClaim);
    
        // Verify that the response status is 201 Created
        expect(response.status).toBe(201);
    
        // Verify that the response body matches the expected claimData
        expect(response.body.subject).toBe(newClaim.subject);
        expect(response.body.claim).toBe(newClaim.claim);
      }, 10000);
    });
  });
  
  // claimGet function
  describe("GET /claims", () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });
  
    it("should get all claims if no query params provided", async () => {
      const response = await request(app).get("/api/claim");
  
      expect(response.status).toBe(201);
      expect(response.body.claims.length).toBeGreaterThan(0);
      expect(response.body.count).toBeGreaterThan(0);
    });
    
    it('should return a specific claim if claimId is provided', async () => {
      const claim = await prisma.claim.findFirst();
  
      const claimWithDates = Object.assign({}, claim, {
        createdAt: "2023-03-12T22:55:40.604Z",
        lastUpdatedAt: "2023-03-12T22:55:40.604Z"
      });
      const response = await request(app).get(`/api/claim/${claim?.id}`);
      expect(response.status).toBe(201);
      expect(response.body).toEqual(claimWithDates);
    });
  
  
   it("should return filtered claims if search query is provided", async () => {
      const searchQuery = "claim";
      const response = await request(app).get(`/api/claim?search=${searchQuery}`);
      expect(response.status).toBe(201);
      expect(response.body.claims.length).toBeGreaterThan(0);
      expect(response.body.count).toBeGreaterThan(0);
    });
    
  
    it("should return 404 if claim with provided id does not exist", async () => {
      const nonExistentClaimId = 999;
  
      const response = await request(app).get(`/api/claims/${nonExistentClaimId}`);
  
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Not Found");
    });
  });


});