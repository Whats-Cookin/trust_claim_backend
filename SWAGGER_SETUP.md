# Swagger API Documentation Setup

## Installation

First, install the required dependencies:

```bash
npm install swagger-jsdoc swagger-ui-express
npm install --save-dev @types/swagger-jsdoc @types/swagger-ui-express
```

## Accessing the Documentation

Once the server is running, you can access the Swagger documentation at:

- **Swagger UI**: `http://localhost:3000/api/docs`
- **Swagger JSON**: `http://localhost:3000/api/docs.json`

For production:
- **Swagger UI**: `https://live.linkedtrust.us/api/docs`
- **Swagger JSON**: `https://live.linkedtrust.us/api/docs.json`

## Features

### 1. Interactive API Documentation
- Browse all endpoints organized by tags
- See request/response schemas
- View example payloads
- Understand authentication requirements

### 2. Try It Out
- Test endpoints directly from the browser
- Authenticate with JWT tokens
- Send real requests to the API
- See actual responses

### 3. API Sections

The documentation is organized into the following sections:

- **Authentication**: Login, signup, and token refresh
- **Claims (Legacy v3)**: Backward-compatible claim endpoints
- **Claims (v4)**: Modern claim management
- **Credentials**: Credential submission and retrieval
- **Graph**: Trust graph queries
- **Feed**: Activity feeds
- **Reports**: Reporting and validation

### 4. Authentication in Swagger

To test protected endpoints:

1. First, use the `/auth/login` endpoint to get tokens
2. Click the "Authorize" button in Swagger UI
3. Enter your access token in the format: `Bearer YOUR_ACCESS_TOKEN`
4. Click "Authorize" to save
5. Now you can test protected endpoints

## Adding New Documentation

To document new endpoints, add JSDoc comments in the route files:

```typescript
/**
 * @swagger
 * /api/v4/new-endpoint:
 *   get:
 *     summary: Description of your endpoint
 *     tags: [Category]
 *     parameters:
 *       - in: query
 *         name: param
 *         schema:
 *           type: string
 *         description: Parameter description
 *     responses:
 *       200:
 *         description: Success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
```

## Schema Definitions

Common schemas are defined in `src/lib/swagger.ts`:

- `Error`: Standard error response
- `AuthTokens`: JWT token pair
- `User`: User information
- `ClaimV3Input/Response`: Legacy claim formats
- `ClaimV4Input`: Modern claim format
- `Credential`: Verifiable credential format
- `HowKnown`: Enumeration of knowledge sources

## Export Options

You can export the API documentation:

1. **OpenAPI JSON**: Visit `/api/docs.json`
2. **Postman Collection**: Import the OpenAPI JSON into Postman
3. **Client Generation**: Use the OpenAPI spec with code generators

## Security Notes

- All v4 endpoints require JWT authentication (except GET operations)
- Legacy endpoints maintain original authentication requirements
- Tokens expire after 1 hour (access) and 7 days (refresh)
- Use HTTPS in production for secure token transmission

## Customization

To customize the Swagger UI appearance, edit the options in `src/index.ts`:

```typescript
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'LinkedTrust API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true, // Remember auth between reloads
  },
}));
```

## Development Tips

1. Run the server in development mode to see documentation updates instantly
2. Use the "Try it out" feature to test your implementations
3. Export schemas to generate TypeScript types for the frontend
4. Keep descriptions clear and examples realistic
5. Document all possible error responses

## Troubleshooting

If Swagger documentation doesn't appear:

1. Check that all dependencies are installed
2. Ensure `src/api/swagger-docs.ts` is imported in `index.ts`
3. Verify the paths in swagger configuration match your file structure
4. Check console for any parsing errors in JSDoc comments
5. Make sure the server is running on the correct port
