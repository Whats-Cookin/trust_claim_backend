import { Request, Response } from "express";
import { prisma } from "../../src/db/prisma";
// import { turnFalsyPropsToUndefined } from "../src/utils";
import { claimPost } from "../../src/controllers/api.controller";

// Mock the request and response objects
const req = {
  body: { foo: "bar" },
  userId: 123,
} as unknown as Request;

const res = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
} as unknown as Response;

// Mock prisma client
jest.mock("../../src/db/prisma", () => ({
  prisma: {
    claim: {
      create: jest.fn(),
    },
  },
}));

describe("claimPost", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // create a claim
  it("creates a claim", async () => {
    (prisma.claim.create as jest.Mock).mockResolvedValueOnce({ id: 1 });

    await claimPost(req, res, jest.fn());

    expect(prisma.claim.create).toHaveBeenCalledWith({
      data: {
        userId: 123,
        issuerId: "http://trustclaims.whatscookin.us/users/123",
        issuerIdType: "URL",
        foo: "bar",
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 1 });
  });

  // handle error
  it("handles errors", async () => {
    const error = new Error("Something went wrong");
    (prisma.claim.create as jest.Mock).mockRejectedValueOnce(error);

    const next = jest.fn();
    await claimPost(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

