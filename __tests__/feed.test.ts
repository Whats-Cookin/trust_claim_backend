import request from "supertest";
import express from "express";
import { getFeed } from "../src/api/feed";

// Create a test app
const app = express();
app.use(express.json());
app.get("/api/feed", getFeed);

describe("Feed Search Tests", () => {
  describe("GET /api/feed", () => {
    it("should return feed without search", async () => {
      const response = await request(app).get("/api/feed");
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("entries");
      expect(response.body).toHaveProperty("pagination");
      expect(Array.isArray(response.body.entries)).toBe(true);
    });

    it("should return filtered results when search query is provided", async () => {
      const response = await request(app).get("/api/feed?query=test");
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("entries");
      expect(response.body).toHaveProperty("pagination");
      // All results should contain 'test' in one of the searchable fields
      if (response.body.entries.length > 0) {
        response.body.entries.forEach((entry: any) => {
          const hasMatch = 
            entry.statement?.toLowerCase().includes('test') ||
            entry.subject?.uri?.toLowerCase().includes('test') ||
            entry.object?.uri?.toLowerCase().includes('test') ||
            entry.sourceURI?.toLowerCase().includes('test') ||
            entry.aspect?.toLowerCase().includes('test');
          expect(hasMatch).toBe(true);
        });
      }
    });

    it("should handle empty search results gracefully", async () => {
      // Search for something unlikely to exist
      const response = await request(app).get("/api/feed?query=xyzxyzxyz123456789");
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("entries");
      expect(response.body.entries).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it("should support both query and search parameters", async () => {
      const response1 = await request(app).get("/api/feed?query=test");
      const response2 = await request(app).get("/api/feed?search=test");
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      // Both should return the same results
      expect(response1.body.pagination.total).toBe(response2.body.pagination.total);
    });
  });
});
