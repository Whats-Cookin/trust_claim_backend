import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

// Get feed entries
export async function getFeed(req: Request, res: Response) {
  try {
    const { page = 1, limit = 50, filter, query, search } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const searchTerm = ((query || search) as string)?.trim();
    
    let claims: any[];
    let where: any;
    
    // If search term provided, use raw SQL for better performance
    if (searchTerm) {
      const searchQuery = `%${searchTerm}%`;
      
      // Build filter conditions for SQL
      let filterCondition = '';
      if (filter === 'ratings') {
        filterCondition = 'AND (c.stars IS NOT NULL OR c.score IS NOT NULL)';
      } else if (filter === 'credentials') {
        filterCondition = `AND c.claim = 'HAS' AND c.object ILIKE '%credential%'`;
      }
      
      claims = await prisma.$queryRaw<any[]>`
        SELECT DISTINCT ON (c.id)
          c.*,
          json_agg(DISTINCT e.*) as edges
        FROM "Claim" c
        LEFT JOIN "Edge" e ON c.id = e."claimId"
        WHERE c."effectiveDate" IS NOT NULL
          AND c.statement IS NOT NULL
          AND (
            c.subject ILIKE ${searchQuery} OR
            c.statement ILIKE ${searchQuery} OR
            c.object ILIKE ${searchQuery} OR
            c."sourceURI" ILIKE ${searchQuery} OR
            c.aspect ILIKE ${searchQuery}
          )
          ${Prisma.raw(filterCondition)}
        GROUP BY c.id
        ORDER BY c.id DESC, c."effectiveDate" DESC
        LIMIT ${limitNum}
        OFFSET ${(pageNum - 1) * limitNum}
      `;
      
      // Get edges with nodes for the claims
      const claimIds = claims.map(c => c.id);
      const edges = await prisma.edge.findMany({
        where: { claimId: { in: claimIds } },
        include: {
          startNode: true,
          endNode: true
        }
      });
      
      // Map edges to claims
      const edgesByClaimId = edges.reduce((acc, edge) => {
        if (!acc[edge.claimId]) acc[edge.claimId] = [];
        acc[edge.claimId].push(edge);
        return acc;
      }, {} as Record<number, typeof edges>);
      
      // Add edges to claims
      claims.forEach(claim => {
        claim.edges = edgesByClaimId[claim.id] || [];
      });
      
      // Continue with the same transformation logic below...
    } else {
      // Original logic for non-search queries
      where = {
        effectiveDate: { not: null },
        statement: { not: null }
      };
      
      // Add optional filters
      if (filter === 'ratings') {
        where.OR = [
          { stars: { not: null } },
          { score: { not: null } }
        ];
      } else if (filter === 'credentials') {
        where.claim = 'HAS';
        where.object = { contains: 'credential' };
      }
      
      // Get claims with their edges
      claims = await prisma.claim.findMany({
        where,
        orderBy: { effectiveDate: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          edges: {
            include: {
              startNode: true,
              endNode: true
            }
          }
        }
      });
    }
    
    // Transform to feed entries
    const entries = await Promise.all(claims.map(async claim => {
      // Get entity info for subject
      const subjectEntity = await prisma.uriEntity.findUnique({
        where: { uri: claim.subject }
      });
      
      // Get entity info for object (if exists)
      const objectEntity = claim.object ? await prisma.uriEntity.findUnique({
        where: { uri: claim.object }
      }) : null;
      
      return {
        id: claim.id,
        subject: {
          uri: claim.subject,
          name: subjectEntity?.name || claim.edges[0]?.startNode?.name || claim.subject,
          type: subjectEntity?.entityType || claim.edges[0]?.startNode?.entType,
          image: subjectEntity?.image || claim.edges[0]?.startNode?.image
        },
        claim: claim.claim,
        object: claim.object ? {
          uri: claim.object,
          name: objectEntity?.name || claim.edges[0]?.endNode?.name || claim.object,
          type: objectEntity?.entityType || claim.edges[0]?.endNode?.entType,
          image: objectEntity?.image || claim.edges[0]?.endNode?.image
        } : null,
        statement: claim.statement,
        effectiveDate: claim.effectiveDate,
        confidence: claim.confidence,
        sourceURI: claim.sourceURI,
        howKnown: claim.howKnown,
        // Include rating/measurement data if present
        ...(claim.stars && { stars: claim.stars }),
        ...(claim.score && { score: claim.score }),
        ...(claim.amt && { amount: claim.amt, unit: claim.unit }),
        ...(claim.aspect && { aspect: claim.aspect })
      };
    }));
    
    // Get total count for pagination
    let total: number;
    if (searchTerm) {
      const searchQuery = `%${searchTerm}%`;
      let filterCondition = '';
      if (filter === 'ratings') {
        filterCondition = 'AND (c.stars IS NOT NULL OR c.score IS NOT NULL)';
      } else if (filter === 'credentials') {
        filterCondition = `AND c.claim = 'HAS' AND c.object ILIKE '%credential%'`;
      }
      
      const countResult = await prisma.$queryRaw<[{count: bigint}]>`
        SELECT COUNT(DISTINCT c.id) as count
        FROM "Claim" c
        WHERE c."effectiveDate" IS NOT NULL
          AND c.statement IS NOT NULL
          AND (
            c.subject ILIKE ${searchQuery} OR
            c.statement ILIKE ${searchQuery} OR
            c.object ILIKE ${searchQuery} OR
            c."sourceURI" ILIKE ${searchQuery} OR
            c.aspect ILIKE ${searchQuery}
          )
          ${Prisma.raw(filterCondition)}
      `;
      total = Number(countResult[0].count);
    } else {
      total = await prisma.claim.count({ where });
    }
    
    res.json({ 
      entries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
}

// Get feed by entity type
export async function getFeedByEntityType(req: Request, res: Response) {
  try {
    const { entityType } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    
    // Get URIs for this entity type
    const entities = await prisma.uriEntity.findMany({
      where: { entityType: entityType as any },
      select: { uri: true }
    });
    
    const uris = entities.map(e => e.uri);
    
    // Get claims about these entities
    const claims = await prisma.claim.findMany({
      where: {
        OR: [
          { subject: { in: uris } },
          { object: { in: uris } }
        ],
        effectiveDate: { not: null }
      },
      orderBy: { effectiveDate: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    // Transform to feed entries (reuse logic from getFeed)
    const entries = await Promise.all(claims.map(async claim => {
      const subjectEntity = await prisma.uriEntity.findUnique({
        where: { uri: claim.subject }
      });
      
      const objectEntity = claim.object ? await prisma.uriEntity.findUnique({
        where: { uri: claim.object }
      }) : null;
      
      return {
        id: claim.id,
        subject: {
          uri: claim.subject,
          name: subjectEntity?.name || claim.subject,
          type: subjectEntity?.entityType,
          image: subjectEntity?.image
        },
        claim: claim.claim,
        object: claim.object ? {
          uri: claim.object,
          name: objectEntity?.name || claim.object,
          type: objectEntity?.entityType,
          image: objectEntity?.image
        } : null,
        statement: claim.statement,
        effectiveDate: claim.effectiveDate,
        confidence: claim.confidence,
        sourceURI: claim.sourceURI
      };
    }));
    
    res.json({
      entries,
      entityType,
      pagination: {
        page: pageNum,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching feed by entity type:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
}

// Get trending topics/claims
export async function getTrending(req: Request, res: Response) {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    if (period === '24h') {
      startDate.setDate(now.getDate() - 1);
    } else if (period === '7d') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(now.getDate() - 30);
    }
    
    // Get claim counts by subject
    const trending = await prisma.claim.groupBy({
      by: ['subject'],
      where: {
        effectiveDate: {
          gte: startDate,
          lte: now
        }
      },
      _count: {
        subject: true
      },
      orderBy: {
        _count: {
          subject: 'desc'
        }
      },
      take: 20
    });
    
    // Enhance with entity info
    const enhanced = await Promise.all(trending.map(async item => {
      const entity = await prisma.uriEntity.findUnique({
        where: { uri: item.subject }
      });
      
      const node = await prisma.node.findFirst({
        where: { nodeUri: item.subject }
      });
      
      return {
        uri: item.subject,
        count: item._count.subject,
        name: entity?.name || node?.name || item.subject,
        type: entity?.entityType || node?.entType,
        image: entity?.image || node?.image
      };
    }));
    
    res.json({
      trending: enhanced,
      period,
      startDate,
      endDate: now
    });
  } catch (error) {
    console.error('Error fetching trending:', error);
    res.status(500).json({ error: 'Failed to fetch trending' });
  }
}
