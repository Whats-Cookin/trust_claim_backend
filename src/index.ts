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
import { AtprotoIndexer } from './services/atprotoIndexer';

// Load environment variables
dotenv.config();

// Import middleware
import { verifyToken, optionalToken } from './lib/auth';

// Import API routes
import * as claimsApi from './api/claims';
import * as credentialsApi from './api/credentials';
import * as credentialAdminApi from './api/credentialAdmin';
import * as graphApi from './api/graph';
import * as feedApi from './api/feed';
import * as reportApi from './api/report';
import * as authApi from './api/authApi';
import * as oidcApi from './api/oidcApi';
import * as imagesApi from './api/images';
import * as identityApi from './api/identity';
import * as legacyClaimsApi from './api/legacyClaims';
import * as videoApi from './api/video/upload';
import * as badgeApi from './api/badge/image';
import * as shareApi from './api/share';
import * as atprotoApi from './api/atproto';
import { verifyLinkedInProfile } from './api/linkedin/verifyProfile';
import { verifyLinkedInAge } from './api/linkedin/verifyAge';
import { verifyGitHubProfile } from './api/github/verifyProfile';

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
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resources
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-DID'],
  credentials: false
}));
app.use(compression() as unknown as RequestHandler);
app.use(morgan('combined'));
app.use(express.json({ limit: '20mb' }));
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

// ATProto (Bluesky) OAuth
app.get('/oauth/atproto/client-metadata.json', authApi.atprotoClientMetadata);
app.post('/auth/atproto/authorize', authApi.atprotoAuthorize);
app.get('/auth/atproto/callback', authApi.atprotoCallback);

// OIDC provider — "Sign in with LinkedTrust" (LinkedTrust as trust provider)
app.get('/.well-known/openid-configuration', oidcApi.discovery);
app.get('/.well-known/jwks.json', oidcApi.jwksHandler);
app.get('/oauth/authorize', oidcApi.authorize);
app.post('/oauth/token', oidcApi.token);
app.get('/oauth/userinfo', oidcApi.userinfo);
app.post('/oauth/session', oidcApi.session);

// LinkedIn verification endpoints
app.post('/api/linkedin/verify-profile', verifyLinkedInProfile);
app.post('/api/linkedin/verify-age', verifyLinkedInAge);

// GitHub verification endpoints
app.post('/api/github/verify-profile', verifyGitHubProfile);

// Legacy claim endpoints (v3 compatibility)
app.post('/api/claim', verifyToken, legacyClaimsApi.createClaimV3);          // LEGACY: Create one claim (v3 format)
app.post('/api/claim/v2', verifyToken, (legacyClaimsApi.createClaimV3WithImages[0] as RequestHandler), (legacyClaimsApi.createClaimV3WithImages[1] as RequestHandler));
app.get('/api/claim/:id', legacyClaimsApi.getClaimV3);
app.get('/api/claim', legacyClaimsApi.getClaimsV3);

// Modern v4 endpoints
// Claims endpoints
app.post('/api/v4/claims', optionalToken, claimsApi.createClaim);
app.post('/api/claims', optionalToken, claimsApi.createClaim);     // MODERN: Create one claim (v4 format, auth optional)
app.get('/api/v4/claims/:id', claimsApi.getClaim);
app.get('/api/claims/:id', claimsApi.getClaim);
app.get('/api/v4/claims/subject/:uri(*)', claimsApi.getClaimsBySubject);
app.get('/api/claims/subject/:uri(*)', claimsApi.getClaimsBySubject);

// Identity endpoints - for checking SAME_AS transitive closure
app.get('/api/identity/subjects', identityApi.getLinkedSubjects);        // Get all subjects linked to a URI
app.get('/api/identity/linked', identityApi.checkLinkedIdentities);      // Check if two URIs are linked
app.get('/api/identity/is-me', verifyToken, identityApi.checkIsMe);      // Check if subjectUri is linked to logged-in user

// Credentials endpoints
app.post('/api/v4/credentials', verifyToken, credentialsApi.submitCredential);
app.post('/api/credentials', verifyToken, credentialsApi.submitCredential);
// Query endpoint MUST come before :uri(*) route to avoid path capture
app.get('/api/v4/credentials', credentialsApi.queryCredentials);
app.get('/api/credentials', credentialsApi.queryCredentials);
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

// Image endpoints
app.get('/api/images/:id', imagesApi.getImage);
app.get('/api/images/:id/metadata', imagesApi.getImageMetadata);

// Server key endpoint
app.get('/api/keys/server', (_req, res) => {
  res.json(getServerPublicKey());
});

// Video upload endpoint
app.post('/api/video/upload', optionalToken, videoApi.videoUploadMiddleware, videoApi.uploadVideo);

// Badge image endpoint (PNG for email embedding)
app.get('/api/badge-image/:claimId', badgeApi.getBadgeImage);

// Social sharing endpoints (public, no auth)
app.get('/api/og-image/:claimId', shareApi.getOgImage);
app.get('/api/share/:claimId', shareApi.getSharePage);

// ATProto indexer endpoints
app.get('/api/atproto/claims', atprotoApi.getAtprotoClaims);
app.get('/api/atproto/check', atprotoApi.checkAtprotoClaim);
app.post('/api/atproto/backfill', atprotoApi.triggerBackfill);

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

  // Start ATProto Jetstream indexer (if enabled via ATPROTO_INDEX_ENABLED=true)
  AtprotoIndexer.start();
});

export default app;
