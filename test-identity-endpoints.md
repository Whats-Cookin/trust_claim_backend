# Identity Endpoints Test Guide

## New Endpoints

### 1. Get Linked Subjects
```bash
# Returns all URIs linked to the given URI via SAME_AS claims
GET /api/identity/subjects?uri=https://github.com/username
```

**Response:**
```json
{
  "success": true,
  "uri": "https://github.com/username",
  "subjects": [
    "https://github.com/username",
    "https://linkedin.com/in/username",
    "https://talent.linkedtrust.us/profile/username"
  ],
  "count": 3
}
```

### 2. Check if Two URIs are Linked
```bash
# Checks if uri1 and uri2 are connected via SAME_AS (transitive)
GET /api/identity/linked?uri1=https://github.com/user&uri2=https://linkedin.com/in/user
```

**Response:**
```json
{
  "success": true,
  "linked": true,
  "uri1": "https://github.com/user",
  "uri2": "https://linkedin.com/in/user",
  "subjects": [
    "https://github.com/user",
    "https://linkedin.com/in/user",
    "https://talent.linkedtrust.us/profile/user"
  ],
  "message": "https://github.com/user and https://linkedin.com/in/user are connected via SAME_AS claims"
}
```

### 3. Check "Is This Me?" (Authenticated)
```bash
# Checks if subjectUri is linked to the logged-in user
# Requires: Authorization header with valid token
GET /api/identity/is-me?subjectUri=https://github.com/username
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "isMe": true,
  "subjectUri": "https://github.com/username",
  "userUri": "https://linkedtrust.us/user/12345",
  "userSubjects": [
    "https://linkedtrust.us/user/12345",
    "https://github.com/username",
    "https://linkedin.com/in/username"
  ],
  "message": "https://github.com/username is linked to your account"
}
```

## Test with cURL

```bash
# Test 1: Get linked subjects
curl "http://localhost:3000/api/identity/subjects?uri=https://github.com/username"

# Test 2: Check if two URIs are linked
curl "http://localhost:3000/api/identity/linked?uri1=https://github.com/user1&uri2=https://linkedin.com/in/user1"

# Test 3: Check "is this me?" (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  "http://localhost:3000/api/identity/is-me?subjectUri=https://github.com/username"
```

## Frontend Usage

### Check if profile belongs to current user
```typescript
// Before: Manual SAME_AS traversal with multiple API calls
const profileUrl = `https://talent.linkedtrust.us/profile/${slug}`;
const profileClaims = await fetch(`/api/claim?object=${encodeURIComponent(profileUrl)}&claim=HAS_PROFILE_AT`);
const sameAsClaims = await fetch(`/api/claim?subject=${subjectUri}&claim=SAME_AS`);
const reverseClaims = await fetch(`/api/claim?object=${subjectUri}&claim=SAME_AS`);
// ...manually combine results...

// After: Single API call
const response = await fetch(`/api/identity/is-me?subjectUri=${encodeURIComponent(profileUrl)}`, {
  headers: { Authorization: `Bearer ${token}` }
});
const { isMe, userSubjects } = await response.json();
```

### Check if two accounts are the same person
```typescript
// Check if a GitHub account and LinkedIn account belong to same person
const response = await fetch(
  `/api/identity/linked?uri1=${encodeURIComponent(githubUri)}&uri2=${encodeURIComponent(linkedinUri)}`
);
const { linked, subjects } = await response.json();
```

## Benefits

1. **Performance**: Single API call instead of multiple round trips
2. **Simplicity**: No need to manually implement SAME_AS traversal on frontend
3. **Consistency**: Centralized logic ensures consistent behavior
4. **Type Safety**: Clear API contract with structured responses
5. **Caching Ready**: Easy to add caching layer at endpoint level
