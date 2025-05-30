import express, { RequestHandler } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger';

// Load environment variables
dotenv.config();

// Import middleware
import { verifyToken } from './lib/auth';

// Import API routes
import * as claimsApi from './api/claims';
import * as credentialsApi from './api/credentials';
import * as credentialAdminApi from './api/credentialAdmin';
import * as graphApi from './api/graph';
import * as feedApi from './api/feed';
import * as reportApi from './api/report';
import * as authApi from './api/authApi';
import * as legacyClaimsApi from './api/legacyClaims';

// Import Swagger documentation
import './api/swagger-docs';

// Create Express app
const app = express();

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Swagger documentation with error handling
try {
  const swaggerMiddleware = (swaggerUi.serve as unknown) as RequestHandler[];
  const swaggerHandler = (swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'LinkedTrust API Documentation',
  }) as unknown) as RequestHandler;
  
  app.use('/api/docs', swaggerMiddleware);
  app.get('/api/docs', swaggerHandler);
} catch (error) {
  console.error('Error setting up Swagger UI:', error);
  app.get('/api/docs', (_req, res) => {
    res.status(500).json({ error: 'API documentation temporarily unavailable' });
  });
}

// Serve Swagger JSON
app.get('/api/docs.json', (_req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  } catch (error) {
    console.error('Error serving Swagger JSON:', error);
    res.status(500).json({ error: 'API documentation JSON temporarily unavailable' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes

// Auth endpoints
app.post('/auth/login', authApi.login);
app.post('/auth/signup', authApi.register);  // 'signup' maps to 'register'
app.post('/auth/refresh_token', authApi.refreshToken);

// Legacy claim endpoints (v3 compatibility)
app.post('/api/claim', verifyToken, legacyClaimsApi.createClaimV3);          // LEGACY: Create one claim (v3 format)
app.post('/api/claim/v2', verifyToken, (legacyClaimsApi.createClaimV3WithImages[0] as RequestHandler), (legacyClaimsApi.createClaimV3WithImages[1] as RequestHandler));
app.get('/api/claim/:id', legacyClaimsApi.getClaimV3);
app.get('/api/claim', legacyClaimsApi.getClaimsV3);

// Modern v4 endpoints
// Claims endpoints
app.post('/api/v4/claims', verifyToken, claimsApi.createClaim);
app.post('/api/claims', verifyToken, claimsApi.createClaim);     // MODERN: Create one claim (v4 format)
app.get('/api/v4/claims/:id', claimsApi.getClaim);
app.get('/api/claims/:id', claimsApi.getClaim);
app.get('/api/v4/claims/subject/:uri', claimsApi.getClaimsBySubject);
app.get('/api/claims/subject/:uri', claimsApi.getClaimsBySubject);

// Credentials endpoints
app.post('/api/v4/credentials', verifyToken, credentialsApi.submitCredential);
app.post('/api/credentials', verifyToken, credentialsApi.submitCredential);
app.get('/api/v4/credentials/:uri', credentialsApi.getCredential);
app.get('/api/credentials/:uri', credentialsApi.getCredential);

// Credential admin endpoints
app.post('/api/credentials/admin/create', verifyToken, credentialAdminApi.createCredentialForAssignment);
app.get('/api/credentials/templates', credentialAdminApi.getCredentialTemplates);

// Graph endpoints - claim-based exploration
app.get('/api/claim_graph/:claimId', graphApi.getClaimGraph);  // Main graph endpoint
app.get('/api/v4/claim_graph/:claimId', graphApi.getClaimGraph);
app.get('/api/graph/:uri', graphApi.getGraph);  // Backwards compatibility
app.get('/api/v4/graph/:uri', graphApi.getGraph);

// Node endpoints
app.get('/api/node/:nodeId', graphApi.getNodeById);
app.get('/api/v4/node/:nodeId', graphApi.getNodeById);
app.get('/api/node/search', graphApi.searchNodes);
app.get('/api/v4/node/search', graphApi.searchNodes);

// Node expansion endpoint
app.get('/api/node/:nodeId/expand', graphApi.expandNode);
app.get('/api/v4/node/:nodeId/expand', graphApi.expandNode);

// Deprecated full graph endpoints
app.get('/api/v4/graph', graphApi.getFullGraph);
app.get('/api/graph', graphApi.getFullGraph);

// Feed endpoints
app.get('/api/v4/feed', feedApi.getFeed);
app.get('/api/feed', feedApi.getFeed);
app.get('/api/v4/feed/entity/:entityType', feedApi.getFeedByEntityType);
app.get('/api/feed/entity/:entityType', feedApi.getFeedByEntityType);
app.get('/api/v4/feed/trending', feedApi.getTrending);
app.get('/api/feed/trending', feedApi.getTrending);

// Report endpoints
app.get('/api/v4/reports/claim/:claimId', reportApi.getClaimReport);
app.get('/api/reports/claim/:claimId', reportApi.getClaimReport);
app.post('/api/v4/reports/claim/:claimId/validate', verifyToken, reportApi.submitValidation);
app.post('/api/reports/claim/:claimId/validate', verifyToken, reportApi.submitValidation);
app.get('/api/v4/reports/entity/:uri', reportApi.getEntityReport);
app.get('/api/reports/entity/:uri', reportApi.getEntityReport);

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Trust Claims backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
