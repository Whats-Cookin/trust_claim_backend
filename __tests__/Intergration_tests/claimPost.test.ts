import request from "supertest";
import { app } from "../../src/index";
import { prismaMock } from "../../singleton";
import jwt from 'jsonwebtoken';

const generateToken = () => {
  const payload = { userId: 1 };
  const secret = process.env.ACCESS_SECRET as string;
  const options = { expiresIn: '1h' };
  const token = jwt.sign(payload, secret, options);
  return token;
};

const fakeJwtToken = generateToken();

describe("claimPost", () => {
  let server: import("http").Server;

  beforeAll(async () => {
    // Create a test database
    await prismaMock.$connect();
    await prismaMock.$queryRaw`CREATE DATABASE tests;`;
    await prismaMock.$disconnect();

    // Connect to the test database
    process.env.TEST_DATABASE_URL = "postgresql://localhost:5432/tests";

    // Seed the test database with initial data
    await prismaMock.claim.create({
      data: {
        issuerId: "http://trustclaims.whatscookin.us/users/1",
        issuerIdType: "URL",
        subject: "https://www.bcorporation.net/",
        claim: "rated",
      },
    });

    // Start the test server
    server = app.listen(9001, async () => {
      console.log(`Listening to requests in port - ${9001}`);
    });
  }, 10000);

  afterAll(async () => {
    await prismaMock.$connect();
    await prismaMock.$queryRaw`DROP DATABASE tests;`;
    await prismaMock.$disconnect();

    if (server) {
      server.close();
    }
  });

  it("creates a claim", async () => {
    
    const response = await request(server)
      .post("/claim")
      .send({ subject: "https://www.bcorporation.net/", claim: "rated" })
      .set("Authorization", `Bearer ${fakeJwtToken}`);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("id");
    expect(typeof response.body.id).toBe("number");

    const claim = await prismaMock.claim.findUnique({
      where: { id: response.body.id },
    });
    
    expect(claim).not.toBeNull();
    expect(claim?.subject).toBe("https://www.bcorporation.net/");
    expect(claim?.claim).toBe("rated");
  });

  it('should handle errors and return them', async () => {
    const response = await request(app)
      .post('/api/claim')
      .send({
        // invalid data
        subject: 'sample',
        object: 'fox news',
        claim: 'rated',
      })
      .set('Authorization', `Bearer ${fakeJwtToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid data');
  });

});




