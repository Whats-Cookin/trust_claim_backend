/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AuthTokens'
 *                 - type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AuthTokens'
 *                 - type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       409:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /auth/refresh_token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/claim:
 *   post:
 *     summary: Create a claim (Legacy v3)
 *     tags: [Claims (Legacy v3)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClaimV3Input'
 *     responses:
 *       201:
 *         description: Claim created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClaimV3Response'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/claim/v2:
 *   post:
 *     summary: Create a claim with images (Legacy v3)
 *     tags: [Claims (Legacy v3)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Array of image files (max 10)
 *               dto:
 *                 type: string
 *                 description: JSON string containing claim data (ClaimV3Input structure)
 *     responses:
 *       201:
 *         description: Claim created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 claim:
 *                   $ref: '#/components/schemas/ClaimV3Response'
 *                 claimData:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     claimId:
 *                       type: integer
 *                     name:
 *                       type: string
 *                 claimImages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       claimId:
 *                         type: integer
 *                       url:
 *                         type: string
 *                       digetedMultibase:
 *                         type: string
 *                       metadata:
 *                         type: object
 *                       effectiveDate:
 *                         type: string
 *                         format: date-time
 *                       createdDate:
 *                         type: string
 *                         format: date-time
 *                       owner:
 *                         type: string
 *                       signature:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/claim/{id}:
 *   get:
 *     summary: Get claim by ID (Legacy v3)
 *     tags: [Claims (Legacy v3)]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Claim ID
 *     responses:
 *       200:
 *         description: Claim found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClaimV3Response'
 *       404:
 *         description: Claim not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/claim:
 *   get:
 *     summary: Get claims with filters (Legacy v3)
 *     tags: [Claims (Legacy v3)]
 *     parameters:
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Filter by subject URI
 *       - in: query
 *         name: object
 *         schema:
 *           type: string
 *         description: Filter by object
 *       - in: query
 *         name: claim
 *         schema:
 *           type: string
 *         description: Filter by claim type
 *       - in: query
 *         name: issuer_id
 *         schema:
 *           type: string
 *         description: Filter by issuer ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Claims retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 claims:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ClaimV3Response'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/v4/claims:
 *   post:
 *     summary: Create a claim
 *     description: |
 *       Creates a new claim. Claims are immutable signed events.
 *
 *       **Duplicate Prevention:** Claims are unique by (subject, issuerId, claim, sourceURI, statement).
 *       If a duplicate exists, returns 409 Conflict unless `replace: true` is set.
 *
 *       **Replace Behavior:** Since claims are immutable, `replace: true` will DELETE the existing
 *       claim (and its edges/images) and create a new one with a new ID.
 *     tags: [Claims (v4)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClaimV4Input'
 *     responses:
 *       200:
 *         description: Claim created successfully (or replaced if replace=true)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 claim:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     subject:
 *                       type: string
 *                     claim:
 *                       type: string
 *                     object:
 *                       type: string
 *                       nullable: true
 *                 replaced:
 *                   type: boolean
 *                   description: True if an existing claim was replaced
 *                 replacedClaimId:
 *                   type: integer
 *                   description: ID of the claim that was deleted (only present if replaced=true)
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Duplicate claim exists. Use replace=true to delete and recreate.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DuplicateClaimError'
 */

/**
 * @swagger
 * /api/v4/claims/{id}:
 *   get:
 *     summary: Get claim by ID
 *     tags: [Claims (v4)]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Claim ID
 *     responses:
 *       200:
 *         description: Claim found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Claim not found
 */

/**
 * @swagger
 * /api/v4/claims/subject/{uri}:
 *   get:
 *     summary: Get claims by subject URI with optional endorsements
 *     description: |
 *       Returns all claims about a subject. Use depth=2 to also fetch endorsements
 *       (claims where the subject is the claim URI itself, e.g., validations/ratings of claims).
 *       Each claim includes an images array with both images and videos. Videos have type='video'
 *       and return their CDN URL directly.
 *     tags: [Claims (v4)]
 *     parameters:
 *       - in: path
 *         name: uri
 *         required: true
 *         schema:
 *           type: string
 *         description: Subject URI (base64 encoded or URL encoded)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Items per page (max 1000)
 *       - in: query
 *         name: includeLinked
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *         description: Include claims from SAME_AS linked identities
 *       - in: query
 *         name: depth
 *         schema:
 *           type: integer
 *           enum: [1, 2]
 *           default: 1
 *         description: |
 *           Depth of claim fetching:
 *           - 1: Just the claims about the subject
 *           - 2: Also fetch endorsements (claims where subject is the claim URI)
 *     responses:
 *       200:
 *         description: Claims retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 claims:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       subject:
 *                         type: string
 *                       claim:
 *                         type: string
 *                       statement:
 *                         type: string
 *                       images:
 *                         type: array
 *                         description: Images and videos associated with the claim
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             url:
 *                               type: string
 *                               description: CDN URL for videos, /api/images/{id} for images
 *                             type:
 *                               type: string
 *                               enum: [image, video]
 *                             contentType:
 *                               type: string
 *                             filename:
 *                               type: string
 *                             metadata:
 *                               type: object
 *                       endorsements:
 *                         type: array
 *                         description: Only present when depth=2. Claims that reference this claim as their subject.
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             claim:
 *                               type: string
 *                             statement:
 *                               type: string
 *                             stars:
 *                               type: integer
 *                             images:
 *                               type: array
 *                               items:
 *                                 type: object
 *                 linkedSubjects:
 *                   type: array
 *                   items:
 *                     type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 query:
 *                   type: object
 *                   properties:
 *                     originalUri:
 *                       type: string
 *                     decodedUri:
 *                       type: string
 *                     includeLinked:
 *                       type: boolean
 *                     depth:
 *                       type: integer
 */

/**
 * @swagger
 * /api/v4/credentials:
 *   get:
 *     summary: Query credentials with flexible filtering
 *     description: |
 *       Search and browse credentials with various filters. Supports pagination and sorting.
 *       This is generic LinkedClaims infrastructure for any frontend app to discover credentials.
 *
 *       **Example queries:**
 *       - `GET /api/credentials?type=TalentStampCredential` - Find talent credentials
 *       - `GET /api/credentials?issuer=did:web:talent.linkedtrust.us` - Find by issuer
 *       - `GET /api/credentials?subject=did:example:123` - Find credentials about a person
 *       - `GET /api/credentials?issuedAfter=2024-01-01&sort=recent` - Recent credentials
 *     tags: [Credentials]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by credential type (e.g., TalentStampCredential, OpenBadgeCredential). Matches if type array contains this value.
 *         example: TalentStampCredential
 *       - in: query
 *         name: issuer
 *         schema:
 *           type: string
 *         description: Filter by issuer ID or DID (e.g., did:web:talent.linkedtrust.us)
 *         example: did:web:talent.linkedtrust.us
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Filter by credentialSubject.id (the person/entity the credential is about)
 *         example: did:example:user123
 *       - in: query
 *         name: schema
 *         schema:
 *           type: string
 *         description: Filter by credential schema type (exact match)
 *         example: OpenBadges
 *       - in: query
 *         name: issuedAfter
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter credentials issued on or after this date (ISO 8601)
 *         example: "2024-01-01"
 *       - in: query
 *         name: issuedBefore
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter credentials issued on or before this date (ISO 8601)
 *         example: "2024-12-31"
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter by name (partial match, case-insensitive)
 *         example: "Software Engineer"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of results to return (max 100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip (for pagination)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [recent, oldest, name]
 *           default: recent
 *         description: Sort order - recent (newest first), oldest, or name (alphabetical)
 *     responses:
 *       200:
 *         description: Credentials retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 credentials:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Credential'
 *                 total:
 *                   type: integer
 *                   description: Total number of matching credentials
 *                 limit:
 *                   type: integer
 *                   description: Number of results returned
 *                 offset:
 *                   type: integer
 *                   description: Number of results skipped
 *                 sort:
 *                   type: string
 *                   description: Sort order used
 *             example:
 *               credentials:
 *                 - id: "urn:credential:abc123"
 *                   type: ["VerifiableCredential", "TalentStampCredential"]
 *                   issuer: { id: "did:web:talent.linkedtrust.us" }
 *                   issuanceDate: "2024-06-15T10:30:00Z"
 *                   name: "Software Engineer Profile"
 *               total: 42
 *               limit: 20
 *               offset: 0
 *               sort: "recent"
 *       500:
 *         description: Internal server error
 *   post:
 *     summary: Submit a credential with optional schema and metadata
 *     description: |
 *       Submit a W3C Verifiable Credential for storage. Supports replacement options:
 *
 *       - **replace: true** - If a credential with the same URI already exists, delete it and create new
 *       - **replaceBySubject: true** - Delete any existing credentials for the same credentialSubject.id before creating (useful for talent app - one credential per person)
 *     tags: [Credentials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/Credential'
 *               - type: object
 *                 required:
 *                   - credential
 *                 properties:
 *                   credential:
 *                     $ref: '#/components/schemas/Credential'
 *                   schema:
 *                     oneOf:
 *                       - type: string
 *                         description: Schema identifier (e.g., 'OpenBadges', 'Blockcerts')
 *                       - type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           version:
 *                             type: string
 *                   metadata:
 *                     type: object
 *                     properties:
 *                       displayHints:
 *                         type: object
 *                         description: UI hints for credential display
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 *                       visibility:
 *                         type: string
 *                         enum: [public, private, restricted]
 *                   replace:
 *                     type: boolean
 *                     description: If true, delete existing credential with same URI before creating new
 *                   replaceBySubject:
 *                     type: boolean
 *                     description: If true, delete any existing credentials for the same credentialSubject.id (useful for talent app - one credential per person)
 *     responses:
 *       200:
 *         description: Credential submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 credential:
 *                   $ref: '#/components/schemas/Credential'
 *                 uri:
 *                   type: string
 *                   description: The canonical URI for this credential
 *                 schema:
 *                   type: string
 *                   description: Detected or provided schema type
 *                 metadata:
 *                   type: object
 *                 claimUrl:
 *                   type: string
 *                   description: URL where user can claim this credential
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Credential already exists (use replace=true to overwrite)
 */

/**
 * @swagger
 * /api/v4/credentials/{uri}:
 *   get:
 *     summary: Get credential by URI
 *     tags: [Credentials]
 *     parameters:
 *       - in: path
 *         name: uri
 *         required: true
 *         schema:
 *           type: string
 *         description: Credential URI (URL encoded)
 *     responses:
 *       200:
 *         description: Credential found
 *       404:
 *         description: Credential not found
 */

/**
 * @swagger
 * /api/v4/graph/{uri}:
 *   get:
 *     summary: Get graph for a specific URI
 *     tags: [Graph]
 *     parameters:
 *       - in: path
 *         name: uri
 *         required: true
 *         schema:
 *           type: string
 *         description: Entity URI (URL encoded)
 *       - in: query
 *         name: depth
 *         schema:
 *           type: integer
 *           default: 2
 *         description: Graph traversal depth
 *     responses:
 *       200:
 *         description: Graph data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nodes:
 *                   type: array
 *                   items:
 *                     type: object
 *                 edges:
 *                   type: array
 *                   items:
 *                     type: object
 */

/**
 * @swagger
 * /api/v4/graph:
 *   get:
 *     summary: Get full graph
 *     tags: [Graph]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of nodes
 *     responses:
 *       200:
 *         description: Graph data retrieved successfully
 */

/**
 * @swagger
 * /api/v4/feed:
 *   get:
 *     summary: Get activity feed
 *     tags: [Feed]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Feed retrieved successfully
 */

/**
 * @swagger
 * /api/v4/reports/claim/{claimId}:
 *   get:
 *     summary: Get claim report
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Report retrieved successfully
 *       404:
 *         description: Claim not found
 */

/**
 * @swagger
 * /api/v4/reports/claim/{claimId}/validate:
 *   post:
 *     summary: Submit validation for a claim
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               validation:
 *                 type: string
 *                 enum: [SUPPORTED, REFUTED, INSUFFICIENT]
 *               confidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Validation submitted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Claim not found
 */

export {}; // Make this a module