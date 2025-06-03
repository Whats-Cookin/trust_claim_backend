# Frontend Development Guidelines - Multiple Apps, One Backend

## Business Model: The Validation Stamp

### The Problem We Solve
- **For HR/Philanthropy:** You have something valuable (job, grant money)
- **You get:** 1000s of applicants, mostly fake/unqualified
- **Current approach:** Waste time reviewing everyone

### Our Solution: Pre-Validation
1. **You send applicants to our platform** to get validated
2. **Only talk to those who complete validation** (filters out fakes)
3. **Applicants keep their "stamp"** for future applications
4. **Everyone wins:** Less spam for you, less repetition for real applicants

### Key Insight
The validation stamp is **portable** - once someone proves they're real and skilled, they can reuse that proof. This creates a network effect where more employers requiring stamps makes stamps more valuable.

## Why the Unified Graph Matters

### Cross-Domain Trust
The power of using trust_claim_backend is that you get access to the entire trust graph, not just your domain:

- A person validated in one context (e.g., open source contributions) brings that credibility to another context (e.g., job applications)
- Validators themselves have credibility from multiple domains
- More connections = harder to fake

### For Your App
When showing validations, consider:
- WHO validated (not just how many)
- The validator's own credibility in the graph
- Cross-domain signals that this is a real person

Use the `/api/graph/{id}` endpoint to explore these connections.

## The Situation
- We have ONE backend (trust_claim_backend) with a unified graph
- We need MULTIPLE frontend apps for different use cases
- First use case: Recruiters send candidates to get validated

## Core Rules - Don't Break the Backend

### 1. **Use Existing Endpoints**
```
POST /api/claims         - Create any type of claim
GET  /api/claims/{id}    - Get a claim
GET  /api/graph/{id}     - Get graph visualization
GET  /api/feed           - Get claims (with filters)
POST /api/credentials    - Submit credentials
```

### 2. **Use Standard Claim Types**
Don't invent new claim types without backend coordination:
- HAS_SKILL
- ENDORSES  
- HAS (for credentials)
- VALIDATES
- etc.

### 3. **Use Consistent Entity URIs**
- Subjects must be valid URIs (per LinkedClaims spec)
- Use existing patterns from the system

## Frontend App Architecture Options

### Option 1: Frontend Only
- Just a frontend that calls trust_claim_backend API
- Good for simple viewers/validators

### Option 2: Frontend + Own Backend (Recommended)
- Your own backend for domain-specific features
- ALSO calls trust_claim_backend for graph data
- Best of both worlds

## How to Build a New Frontend

### Step 1: Fork or Start Fresh
- Clone trust_claim for a starting point, OR
- Start fresh with your preferred framework
- Point to the same backend API

### Step 2: Focus on Your Use Case
For the recruiter app:
- Simplified onboarding for candidates
- Easy peer validation requests
- Clean report/badge generation
- Don't show irrelevant features

### Step 3: Reuse What Works
- Authentication flow (OAuth/DID)
- API client code
- Basic claim creation

### Step 4: Hide What Doesn't Matter
- Don't need full graph viz? Don't include it
- Don't need impact claims? Filter them out
- Keep it simple for your users

## Example: Recruiter Validation App

### The Business Flow:
1. **Recruiter posts job** → "Get validated at skillstamp.example.com"
2. **Candidates visit link** → Create profile, import creds, get peer validations
3. **System generates stamp** → Proof they're real + skilled
4. **Recruiter dashboard** → Shows only validated candidates
5. **Candidates reuse stamp** → Next job application is easier

### What It Needs:
1. **Landing page** - Recruiter sends candidate here
2. **Quick profile setup** - Name, skills to validate
3. **Peer invitation** - "Ask colleagues to validate"
4. **Credential import** - LinkedIn, certificates
5. **Summary badge** - Clean PDF/image for resume

### API Usage:
```javascript
// Create skill claims
POST /api/claims
{
  subject: "user-uri",
  claim: "HAS_SKILL",
  object: "React",
  confidence: 0.8
}

// Get validations about a claim
GET /api/claims/subject/{claim-uri}?claim=VALIDATES

// Import credential
POST /api/credentials
// Returns claimUrl for user to claim
```

## What NOT to Do

### DON'T:
- Create new API endpoints in backend
- Change existing API contracts
- Invent new claim types without discussion
- Modify the core data model
- Break existing frontends

### DO:
- Use query parameters to filter data
- Create domain-specific UIs
- Simplify flows for your users
- Cache data appropriately
- Handle errors gracefully

## Backend Stability Contract

The backend promises:
1. Endpoints won't change signature
2. New fields are added, not removed
3. Query parameters are additive
4. Authentication works the same

## Augmenting with Your Own Backend

### Why You Might Need It:
- Store app-specific user preferences
- Cache/aggregate data for performance  
- Add domain-specific features
- Integrate with external services
- Store private data not suitable for public graph
- **Track business metrics** (conversion rates, stamp reuse)
- **Manage customer accounts** (recruiters, grantmakers)
- **Handle payments** if charging for premium features

### Example: Recruiter App Backend
```javascript
// Your backend might have:
- Recruiter accounts & permissions
- Candidate tracking/status
- Email templates & automation
- PDF generation for badges
- Integration with ATS systems
- Stamp templates per recruiter
- Analytics on validation rates
- Bulk invite management

// But still uses trust_claim_backend for:
- Creating claims
- Fetching validation graphs
- Storing credentials
- The actual trust data
```

### Architecture Pattern:
```
[Recruiter Frontend]
        |
        ├── [Your Backend]
        |    ├── /api/recruiters
        |    ├── /api/candidates  
        |    ├── /api/reports
        |    └── Calls trust_claim_backend
        |
        └── [trust_claim_backend]
             ├── /api/claims
             ├── /api/graph
             └── /api/credentials
```

### Best Practices:
1. **Your backend handles your domain**
2. **Trust backend handles claims/graph**
3. **Don't duplicate claim storage**
4. **Cache smartly but source from trust_claim**
5. **Your auth can wrap trust_claim auth**

## Quick Start Checklist

- [ ] Choose: Frontend only or Frontend+Backend?
- [ ] Set up your own backend if needed
- [ ] Configure trust_claim_backend API URL
- [ ] Implement auth (your own + trust_claim)
- [ ] Create your main user flow
- [ ] Test integration with both backends
- [ ] Deploy independently

## Questions?
- API not returning what you need? Ask for query params
- Need a new claim type? Discuss with backend team
- Want to cache heavily? Go for it
- Need help with auth? Copy from trust_claim

Remember: The backend is shared infrastructure. Your frontend is your domain. Keep them separate.
