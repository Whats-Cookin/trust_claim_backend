import { Request, Response } from "express";
import { prisma } from "../../src/db/prisma";
import { claimGet } from "../../src/controllers/api.controller";


// Mock the request and response objects
const req = {
  query: {
    search: "foo",
    page: "1",
    limit: "10",
  },
  params: {},
} as unknown as Request;


const res = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
} as unknown as Response;

// Mock the Prisma client methods
jest.mock("../../src/db/prisma", () => ({
  prisma: {
    claim: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe("claimGet", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  //return search

  it("returns a filtered list of claims", async () => {
    const mockClaims = [
      { id: 1, subject: "foo", object: "bar" },
      { id: 2, subject: "baz", object: "foo" },
    ];
    const mockCount = 2;

    (prisma.claim.findMany as jest.Mock).mockResolvedValueOnce(mockClaims);
    (prisma.claim.count as jest.Mock).mockResolvedValueOnce(mockCount);

    await claimGet(req, res, jest.fn());

    expect(prisma.claim.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { subject: { contains: "foo", mode: "insensitive" } },
          { object: { contains: "foo", mode: "insensitive" } },
        ],
      },
      skip: 0,
      take: 10,
    });

    expect(prisma.claim.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { subject: { contains: "foo", mode: "insensitive" } },
          { object: { contains: "foo", mode: "insensitive" } },
        ],
      },
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      claims: mockClaims,
      count: mockCount,
    });


  });
  
});
