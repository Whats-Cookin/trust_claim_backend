import { Request, Response } from 'express';
import { getFeed } from '../src/api/feed';

// Mock the prisma module
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    claim: {
      findMany: jest.fn(),
      count: jest.fn()
    },
    uriEntity: {
      findUnique: jest.fn()
    },
    edge: {
      findMany: jest.fn()
    },
    $queryRaw: jest.fn()
  }
}));

import { prisma } from '../src/lib/prisma';

describe('Feed Search Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseData: any;
  let statusCode: number;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock response
    responseData = null;
    statusCode = 200;
    mockResponse = {
      json: jest.fn((data) => {
        responseData = data;
        return mockResponse as Response;
      }),
      status: jest.fn((code) => {
        statusCode = code;
        return mockResponse as Response;
      })
    };
  });

  describe('GET /api/feed without search', () => {
    it('should return feed entries', async () => {
      mockRequest = {
        query: { page: '1', limit: '50' }
      };

      // Mock data
      const mockClaims = [
        {
          id: 1,
          subject: 'https://example.com/user1',
          claim: 'HAS_SKILL',
          object: 'JavaScript',
          statement: 'Expert in JavaScript',
          effectiveDate: new Date(),
          confidence: 0.9,
          sourceURI: 'https://example.com',
          howKnown: 'FIRST_HAND',
          stars: 5,
          edges: []
        }
      ];

      // Setup mocks
      (prisma.claim.findMany as jest.Mock).mockResolvedValue(mockClaims);
      (prisma.claim.count as jest.Mock).mockResolvedValue(1);
      (prisma.uriEntity.findUnique as jest.Mock).mockResolvedValue(null);

      // Call the function
      await getFeed(mockRequest as Request, mockResponse as Response);

      // Verify response
      expect(statusCode).toBe(200);
      expect(responseData).toHaveProperty('entries');
      expect(responseData).toHaveProperty('pagination');
      expect(responseData.entries).toHaveLength(1);
      expect(responseData.pagination.total).toBe(1);
    });
  });

  describe('GET /api/feed with search', () => {
    it('should use raw SQL query when search term is provided', async () => {
      mockRequest = {
        query: { page: '1', limit: '50', query: 'test' }
      };

      // Mock SQL query results
      const mockSqlResults = [
        {
          id: 1,
          subject: 'https://example.com/user1',
          claim: 'HAS_SKILL',
          object: 'Testing',
          statement: 'Expert in test automation',
          effectiveDate: new Date(),
          confidence: 0.9,
          sourceURI: 'https://example.com',
          howKnown: 'FIRST_HAND',
          edges: []
        }
      ];

      // Setup mocks
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce(mockSqlResults)  // First call for claims
        .mockResolvedValueOnce([{ count: BigInt(1) }]);  // Second call for count
      (prisma.edge.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.uriEntity.findUnique as jest.Mock).mockResolvedValue(null);

      // Call the function
      await getFeed(mockRequest as Request, mockResponse as Response);

      // Verify that raw SQL was used
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(statusCode).toBe(200);
      expect(responseData.entries).toHaveLength(1);
    });

    it('should handle empty search results', async () => {
      mockRequest = {
        query: { page: '1', limit: '50', query: 'nonexistent' }
      };

      // Mock empty results
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])  // First call for claims
        .mockResolvedValueOnce([{ count: BigInt(0) }]);  // Second call for count
      (prisma.edge.findMany as jest.Mock).mockResolvedValue([]);

      // Call the function
      await getFeed(mockRequest as Request, mockResponse as Response);

      // Verify response
      expect(statusCode).toBe(200);
      expect(responseData.entries).toHaveLength(0);
      expect(responseData.pagination.total).toBe(0);
    });

    it('should support both query and search parameters', async () => {
      const mockResults = [{ id: 1, subject: 'test', edges: [] }];
      (prisma.edge.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.uriEntity.findUnique as jest.Mock).mockResolvedValue(null);

      // Test with 'query' parameter
      mockRequest = { query: { query: 'test' } };
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce(mockResults)
        .mockResolvedValueOnce([{ count: BigInt(1) }]);
      
      await getFeed(mockRequest as Request, mockResponse as Response);
      expect(prisma.$queryRaw).toHaveBeenCalled();

      jest.clearAllMocks();

      // Test with 'search' parameter
      mockRequest = { query: { search: 'test' } };
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce(mockResults)
        .mockResolvedValueOnce([{ count: BigInt(1) }]);
      
      await getFeed(mockRequest as Request, mockResponse as Response);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockRequest = {
        query: { page: '1', limit: '50' }
      };

      // Mock database error
      (prisma.claim.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Call the function
      await getFeed(mockRequest as Request, mockResponse as Response);

      // Verify error response
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Failed to fetch feed' });
    });
  });
});
