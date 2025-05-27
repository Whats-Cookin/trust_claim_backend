import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import middleware
import { verifyToken } from './lib/auth';

// Import API routes
import * as claimsApi from './api/claims';
import * as credentialsApi from './api/credentials';
import * as graphApi from './api/graph';
import * as feedApi from './api/feed';
import * as reportApi from './api/report';
import * as authApi from './api/authApi';
import * as legacyClaimsApi from './api/legacyClaims';

// Create Express app
const app = express();

// Global middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Routes (no auth required) - LEGACY ENDPOINTS
app.post('/auth/google', authApi.googleAuth);
app.post('/auth/login', authApi.login);
app.post('/auth/register', authApi.register);
app.post('/auth/refresh_token', authApi.refreshToken);
app.post('/auth/github', authApi.githubAuth);
app.post('/auth/wallet', authApi.walletAuth);

// API Routes

// Claims endpoints
app.post('/api/claims', verifyToken, claimsApi.createClaim);
app.get('/api/claims/:id', claimsApi.getClaim);
app.get('/api/claims/subject/:uri', claimsApi.getClaimsBySubject);

// Credentials endpoints
app.post('/api/credentials', verifyToken, credentialsApi.submitCredential);
app.get('/api/credentials/:uri', credentialsApi.getCredential);

// Graph endpoints
app.get('/api/graph/:uri', graphApi.getGraph);
app.get('/api/graph', graphApi.getFullGraph);
app.get('/api/graph/node/:nodeId/neighbors', graphApi.getNeighbors);

// Feed endpoints
app.get('/api/feed', feedApi.getFeed);
app.get('/api/feed/entity/:entityType', feedApi.getFeedByEntityType);
app.get('/api/feed/trending', feedApi.getTrending);

// Report endpoints
app.get('/api/reports/claim/:claimId', reportApi.getClaimReport);
app.post('/api/reports/claim/:claimId/validate', verifyToken, reportApi.submitValidation);
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
