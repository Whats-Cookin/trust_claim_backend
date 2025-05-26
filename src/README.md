# LinkedTrust Backend - Clean Slate Implementation

## Migration Status

This is a dramatically simplified reimplementation of the LinkedTrust backend, following the principles laid out in `implementation-plan-clean-slate.md`.

### What's New

1. **Entity Type System** - URIs are mapped to entity types via `uri_entities` table
2. **Credentials as First-Class Citizens** - CREDENTIAL added to EntityType enum
3. **Simplified Architecture** - Removed 70% of complexity:
   - No more complex DAOs with raw SQL
   - Single Prisma client
   - Clean separation of concerns
   - Minimal, focused endpoints

### Migration Steps

1. **Run Setup Script**
   ```bash
   # From the trust_claim_backend directory
   ./setup.sh
   ```
   
   This will:
   - Install dependencies
   - Generate Prisma client
   - Run database migrations
   - Update .env with required variables

2. **Start Development Server**
   ```bash
   npm run dev
   ```

### API Changes

#### New Endpoints

- `POST /api/credentials` - Submit a credential (creates HAS claim automatically)
- `GET /api/credentials/:uri` - Get credential by URI
- `GET /api/feed/entity/:entityType` - Filter feed by entity type
- `GET /api/reports/entity/:uri` - Comprehensive entity report

#### Simplified Endpoints

- `/api/claims` - Single endpoint for claim creation (removed v1/v2/v3 complexity)
- `/api/graph/:uri` - Cleaner graph response with entity data
- `/api/feed` - Simplified feed with entity enrichment

### Key Improvements

1. **Performance** - Simpler queries, better indexes
2. **Maintainability** - Clean code structure, TypeScript throughout
3. **Flexibility** - Entity system allows easy extension
4. **True to LinkedClaims** - Focus on semantic triples with provenance

### Testing the New System

1. **Submit a Credential**
   ```bash
   curl -X POST http://localhost:3000/api/credentials \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "@context": ["https://www.w3.org/2018/credentials/v1"],
       "type": ["VerifiableCredential", "SkillCredential"],
       "issuer": "did:example:issuer",
       "credentialSubject": {
         "id": "did:example:alice",
         "skills": ["JavaScript", "TypeScript"]
       }
     }'
   ```

2. **Create a Claim**
   ```bash
   curl -X POST http://localhost:3000/api/claims \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "subject": "https://example.com",
       "claim": "HAS_RATING",
       "stars": 5,
       "statement": "Excellent service",
       "howKnown": "FIRST_HAND"
     }'
   ```

3. **View Graph**
   ```bash
   curl http://localhost:3000/api/graph/https://example.com
   ```

### Next Steps

1. Update frontend to use enhanced node data
2. Migrate existing data (entities will be detected automatically)
3. Update pipeline to use entity information
4. Deploy and monitor performance improvements

### Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/linkedtrust
JWT_SECRET=your-secret-key
PIPELINE_SERVICE_URL=http://localhost:8001
BASE_URL=https://linkedtrust.us
NODE_ENV=development
```
