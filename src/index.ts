import express, { RequestHandler } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger';
import { initializeServerKeys, getServerPublicKey } from './lib/crypto';

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
import * as videoApi from './api/video/upload';
import { verifyLinkedInAge } from './api/linkedin/verifyAge';

// Import Swagger documentation
import './api/swagger-docs';

// Initialize server keys on startup
initializeServerKeys();

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

// Debug route - REMOVE IN PRODUCTION
app.get('/debug/routes', (_req, res) => {
  const routes: any[] = [];
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    }
  });
  res.json({ routes: routes.filter(r => r.path.includes('auth')) });
});

// API Routes

// Auth endpoints
console.log('AUTH API:', Object.keys(authApi));
console.log('Has googleAuth?', typeof authApi.googleAuth);
app.post('/auth/login', authApi.login);
app.post('/auth/signup', authApi.register);  // 'signup' maps to 'register'
app.post('/auth/refresh_token', authApi.refreshToken);
app.post('/auth/google', authApi.googleAuth);
app.post('/auth/github', authApi.githubAuth);
app.post('/auth/linkedin', authApi.linkedinAuth);
app.post('/auth/wallet', authApi.walletAuth);

// LinkedIn verification endpoints
app.post('/api/linkedin/verify-age', verifyLinkedInAge);

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
app.get('/api/v4/claims/subject/:uri(*)', claimsApi.getClaimsBySubject);
app.get('/api/claims/subject/:uri(*)', claimsApi.getClaimsBySubject);

// Credentials endpoints
app.post('/api/v4/credentials', verifyToken, credentialsApi.submitCredential);
app.post('/api/credentials', verifyToken, credentialsApi.submitCredential);
app.get('/api/v4/credentials/:uri(*)', credentialsApi.getCredential);
app.get('/api/credentials/:uri(*)', credentialsApi.getCredential);

// Credential admin endpoints
app.post('/api/credentials/admin/create', verifyToken, credentialAdminApi.createCredentialForAssignment);
app.get('/api/credentials/templates', credentialAdminApi.getCredentialTemplates);

// Graph endpoints - claim-based exploration
app.get('/api/claim_graph/:claimId', graphApi.getClaimGraph);  // Main graph endpoint
app.get('/api/v4/claim_graph/:claimId', graphApi.getClaimGraph);
app.get('/api/graph/:uri(*)', graphApi.getGraph);  // Backwards compatibility
app.get('/api/v4/graph/:uri(*)', graphApi.getGraph);

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
app.get('/api/v4/reports/entity/:uri(*)', reportApi.getEntityReport);
app.get('/api/reports/entity/:uri(*)', reportApi.getEntityReport);

// Server key endpoint
app.get('/api/keys/server', (_req, res) => {
  res.json(getServerPublicKey());
});

// Video upload endpoints
app.post('/api/video/upload-url', verifyToken, videoApi.getVideoUploadUrl);
app.post('/api/video/confirm', verifyToken, videoApi.confirmVideoUpload);
app.get('/api/video/claim/:claimId', videoApi.getClaimVideos);
app.delete('/api/video/:videoId', verifyToken, videoApi.deleteVideo);

// Video config check endpoint (for debugging)
app.get('/api/video/config', (_req, res) => {
  const config = videoApi.checkVideoConfig();
  if (config.configured) {
    res.json({ status: 'configured' });
  } else {
    res.status(500).json({ 
      status: 'not configured', 
      missing: config.missing,
      message: 'Video upload requires DigitalOcean Spaces configuration' 
    });
  }
});

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
