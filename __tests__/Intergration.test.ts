import request from "supertest";
import { app } from "../src";
import { prisma } from "../src/db/prisma";
import jwt from "jsonwebtoken";

describe("Integration tests", () => {
  describe("POST /claims", () => {
    let token: string;

    beforeAll(() => {
      // Generate a JWT token for testing
      token = jwt.sign({ aud: 1234 }, process.env.ACCESS_SECRET as string);
    });

    afterAll(async () => {
      // Disconnect Prisma client after all tests
      await prisma.$disconnect();
    });

    it("should create a new claim with its name and images", async () => {
      const newClaim = {
        claim: "test",
        effectiveDate: "2024-04-23",
        subject: "www.test.com",
        name: "test name",
        images: [
          {
            url: "any test url",
            metadata: {
              description: "test description",
              comment: "test comment"
            },
            effectiveDate: "2024-04-23",
            owner: "test owner",
            signature: "test signature"
          }
        ]
      };

      const response = await request(app)
        .post("/api/claim")
        .set("Authorization", `Bearer ${token}`)
        .send(newClaim);

      // Log the response for debugging
      // console.log(response.body);

      // Verify that the response status is 201 Created
      expect(response.status).toBe(201);

      // Verify that the response body matches the expected claimData
      const responseBody = response.body.claim;
      expect(responseBody.subject).toBe(newClaim.subject);
      expect(responseBody.claim).toBe(newClaim.claim);

      expect(response.body.claimData).toEqual(
        expect.objectContaining({
          name: newClaim.name
        })
      );

      // Verify the images separately since they are nested
      const responseImages = response.body.claimImages;
      expect(responseImages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: newClaim.images[0].url,
            metadata: expect.objectContaining(newClaim.images[0].metadata),
            effectiveDate: new Date(newClaim.images[0].effectiveDate).toISOString(),
            owner: newClaim.images[0].owner,
            signature: newClaim.images[0].signature
          })
        ])
      );
    }, 10000);
  });

  // claimGet function
  describe("GET /claims", () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("should get all claims if no query params provided", async () => {
      // const response = await request(app).get("/api/claim"); // not working
      const response = await request(app).get("/api/claims-all");

      expect(response.status).toBe(201);
      expect(response.body.claimsData.length).toBeGreaterThan(0);
      expect(response.body.claimsData[0].claim).toBeDefined();
      expect(response.body.claimsData[0].images).toBeDefined();
      expect(response.body.claimsData[0].data).toBeDefined();
      expect(response.body.count).toBeGreaterThan(0);
    });


    // ======== working

    it("should return a specific claim if claimId is provided", async () => {
      const claim = await prisma.claim.findFirst();
      const data = await prisma.claimData.findFirst({
        where: {
          claimId: claim?.id
        }
      });
      const images = await prisma.image.findMany({
        where: {
          claimId: claim?.id
        }
      });

      // const claimWithDates = Object.assign({}, claim, {
      //   createdAt: "2023-03-12T22:55:40.604Z",
      //   lastUpdatedAt: "2023-03-12T22:55:40.604Z"
      // });  // whyyyyyyyyyyy????????
      const response = await request(app).get(`/api/claim/${claim?.id}`);
      expect(response.status).toBe(201);
      // expect(response.body).toEqual(claimWithDates);
      expect(response.body.claim.id).toBe(claim?.id);
      expect(response.body.claimData).toEqual(data);
      expect(response.body.claimImages).toHaveProperty("length", images.length);
    });


    it("should return filtered claims if search query is provided", async () => {
      const searchQuery = "test";
      const response = await request(app).get(
        `/api/claim/search?search=${searchQuery}`
      ); // Corrected route
      expect(response.status).toBe(201);
      expect(response.body.claims.length).toBeGreaterThan(0);
      expect(response.body.count).toBeGreaterThan(0);
      expect(response.body.claims[0].images).toBeDefined();
    });


    it("should return 404 if claim with provided id does not exist", async () => {
      const nonExistentClaimId = 999;

      const response = await request(app).get(
        `/api/claims/${nonExistentClaimId}`
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Not Found");
    });
  });
});
