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
 *       201:
 *         description: Claim created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 subject:
 *                   type: object
 *                 claim:
 *                   type: string
 *                 object:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid input
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
 *     summary: Get claims by subject URI
 *     tags: [Claims (v4)]
 *     parameters:
 *       - in: path
 *         name: uri
 *         required: true
 *         schema:
 *           type: string
 *         description: Subject URI (URL encoded)
 *     responses:
 *       200:
 *         description: Claims retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */

/**
 * @swagger
 * /api/v4/credentials:
 *   post:
 *     summary: Submit a credential with optional schema and metadata
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
 *     responses:
 *       201:
 *         description: Credential submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 credential:
 *                   $ref: '#/components/schemas/Credential'
 *                 claim:
 *                   type: object
 *                 uri:
 *                   type: string
 *                 schema:
 *                   type: string
 *                 metadata:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Credential already exists
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
