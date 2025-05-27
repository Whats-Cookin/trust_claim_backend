import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LinkedTrust Backend API',
      version,
      description: 'API documentation for LinkedTrust backend with both legacy (v3) and modern (v4) endpoints',
      contact: {
        name: 'LinkedTrust Team',
        url: 'https://linkedtrust.us',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://dev.linkedtrust.us',
        description: 'Development server',
      },
      {
        url: 'https://live.linkedtrust.us',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Authorization header using the Bearer scheme',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              description: 'JWT access token',
            },
            refreshToken: {
              type: 'string',
              description: 'JWT refresh token',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            email: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            profileImage: {
              type: 'string',
              nullable: true,
            },
          },
        },
        HowKnown: {
          type: 'string',
          enum: [
            'FIRST_HAND',
            'SECOND_HAND',
            'WEB_DOCUMENT',
            'VERIFIED_LOGIN',
            'BLOCKCHAIN',
            'SIGNED_DOCUMENT',
            'PHYSICAL_DOCUMENT',
            'INTEGRATION',
            'RESEARCH',
            'OPINION',
            'OTHER',
          ],
        },
        ClaimV3Input: {
          type: 'object',
          required: ['subject', 'claim', 'name'],
          properties: {
            subject: {
              type: 'string',
              description: 'URI of the subject',
            },
            claim: {
              type: 'string',
              description: 'Type of claim',
            },
            name: {
              type: 'string',
              description: 'Name or title of the claim',
            },
            object: {
              type: 'string',
              nullable: true,
              description: 'Object of the claim',
            },
            statement: {
              type: 'string',
              nullable: true,
            },
            aspect: {
              type: 'string',
              nullable: true,
            },
            amount: {
              type: 'integer',
              nullable: true,
              description: 'Amount (maps to amt in v4)',
            },
            rating: {
              type: 'number',
              nullable: true,
              description: 'Rating score (maps to score in v4)',
            },
            stars: {
              type: 'integer',
              nullable: true,
              minimum: 1,
              maximum: 5,
            },
            howKnown: {
              $ref: '#/components/schemas/HowKnown',
            },
            how_known: {
              $ref: '#/components/schemas/HowKnown',
              description: 'Alternative field name for howKnown',
            },
            sourceURI: {
              type: 'string',
              nullable: true,
            },
            source_uri: {
              type: 'string',
              nullable: true,
              description: 'Alternative field name for sourceURI',
            },
            effectiveDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            effective_date: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Alternative field name for effectiveDate',
            },
            confidence: {
              type: 'number',
              nullable: true,
              minimum: 0,
              maximum: 1,
            },
            claimAddress: {
              type: 'string',
              nullable: true,
            },
          },
        },
        ClaimV3Response: {
          type: 'object',
          properties: {
            claimId: {
              type: 'integer',
            },
            claim_id: {
              type: 'integer',
            },
            subject: {
              type: 'string',
            },
            claim: {
              type: 'string',
            },
            object: {
              type: 'string',
              nullable: true,
            },
            source_uri: {
              type: 'string',
              nullable: true,
            },
            how_known: {
              type: 'string',
              nullable: true,
            },
            confidence: {
              type: 'number',
              nullable: true,
            },
            statement: {
              type: 'string',
              nullable: true,
            },
            aspect: {
              type: 'string',
              nullable: true,
            },
            stars: {
              type: 'integer',
              nullable: true,
            },
            rating: {
              type: 'number',
              nullable: true,
            },
            amount: {
              type: 'integer',
              nullable: true,
            },
            unit: {
              type: 'string',
              nullable: true,
            },
            effective_date: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            issuer_id: {
              type: 'string',
              nullable: true,
            },
            issuer_id_type: {
              type: 'string',
              nullable: true,
            },
            claim_address: {
              type: 'string',
              nullable: true,
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            last_updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        ClaimV4Input: {
          type: 'object',
          required: ['subject', 'claim'],
          properties: {
            subject: {
              type: 'string',
              description: 'URI of the subject',
            },
            claim: {
              type: 'string',
              description: 'Type of claim',
            },
            object: {
              type: 'string',
              nullable: true,
            },
            statement: {
              type: 'string',
              nullable: true,
            },
            aspect: {
              type: 'string',
              nullable: true,
            },
            amt: {
              type: 'integer',
              nullable: true,
            },
            score: {
              type: 'number',
              nullable: true,
            },
            stars: {
              type: 'integer',
              nullable: true,
              minimum: 1,
              maximum: 5,
            },
            howKnown: {
              $ref: '#/components/schemas/HowKnown',
            },
            sourceURI: {
              type: 'string',
              nullable: true,
            },
            effectiveDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            confidence: {
              type: 'number',
              nullable: true,
              minimum: 0,
              maximum: 1,
            },
          },
        },
        Credential: {
          type: 'object',
          properties: {
            '@context': {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            type: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            issuer: {
              type: 'string',
            },
            issuanceDate: {
              type: 'string',
              format: 'date-time',
            },
            credentialSubject: {
              type: 'object',
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication endpoints',
      },
      {
        name: 'Claims (Legacy v3)',
        description: 'Legacy claim endpoints for backward compatibility',
      },
      {
        name: 'Claims (v4)',
        description: 'Modern claim management endpoints',
      },
      {
        name: 'Credentials',
        description: 'Credential submission and retrieval',
      },
      {
        name: 'Graph',
        description: 'Trust graph queries',
      },
      {
        name: 'Feed',
        description: 'Activity feed endpoints',
      },
      {
        name: 'Reports',
        description: 'Reporting and validation endpoints',
      },
    ],
  },
  apis: ['./src/api/*.ts', './src/index.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);
