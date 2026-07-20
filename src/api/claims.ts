import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../lib/auth';
import { EntityDetector } from '../services/entityDetector';
import { PipelineTrigger } from '../services/pipelineTrigger';
import { AtprotoPublisher } from '../services/atprotoPublisher';
import { signClaimWithServerKey } from '../lib/crypto';
import { isValidUri, userIdToUri } from '../lib/validators';
import { findLinkedSubjects } from './identity';
// File system imports removed - images now stored in database
import crypto from 'crypto';
import AWS from 'aws-sdk';
import bcrypt from 'bcryptjs';

// S3-compatible (Backblaze B2) client for image uploads — mirrors src/api/video/upload.ts
// so images land in the same bucket as videos instead of being inlined into the DB.
let imageS3: AWS.S3 | null = null;
function getImageS3Client(): AWS.S3 {
  if (!imageS3) {
    imageS3 = new AWS.S3({
      endpoint: process.env.LT_STORAGE_ENDPOINT || 'https://sfo3.digitaloceanspaces.com',
      credentials: new AWS.Credentials({
        accessKeyId: process.env.LT_STORAGE_KEY || '',
        secretAccessKey: process.env.LT_STORAGE_SECRET || '',
      }),
      region: process.env.LT_STORAGE_REGION || 'sfo3',
      signatureVersion: 'v4',
      s3ForcePathStyle: false,
    });
  }
  return imageS3;
}
function imageStorageBucket(): string {
  return process.env.LT_STORAGE_BUCKET || 'linkedtrust-dev';
}
function imageStorageCdnUrl(): string {
  return process.env.LT_STORAGE_CDN_URL || `https://${imageStorageBucket()}.sfo3.cdn.digitaloceanspaces.com`;
}
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif'
};

// Low-friction service attribution: a registered OIDC client (e.g. workers.vc) can
// authenticate server-to-server with its client_id + client_secret via headers, and
// its claims get issuerId = the client's own URI. No user login required. Returns the
// client's issuer URI if the credentials are valid, else null.
async function getVerifiedClientIssuer(req: Request): Promise<string | null> {
  const clientId = (req.headers['x-lt-client-id'] as string | undefined)?.trim();
  const clientSecret = (req.headers['x-lt-client-secret'] as string | undefined)?.trim();
  if (!clientId || !clientSecret) return null;
  try {
    const client = await prisma.oidcClient.findUnique({ where: { clientId } });
    if (!client || !client.clientSecret) return null;
    if (!(await bcrypt.compare(clientSecret, client.clientSecret))) return null;
    // Derive a stable issuer URI: prefer the client name when it's a bare domain
    // (e.g. "workers.vc" -> https://workers.vc), else the redirect URI host.
    const name = (client.name || '').trim();
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name)) return `https://${name}`;
    if (client.redirectUris?.[0]) {
      try { return `https://${new URL(client.redirectUris[0]).host}`; } catch { /* ignore */ }
    }
    return null;
  } catch (e) {
    console.warn('getVerifiedClientIssuer error:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Format an image/video record for API response.
 * Videos return their actual CDN URL, images use the API endpoint.
 */
function formatMediaRecord(img: any) {
  const isVideo = (img.metadata as any)?.type === 'video';
  return {
    id: img.id,
    claimId: img.claimId,
    // Videos: return the stored CDN URL directly
    // Images: use the API endpoint which serves from database
    url: isVideo ? img.url : `/api/images/${img.id}`,
    type: isVideo ? 'video' : 'image',
    contentType: (img.metadata as any)?.contentType || (isVideo ? 'video/webm' : 'image/jpeg'),
    filename: (img.metadata as any)?.filename || `${isVideo ? 'video' : 'image'}_${img.id}`,
    digestMultibase: img.digestMultibase,
    metadata: img.metadata,
    effectiveDate: img.effectiveDate,
    createdDate: img.createdDate,
    owner: img.owner,
    signature: img.signature
  };
}
function validateImageData(imageData: any, index: number): { isValid: boolean; error?: string; details?: any } {
  console.log(`Validating image ${index}:`, {
    isObject: typeof imageData === 'object',
    isNull: imageData === null,
    keys: imageData && typeof imageData === 'object' ? Object.keys(imageData) : 'N/A'
  });
  
  if (!imageData || typeof imageData !== 'object') {
    return { 
      isValid: false, 
      error: `Image ${index}: Must be an object. Received: ${typeof imageData}`,
      details: { receivedType: typeof imageData, receivedValue: imageData }
    };
  }
  
  const receivedKeys = Object.keys(imageData);
  const requiredKeys = ['filename', 'contentType', 'base64', 'metadata', 'effectiveDate'];
  const missingKeys = requiredKeys.filter(key => !imageData.hasOwnProperty(key));
  
  // Log received keys for debugging when validation fails
  if (missingKeys.length > 0) {
    console.log(`🚨 Image ${index} validation failed - Missing required keys:`, {
      received: receivedKeys,
      required: requiredKeys,
      missing: missingKeys
    });
    
    return { 
      isValid: false, 
      error: `Image ${index}: Missing required fields: [${missingKeys.join(', ')}]. Required fields: [${requiredKeys.join(', ')}]. Received fields: [${receivedKeys.join(', ')}]`,
      details: {
        received: receivedKeys,
        required: requiredKeys,
        missing: missingKeys,
        expectedSchema: {
          filename: "string",
          contentType: "string (e.g., 'image/jpeg')",
          base64: "string (base64 encoded image data)",
          metadata: "object (additional metadata)",
          effectiveDate: "string (ISO date) or Date object"
        }
      }
    };
  }
  
  // Validate filename
  if (typeof imageData.filename !== 'string' || imageData.filename.trim().length === 0) {
    return { 
      isValid: false, 
      error: `Image ${index}: 'filename' must be a non-empty string. Received: ${typeof imageData.filename}`,
      details: { receivedFilename: imageData.filename }
    };
  }
  
  // Validate contentType
  if (typeof imageData.contentType !== 'string') {
    return { 
      isValid: false, 
      error: `Image ${index}: 'contentType' must be a string. Received: ${typeof imageData.contentType}`,
      details: { receivedContentType: imageData.contentType }
    };
  }
  
  if (!imageData.contentType.startsWith('image/')) {
    return { 
      isValid: false, 
      error: `Image ${index}: 'contentType' must be a valid image MIME type (e.g., image/jpeg, image/png). Received: ${imageData.contentType}`,
      details: { receivedContentType: imageData.contentType }
    };
  }
  
  // Validate base64
  if (typeof imageData.base64 !== 'string') {
    return { 
      isValid: false, 
      error: `Image ${index}: 'base64' field must be a string. Received: ${typeof imageData.base64}`,
      details: { receivedBase64Type: typeof imageData.base64 }
    };
  }
  
  if (imageData.base64.length === 0) {
    return { 
      isValid: false, 
      error: `Image ${index}: 'base64' field cannot be empty`,
      details: { receivedBase64Length: 0 }
    };
  }
  
  // Validate base64 format - allow both data URLs and plain base64
  const base64Pattern = /^data:image\/[a-z]+;base64,|^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Pattern.test(imageData.base64)) {
    const prefix = imageData.base64.substring(0, 50);
    return { 
      isValid: false, 
      error: `Image ${index}: Invalid base64 format. Expected either data URL (data:image/type;base64,abc123...) or plain base64 (abc123...). Received prefix: "${prefix}..."`,
      details: { receivedPrefix: prefix, receivedLength: imageData.base64.length }
    };
  }
  
  // Check for potentially oversized base64 (>10MB when decoded)
  try {
    const base64Data = imageData.base64.replace(/^data:image\/[a-z]+;base64,/, '');
    const estimatedSize = (base64Data.length * 3) / 4; // Rough estimate of decoded size
    if (estimatedSize > 10 * 1024 * 1024) { // 10MB limit
      return { 
        isValid: false, 
        error: `Image ${index}: Image too large. Estimated size: ${Math.round(estimatedSize / 1024 / 1024)}MB. Maximum allowed: 10MB`,
        details: { estimatedSizeMB: Math.round(estimatedSize / 1024 / 1024) }
      };
    }
  } catch (e) {
    return { 
      isValid: false, 
      error: `Image ${index}: Error processing base64 data: ${e instanceof Error ? e.message : String(e)}`,
      details: { processingError: e instanceof Error ? e.message : String(e) }
    };
  }
  
  // Validate metadata - check for unexpected nested structures
  if (typeof imageData.metadata !== 'object' || imageData.metadata === null) {
    return { 
      isValid: false, 
      error: `Image ${index}: 'metadata' field must be an object. Received: ${typeof imageData.metadata}`,
      details: { receivedMetadata: imageData.metadata }
    };
  }
  
  // Check for nested metadata (common mistake)
  if (imageData.metadata.hasOwnProperty('metadata')) {
    return { 
      isValid: false, 
      error: `Image ${index}: 'metadata' should not contain another 'metadata' field. Unexpected nested structure detected.`,
      details: { 
        metadataKeys: Object.keys(imageData.metadata),
        nestedMetadata: imageData.metadata.metadata 
      }
    };
  }
  
  // Check for other unexpected nested structures in metadata
  const metadataKeys = Object.keys(imageData.metadata);
  const suspiciousNesting = metadataKeys.filter(key => 
    typeof imageData.metadata[key] === 'object' && 
    imageData.metadata[key] !== null &&
    (key === 'filename' || key === 'contentType' || key === 'base64' || key === 'effectiveDate')
  );
  
  if (suspiciousNesting.length > 0) {
    return { 
      isValid: false, 
      error: `Image ${index}: metadata contains unexpected nested structures for fields: [${suspiciousNesting.join(', ')}]. These should be top-level fields, not nested in metadata.`,
      details: { 
        suspiciousNesting,
        metadataStructure: imageData.metadata
      }
    };
  }
  
  // Validate effectiveDate
  if (imageData.effectiveDate) {
    const dateValue = new Date(imageData.effectiveDate);
    if (isNaN(dateValue.getTime())) {
      return { 
        isValid: false, 
        error: `Image ${index}: 'effectiveDate' must be a valid date. Received: ${imageData.effectiveDate}`,
        details: { receivedEffectiveDate: imageData.effectiveDate }
      };
    }
  }
  
  console.log(`Image ${index} validation passed`);
  return { isValid: true };
}

function validateRequestBody(body: any): { isValid: boolean; errors: string[]; validationDetails: any[] } {
  const errors: string[] = [];
  const validationDetails: any[] = [];
  
  // Required fields
  if (!body.subject || typeof body.subject !== 'string') {
    errors.push('Subject is required and must be a string');
    validationDetails.push({
      field: 'subject',
      issue: 'missing_or_invalid_type',
      received: { type: typeof body.subject, value: body.subject },
      expected: 'string'
    });
  } else if (!isValidUri(body.subject)) {
    errors.push('Subject must be a valid URI (e.g., https://example.com/resource, urn:uuid:123)');
    validationDetails.push({
      field: 'subject',
      issue: 'invalid_uri_format',
      received: body.subject,
      expected: 'valid URI with scheme (http://, https://, urn:, did:, etc.)'
    });
  }
  
  if (!body.claim || typeof body.claim !== 'string') {
    errors.push('Claim is required and must be a string');
    validationDetails.push({
      field: 'claim',
      issue: 'missing_or_invalid_type',
      received: { type: typeof body.claim, value: body.claim },
      expected: 'string'
    });
  }
  
  // Optional string fields validation
  const optionalStringFields = ['statement', 'aspect', 'unit'];
  optionalStringFields.forEach(field => {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      errors.push(`${field} must be a string if provided`);
      validationDetails.push({
        field,
        issue: 'invalid_type',
        received: { type: typeof body[field], value: body[field] },
        expected: 'string'
      });
    }
  });
  
  // Validate issuerId field as URI if provided (DIDs are valid URIs)
  if (body.issuerId !== undefined && body.issuerId !== null) {
    if (typeof body.issuerId !== 'string') {
      errors.push('issuerId must be a string if provided');
      validationDetails.push({
        field: 'issuerId',
        issue: 'invalid_type',
        received: { type: typeof body.issuerId, value: body.issuerId },
        expected: 'string'
      });
    } else if (!isValidUri(body.issuerId)) {
      errors.push('issuerId must be a valid URI if provided (e.g., https://example.com/user/123, did:example:123)');
      validationDetails.push({
        field: 'issuerId',
        issue: 'invalid_uri_format',
        received: body.issuerId,
        expected: 'valid URI with scheme (http://, https://, did:, etc.)'
      });
    }
  }
  
  // Validate object field as URI if provided
  if (body.object !== undefined && body.object !== null) {
    if (typeof body.object !== 'string') {
      errors.push('object must be a string if provided');
      validationDetails.push({
        field: 'object',
        issue: 'invalid_type',
        received: { type: typeof body.object, value: body.object },
        expected: 'string'
      });
    } else if (!isValidUri(body.object)) {
      errors.push('object must be a valid URI if provided (e.g., https://example.com/resource, urn:uuid:123)');
      validationDetails.push({
        field: 'object',
        issue: 'invalid_uri_format',
        received: body.object,
        expected: 'valid URI with scheme (http://, https://, urn:, did:, etc.)'
      });
    }
  }
  
  // Validate sourceURI field as URI if provided
  if (body.sourceURI !== undefined && body.sourceURI !== null) {
    if (typeof body.sourceURI !== 'string') {
      errors.push('sourceURI must be a string if provided');
      validationDetails.push({
        field: 'sourceURI',
        issue: 'invalid_type',
        received: { type: typeof body.sourceURI, value: body.sourceURI },
        expected: 'string'
      });
    } else if (!isValidUri(body.sourceURI)) {
      errors.push('sourceURI must be a valid URI if provided (e.g., https://example.com/resource, urn:uuid:123)');
      validationDetails.push({
        field: 'sourceURI',
        issue: 'invalid_uri_format',
        received: body.sourceURI,
        expected: 'valid URI with scheme (http://, https://, urn:, did:, etc.)'
      });
    }
  }
  
  // Enum validation
  if (body.howKnown && !['FIRST_HAND', 'SECOND_HAND', 'WEB_DOCUMENT', 'VERIFIED_LOGIN', 'BLOCKCHAIN', 'SIGNED_DOCUMENT', 'PHYSICAL_DOCUMENT', 'INTEGRATION', 'RESEARCH', 'OPINION', 'OTHER'].includes(body.howKnown)) {
    errors.push('howKnown must be a valid enum value');
    validationDetails.push({
      field: 'howKnown',
      issue: 'invalid_enum_value',
      received: body.howKnown,
      expected: ['FIRST_HAND', 'SECOND_HAND', 'WEB_DOCUMENT', 'VERIFIED_LOGIN', 'BLOCKCHAIN', 'SIGNED_DOCUMENT', 'PHYSICAL_DOCUMENT', 'INTEGRATION', 'RESEARCH', 'OPINION', 'OTHER']
    });
  }
  
  if (body.issuerIdType && !['DID', 'ETH', 'PUBKEY', 'URL'].includes(body.issuerIdType)) {
    errors.push('issuerIdType must be a valid enum value');
    validationDetails.push({
      field: 'issuerIdType',
      issue: 'invalid_enum_value',
      received: body.issuerIdType,
      expected: ['DID', 'ETH', 'PUBKEY', 'URL']
    });
  }
  
  // Number fields validation
  if (body.confidence !== undefined && body.confidence !== null) {
    const conf = Number(body.confidence);
    if (isNaN(conf) || conf < 0 || conf > 1) {
      errors.push('confidence must be a number between 0 and 1');
      validationDetails.push({
        field: 'confidence',
        issue: 'invalid_range',
        received: body.confidence,
        expected: 'number between 0 and 1'
      });
    }
  }
  
  if (body.stars !== undefined && body.stars !== null) {
    const stars = Number(body.stars);
    if (isNaN(stars) || !Number.isInteger(stars) || stars < 0 || stars > 5) {
      errors.push('stars must be an integer between 0 and 5');
      validationDetails.push({
        field: 'stars',
        issue: 'invalid_range',
        received: body.stars,
        expected: 'integer between 0 and 5'
      });
    }
  }
  
  if (body.score !== undefined && body.score !== null) {
    const score = Number(body.score);
    if (isNaN(score) || score < -1 || score > 1) {
      errors.push('score must be a number between -1 and 1');
      validationDetails.push({
        field: 'score',
        issue: 'invalid_range',
        received: body.score,
        expected: 'number between -1 and 1'
      });
    }
  }
  
  if (body.amt !== undefined && body.amt !== null) {
    const amt = Number(body.amt);
    if (isNaN(amt)) {
      errors.push('amt must be a valid number');
      validationDetails.push({
        field: 'amt',
        issue: 'invalid_type',
        received: body.amt,
        expected: 'valid number'
      });
    }
  }
  
  // Images validation with enhanced logging
  if (body.images !== undefined && body.images !== null) {
    if (!Array.isArray(body.images)) {
      errors.push('images must be an array if provided');
      validationDetails.push({
        field: 'images',
        issue: 'invalid_type',
        received: { type: typeof body.images, value: body.images },
        expected: 'array'
      });
    } else {
      // Log first image keys for debugging
      if (body.images.length > 0) {
        console.log(`🔍 Validating ${body.images.length} images. First image keys:`, 
          body.images[0] && typeof body.images[0] === 'object' ? Object.keys(body.images[0]) : 'N/A');
      }
      
      body.images.forEach((img: any, index: number) => {
        const validation = validateImageData(img, index);
        if (!validation.isValid) {
          errors.push(validation.error!);
          validationDetails.push({
            field: `images[${index}]`,
            issue: 'validation_failed',
            error: validation.error,
            details: validation.details,
            received: img && typeof img === 'object' ? {
              keys: Object.keys(img),
              types: Object.keys(img).reduce((acc: any, key) => {
                acc[key] = typeof img[key];
                return acc;
              }, {})
            } : img
          });
        }
      });
    }
  }
  
  return { isValid: errors.length === 0, errors, validationDetails };
}


// Simple claim creation
export async function createClaim(req: AuthRequest, res: Response): Promise<Response | void> {
  console.log('=== POST /api/claims - Request received ===');
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request body summary:', {
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    hasImages: !!req.body?.images,
    imagesType: typeof req.body?.images,
    imagesLength: Array.isArray(req.body?.images) ? req.body.images.length : 'N/A',
    bodySize: JSON.stringify(req.body).length
  });
  
  // Enhanced image logging
  if (req.body?.images) {
    console.log('=== IMAGES PAYLOAD ANALYSIS ===');
    console.log('Images array length:', req.body.images.length);
    req.body.images.forEach((img: any, index: number) => {
      console.log(`Image ${index + 1}:`, {
        type: typeof img,
        keys: img && typeof img === 'object' ? Object.keys(img) : 'N/A',
        filename: img?.filename,
        contentType: img?.contentType,
        hasBase64: !!img?.base64,
        base64Type: typeof img?.base64,
        base64Length: img?.base64 ? img.base64.length : 0,
        base64Prefix: img?.base64 ? img.base64.substring(0, 50) + '...' : 'N/A',
        hasMetadata: !!img?.metadata,
        metadata: img?.metadata,
        effectiveDate: img?.effectiveDate
      });
    });
    console.log('================================');
  }
  
  console.log('User context:', JSON.stringify(req.user, null, 2));
  console.log('============================================');

  try {
    // Validate request body
    const validation = validateRequestBody(req.body);
    if (!validation.isValid) {
      console.error('=== VALIDATION ERRORS ===');
      console.error('Validation errors:', validation.errors);
      console.error('Validation details:', JSON.stringify(validation.validationDetails, null, 2));
      console.error('Request body structure:', JSON.stringify(req.body, (key, value) => {
        // Truncate base64 data for logging
        if (key === 'base64' && typeof value === 'string' && value.length > 100) {
          return value.substring(0, 100) + `... (truncated, total length: ${value.length})`;
        }
        return value;
      }, 2));
      console.error('🚨 VALIDATION FAILED - FRONTEND DEBUG INFO:');
      console.error('❌ Validation Errors:', validation.errors);
      console.error('📊 Request Summary:', {
        hasImages: !!req.body.images,
        imageCount: req.body.images ? req.body.images.length : 0,
        bodyKeys: Object.keys(req.body),
        firstImageKeys: req.body.images && req.body.images[0] ? Object.keys(req.body.images[0]) : []
      });
      
      // Log detailed image information for debugging
      if (req.body.images && Array.isArray(req.body.images)) {
        console.error('🖼️ Images[0] DEBUG INFO:');
        if (req.body.images[0]) {
          console.error('   - Received keys:', Object.keys(req.body.images[0]));
          console.error('   - Required keys:', ['filename', 'contentType', 'base64', 'metadata', 'effectiveDate']);
          console.error('   - Missing keys:', ['filename', 'contentType', 'base64', 'metadata', 'effectiveDate'].filter(key => !req.body.images[0].hasOwnProperty(key)));
        } else {
          console.error('   - First image is null/undefined');
        }
      }
      
      console.error('🔍 Most Common Issues:');
      console.error('   1. Missing required image fields: filename, contentType, base64, metadata, effectiveDate');
      console.error('   2. Using old field names like "type" instead of "contentType"');
      console.error('   3. Nested structures in metadata (e.g., metadata.metadata)');
      console.error('   4. Invalid base64 format');
      console.error('✅ Expected Format: { filename: "image.jpg", contentType: "image/jpeg", base64: "data:image/jpeg;base64,abc123...", metadata: {...}, effectiveDate: "2024-01-01T00:00:00Z" }');
      console.error('=========================');
      return res.status(400).json({
        error: `Validation failed: ${validation.errors.join('; ')}`,
        details: validation.errors,
        validationDetails: validation.validationDetails,
        received: {
          ...req.body,
          images: req.body.images ? req.body.images.map((img: any, index: number) => ({
            index,
            type: typeof img,
            keys: img && typeof img === 'object' ? Object.keys(img) : 'N/A',
            hasRequiredFields: img && typeof img === 'object' ? {
              filename: !!img.filename,
              contentType: !!img.contentType,
              base64: !!img.base64,
              metadata: !!img.metadata,
              effectiveDate: !!img.effectiveDate
            } : false
          })) : undefined
        },
        // Add a debug section for easier frontend debugging
        debug: {
          validationErrors: validation.errors,
          validationDetails: validation.validationDetails,
          hasImages: !!req.body.images,
          imageCount: req.body.images ? req.body.images.length : 0,
          firstImageKeys: req.body.images && req.body.images[0] ? Object.keys(req.body.images[0]) : [],
          frontendHelp: {
            expectedImageSchema: {
              filename: "string (required) - Name of the image file",
              contentType: "string (required) - MIME type like 'image/jpeg' or 'image/png'",
              base64: "string (required) - Base64 encoded image data",
              metadata: "object (required) - Additional metadata, can be empty {}",
              effectiveDate: "string (required) - ISO date string or Date object"
            },
            commonMistakes: [
              "Using 'type' instead of 'contentType'",
              "Missing required fields",
              "Nesting required fields inside metadata",
              "Invalid base64 format"
            ]
          }
        }
      });
    }

    const {
      name,
      subject,
      claim,
      object,
      sourceURI,
      howKnown,
      confidence,
      statement,
      aspect,
      stars,
      score,
      amt,
      unit,
      proof: clientProof,
      issuerId: clientIssuerId,
      issuerIdType: clientIssuerIdType,
      images, // Add images field
      videoUrl, // Video testimonial URL (uploaded separately via /api/video/upload)
      subjectEntityType, // Optional hint for subject entity type (PERSON/ORGANIZATION)
      replace, // If true, delete existing duplicate and create new (claims are immutable)
      replaceClaimId, // Explicit id of the claim to delete+replace (preferred over `replace`)
      effectiveDate, // When the event being claimed actually occurred (client-supplied)
      ...otherFields // Capture any other fields for debugging
    } = req.body;
    
    // Log if there are unexpected fields being sent
    if (Object.keys(otherFields).length > 0) {
      console.log('⚠️ Unexpected fields received (will be ignored):', Object.keys(otherFields));
    }
    
    const userId = req.user?.id || req.body.issuerId;
    console.log('Processing claim for userId:', userId);

    // Convert user ID to proper URI format
    const userIdUri = userIdToUri(userId);
    if (userId && !userIdUri) {
      console.warn('userId is not a valid URI and cannot be converted:', userId);
    }

    // Issuer attribution precedence:
    //   1. authenticated user (their id -> URI; later a custodial/Bluesky DID)
    //   2. verified API-key client (e.g. workers.vc) — used when NO user is signed in
    //   3. self-asserted body issuerId (legacy fallback)
    const verifiedClientIssuer = req.user?.id ? null : await getVerifiedClientIssuer(req);
    const resolvedIssuerId =
      (req.user?.id ? userIdUri : null) || verifiedClientIssuer || clientIssuerId || userIdUri || null;
    const resolvedIssuerIdType =
      resolvedIssuerId && resolvedIssuerId.startsWith('did:') ? 'DID' : (clientIssuerIdType || 'URL');
    if (verifiedClientIssuer) {
      console.log('Attributing claim to verified client issuer:', verifiedClientIssuer);
    }

    if (!subject || !claim) {
      return res.status(400).json({ error: "Subject and claim are required" });
    }

    // Determine auth method based on how the user authenticated
    let authMethod: "google-oauth" | "password" | "api-token";
    if (req.user?.email && req.user?.email.includes("@")) {
      // If we have an email, likely OAuth (could be Google or other OAuth provider)
      authMethod = "google-oauth";
    } else if (req.user?.id) {
      // If we have a user ID but no email, likely password auth
      authMethod = "password";
    } else {
      // Otherwise, it's an API token
      authMethod = "api-token";
    }

    // Prepare claim data
    const claimData = {
      subject,
      claim,
      object: object || null,
      sourceURI: sourceURI || userIdUri || null,
      howKnown: howKnown || 'FIRST_HAND',
      confidence: confidence !== undefined ? Number(confidence) : 1.0,
      statement: statement || null,
      aspect: aspect || null,
      stars: stars !== undefined ? Number(stars) : null,
      score: score !== undefined ? Number(score) : null,
      amt: amt !== undefined ? Number(amt) : null,
      unit: unit || null,
      issuerId: resolvedIssuerId,
      issuerIdType: resolvedIssuerIdType,
      effectiveDate: (() => {
        if (!effectiveDate) return new Date();
        const d = new Date(effectiveDate);
        return isNaN(d.getTime()) ? new Date() : d;
      })()
    };
    
    console.log('Prepared claim data:', JSON.stringify(claimData, null, 2));

    // ---- Replace / duplicate handling ---------------------------------------
    // "Same signer" is enforced against the VERIFIED issuer ONLY — the logged-in
    // user or a valid API-key client — never the self-asserted body issuerId. A
    // self-asserted, unauthenticated issuerId can never delete anyone's claim.
    const verifiedIssuerId =
      (req.user?.id ? userIdUri : null) || verifiedClientIssuer || null;

    let replacedClaimId: number | null = null;
    // On replace, the old claim's media rows are re-pointed to the new claim ONLY
    // when the new post brings no media of its own. Media is NEVER deleted.
    let carryMediaFromClaimId: number | null = null;

    // Accept boolean true or common truthy string/number forms ("true", "1", 1) —
    // clients often send replace as a string, which must still trigger delete+replace.
    const wantsReplace = replace === true || replace === 1 || replace === '1' ||
      (typeof replace === 'string' && replace.toLowerCase() === 'true');

    // Does the new post carry its own media?
    const hasNewMedia =
      (Array.isArray(images) && images.length > 0) ||
      (typeof videoUrl === 'string' && videoUrl.trim().length > 0);

    // Determine the claim to replace (delete + recreate), if any.
    let replaceTarget: { id: number; issuerId: string | null } | null = null;

    // Preferred path: client names the exact claim id to replace — no guessing.
    if (replaceClaimId !== undefined && replaceClaimId !== null && replaceClaimId !== '') {
      const targetId = Number(replaceClaimId);
      if (!Number.isInteger(targetId)) {
        return res.status(400).json({ success: false, error: 'replaceClaimId must be an integer' });
      }
      const found = await prisma.claim.findUnique({
        where: { id: targetId },
        select: { id: true, issuerId: true }
      });
      if (!found) {
        return res.status(404).json({ success: false, error: 'replaceClaimId not found', code: 'REPLACE_TARGET_NOT_FOUND' });
      }
      replaceTarget = found;
    }

    // Exact-duplicate detection (subject + issuerId + claim + sourceURI + statement).
    // Legacy: replace:true with no explicit id deletes this exact duplicate; the
    // key is unique, so this is unambiguous. Without replace -> 409.
    if (!replaceTarget) {
      const exactDuplicate = await prisma.claim.findFirst({
        where: {
          subject: claimData.subject,
          issuerId: claimData.issuerId,
          claim: claimData.claim,
          sourceURI: claimData.sourceURI,
          statement: claimData.statement
        },
        select: { id: true, issuerId: true, createdAt: true, subject: true, claim: true }
      });
      if (exactDuplicate) {
        if (wantsReplace) {
          replaceTarget = { id: exactDuplicate.id, issuerId: exactDuplicate.issuerId };
        } else {
          return res.status(409).json({
            success: false,
            error: 'Duplicate claim exists',
            code: 'DUPLICATE_CLAIM',
            existingClaim: {
              id: exactDuplicate.id,
              createdAt: exactDuplicate.createdAt,
              subject: exactDuplicate.subject,
              claim: exactDuplicate.claim,
              issuerId: exactDuplicate.issuerId
            },
            hint: 'Re-POST with replaceClaimId set to this id (or replace: true) to delete the existing claim and create a new one. Claims are immutable.',
            duplicateKey: {
              subject: claimData.subject,
              issuerId: claimData.issuerId,
              claim: claimData.claim,
              sourceURI: claimData.sourceURI,
              statement: claimData.statement ? claimData.statement.substring(0, 100) + (claimData.statement.length > 100 ? '...' : '') : null
            }
          });
        }
      }
    }

    // Auth gate: only the SAME VERIFIED issuer may delete/replace a claim.
    if (replaceTarget) {
      if (!verifiedIssuerId || verifiedIssuerId !== replaceTarget.issuerId) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to replace this claim',
          code: 'REPLACE_FORBIDDEN',
          hint: 'Replace requires the same verified issuer (logged-in user or API key) that created the claim.'
        });
      }
      // New media supersedes; no new media -> carry the old media forward.
      // Media is NEVER deleted either way.
      if (!hasNewMedia) carryMediaFromClaimId = replaceTarget.id;
    }

    // Use client-provided proof if available, otherwise try server signing
    let proof = clientProof || null;

    if (!proof) {
      // Only try server signing if no client proof was provided
      try {
        proof = await signClaimWithServerKey(claimData, authMethod);
        console.log("Claim signed by server for user:", userId);
      } catch (error) {
        console.error("Warning: Failed to sign claim with server key:", error);
        // Continue without proof - claim creation should not fail
      }
    } else {
      console.log("Using client-provided proof from:", clientIssuerId);
      // Store the proof as a JSON string if it's an object
      if (typeof proof === "object") {
        proof = JSON.stringify(proof);
      }
    }

    // Create claim with proof. When replacing, the delete of the old claim + edges,
    // the new claim create, and the media re-point are COUPLED in one transaction
    // so we NEVER end up with the old claim gone and no replacement. Media rows are
    // never deleted — on carry they are re-pointed; otherwise left in place (unlinked).
    console.log('Creating claim in database...');
    let newClaim;
    try {
      newClaim = await prisma.$transaction(async (tx) => {
        if (replaceTarget) {
          const deletedEdges = await tx.edge.deleteMany({ where: { claimId: replaceTarget.id } });
          console.log(`Deleted ${deletedEdges.count} edges for claim ${replaceTarget.id}`);
          await tx.claim.delete({ where: { id: replaceTarget.id } });
          replacedClaimId = replaceTarget.id;
          console.log(`Deleted claim ${replaceTarget.id} (media preserved, never deleted)`);
        }

        const created = await tx.claim.create({ data: { ...claimData, proof } });

        if (carryMediaFromClaimId) {
          // Replacement brought no media of its own — the old claim's image/video
          // rows (including the uploaded video URL) now belong to the new claim.
          const carried = await tx.image.updateMany({
            where: { claimId: carryMediaFromClaimId },
            data: { claimId: created.id }
          });
          console.log(`Carried ${carried.count} media row(s) from replaced claim ${carryMediaFromClaimId} to ${created.id}`);
        }

        return created;
      });
    } catch (e: any) {
      // DB unique constraint (subject, issuerId, claim, sourceURI, left(statement,500)).
      // The pre-check above matches full statement; this catches the >500-char edge and
      // any race — return 409 (never a 500) so the client can offer delete & replace.
      // Inside the transaction this also rolls back the replace-delete, so the old
      // claim is preserved when the new one collides with a different claim.
      if (e?.code === 'P2002') {
        const dup = await prisma.claim.findFirst({
          where: {
            subject: claimData.subject,
            issuerId: claimData.issuerId,
            claim: claimData.claim,
            sourceURI: claimData.sourceURI,
            statement: claimData.statement
          }
        });
        return res.status(409).json({
          success: false,
          error: 'Duplicate claim exists',
          code: 'DUPLICATE_CLAIM',
          existingClaim: dup ? { id: dup.id, createdAt: dup.createdAt } : undefined,
          hint: 'Use replaceClaimId (or replace: true) to delete the existing claim and create a new one.'
        });
      }
      throw e;
    }

    console.log('Claim created successfully with ID:', newClaim.id);

    // Process base64 images if provided
    const imageRecords = [];
    const imageErrors = [];
    if (images && Array.isArray(images) && images.length > 0) {
      console.log(`Processing ${images.length} images...`);
      // Process images if provided - store directly in database
      for (let i = 0; i < images.length; i++) {
        const imageData = images[i];
        console.log(`Processing image ${i + 1}/${images.length}:`, {
          filename: imageData.filename,
          contentType: imageData.contentType,
          hasBase64: !!imageData.base64,
          hasMetadata: !!imageData.metadata,
          effectiveDate: imageData.effectiveDate
        });
        
        // Handle base64 image data
        if (imageData.base64) {
          try {
            console.log(`Processing image ${i + 1} base64 data...`);
            
            // Extract the base64 data (remove data:image/type;base64, prefix if present)
            const base64Data = imageData.base64.replace(/^data:image\/[a-z]+;base64,/, '');
            
            // Validate base64 can be decoded
            let imageBuffer: Buffer;
            try {
              imageBuffer = Buffer.from(base64Data, 'base64');
              console.log(`Image ${i + 1} decoded successfully, size: ${imageBuffer.length} bytes`);
            } catch (decodeError) {
              throw new Error(`Invalid base64 encoding: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
            }
            
            // Check buffer size
            if (imageBuffer.length === 0) {
              throw new Error('Decoded image buffer is empty');
            }
            
            if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB limit
              throw new Error(`Image too large: ${Math.round(imageBuffer.length / 1024 / 1024)}MB (max 10MB)`);
            }
            
            // Generate a simple signature
            const signature = crypto
              .createHash('sha256')
              .update(imageBuffer)
              .digest('base64');
            
            // Upload to Backblaze B2 (same bucket as videos) instead of inlining base64 in the DB.
            const contentType = imageData.contentType || 'image/jpeg';
            const ext = IMAGE_EXT[contentType] || 'bin';
            const userSeg = (userIdUri || 'anonymous').replace(/[^a-zA-Z0-9]/g, '_');
            const key = `images/${userSeg}/${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
            let imageUrl: string;
            if (process.env.LT_STORAGE_KEY && process.env.LT_STORAGE_SECRET) {
              try {
                await getImageS3Client().upload({
                  Bucket: imageStorageBucket(),
                  Key: key,
                  Body: imageBuffer,
                  ContentType: contentType,
                  ACL: 'public-read',
                }).promise();
                imageUrl = `${imageStorageCdnUrl()}/${key}`;
                console.log(`Image ${i + 1} uploaded to B2: ${imageUrl} (${imageBuffer.length} bytes)`);
              } catch (uploadErr) {
                // Don't lose the image on a transient storage error — fall back to inline.
                console.error(`Image ${i + 1} B2 upload failed, storing inline as fallback:`, uploadErr instanceof Error ? uploadErr.message : uploadErr);
                imageUrl = `data:${contentType};base64,${base64Data}`;
              }
            } else {
              console.error(`Image ${i + 1}: LT_STORAGE not configured — storing inline (set LT_STORAGE_* to use B2)`);
              imageUrl = `data:${contentType};base64,${base64Data}`;
            }
            
            const imageRecord = await prisma.image.create({
              data: {
                claimId: newClaim.id,
                url: imageUrl, // Store as data URL
                digestMultibase: `f${signature}`, // Simple multibase encoding
                metadata: {
                  ...imageData.metadata,
                  contentType: imageData.contentType || 'image/jpeg',
                  filename: imageData.filename || `image_${i + 1}`
                },
                effectiveDate: imageData.effectiveDate ? new Date(imageData.effectiveDate) : new Date(),
                owner: userIdUri || '',
                signature
              }
            });
            
            imageRecords.push(imageRecord);
            console.log(`Image ${i + 1} database record created with ID:`, imageRecord.id);
          } catch (error) {
            const errorMsg = `Failed to process image ${i + 1}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(errorMsg, error);
            imageErrors.push({
              index: i + 1,
              error: errorMsg,
              imageData: {
                filename: imageData.filename,
                contentType: imageData.contentType,
                hasBase64: !!imageData.base64,
                base64Length: imageData.base64?.length || 0,
                hasMetadata: !!imageData.metadata,
                effectiveDate: imageData.effectiveDate
              }
            });
            // Continue processing other images
          }
        } else {
          const errorMsg = `Image ${i + 1}: Missing base64 data`;
          console.error(errorMsg);
          imageErrors.push({
            index: i + 1,
            error: errorMsg,
            imageData: {
              keys: Object.keys(imageData),
              hasBase64: false
            }
          });
        }
      }
    }

    // Process videoUrl if provided (uploaded separately via /api/video/upload)
    if (videoUrl && typeof videoUrl === 'string' && videoUrl.trim().length > 0) {
      console.log('Processing video URL:', videoUrl);
      try {
        // Generate a simple signature for the video URL
        const videoSignature = crypto
          .createHash('sha256')
          .update(videoUrl)
          .digest('base64');

        // Save video as an Image record with type: 'video' in metadata
        const videoRecord = await prisma.image.create({
          data: {
            claimId: newClaim.id,
            url: videoUrl, // Store the external video URL directly
            digestMultibase: `f${videoSignature}`,
            metadata: {
              type: 'video',
              contentType: 'video/webm',
              filename: `video_${newClaim.id}.webm`
            },
            effectiveDate: new Date(),
            owner: userIdUri || '',
            signature: videoSignature
          }
        });

        imageRecords.push(videoRecord);
        console.log('Video record created with ID:', videoRecord.id);
      } catch (videoError) {
        console.error('Failed to save video URL:', videoError);
        imageErrors.push({
          index: 'video',
          error: `Failed to save video: ${videoError instanceof Error ? videoError.message : String(videoError)}`,
          videoUrl
        });
      }
    }

    console.log('Starting background processes...');

    // Detect entities in the background
    await EntityDetector.processClaimEntities(newClaim, name);

// Still fine to run the heavy pipeline in background
     PipelineTrigger.processClaim(newClaim.id, subjectEntityType).catch(console.error);
     AtprotoPublisher.publishClaim(newClaim, req.user?.did).catch(console.error);
    // Include image records in response
    const response: any = {
      success: true,
      claim: newClaim,
      ...(replacedClaimId ? { replaced: true, replacedClaimId } : {}),
      images: imageRecords.map(img => ({
        id: img.id,
        claimId: img.claimId,
        url: `/api/images/${img.id}`, // Always use the API endpoint for serving images
        contentType: (img.metadata as any)?.contentType || 'image/jpeg',
        filename: (img.metadata as any)?.filename || `image_${img.id}`,
        digestMultibase: img.digestMultibase,
        metadata: img.metadata,
        effectiveDate: img.effectiveDate,
        createdDate: img.createdDate,
        owner: img.owner,
        signature: img.signature
      })),
      imageProcessing: {
        total: images?.length || 0,
        successful: imageRecords.length,
        failed: imageErrors.length,
        errors: imageErrors.length > 0 ? imageErrors : undefined,
        summary: imageErrors.length > 0 ? 
          `${imageRecords.length}/${images?.length || 0} images processed successfully. ${imageErrors.length} failed.` :
          `All ${imageRecords.length} images processed successfully.`
      }
    };
    
    console.log('=== Response being sent ===');
    console.log('Response:', JSON.stringify(response, null, 2));
    console.log('===========================');
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('=== Error creating claim ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('============================');
    
    const errorResponse = {
      success: false,
      error: 'Failed to create claim',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      receivedData: req.body
    };
    
    console.log('Error response being sent:', JSON.stringify(errorResponse, null, 2));
    return res.status(500).json(errorResponse);
  }
}

/**
 * Plain delete: remove a claim and its edges, leaving its media rows untouched.
 * Media is NEVER deleted — the Image rows survive (unlinked; their claimId now
 * points at a gone claim). Auth-gated to the SAME VERIFIED issuer (logged-in user
 * or valid API key) that created the claim — never a self-asserted body issuerId.
 */
export async function deleteClaim(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, error: 'Invalid claim id' });
    }

    const claim = await prisma.claim.findUnique({
      where: { id },
      select: { id: true, issuerId: true }
    });
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }

    const userId = req.user?.id;
    const verifiedClientIssuer = userId ? null : await getVerifiedClientIssuer(req);
    const verifiedIssuerId = (userId ? userIdToUri(userId) : null) || verifiedClientIssuer || null;

    if (!verifiedIssuerId || verifiedIssuerId !== claim.issuerId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this claim',
        code: 'DELETE_FORBIDDEN',
        hint: 'Delete requires the same verified issuer (logged-in user or API key) that created the claim.'
      });
    }

    // Edges reference the claim (FK); delete them, then the claim. Media is left in place.
    const deletedEdges = await prisma.edge.deleteMany({ where: { claimId: id } });
    await prisma.claim.delete({ where: { id } });
    console.log(`Plain-deleted claim ${id} (${deletedEdges.count} edges; media preserved, never deleted)`);

    return res.json({
      success: true,
      deletedClaimId: id,
      note: 'Media rows preserved (unlinked). Claims are immutable.'
    });
  } catch (error) {
    console.error('Error deleting claim:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete claim' });
  }
}

// Get claim by ID
export async function getClaim(req: Request, res: Response): Promise<Response | void> {
  console.log('=== GET /api/claims/:id - Request received ===');
  console.log('Request params:', JSON.stringify(req.params, null, 2));
  console.log('Request query:', JSON.stringify(req.query, null, 2));
  console.log('===============================================');

  try {
    const { id } = req.params;
    
    // Validate ID parameter
    const claimId = parseInt(id);
    if (isNaN(claimId) || claimId <= 0) {
      console.error('Invalid claim ID provided:', id);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid claim ID',
        details: 'Claim ID must be a positive integer',
        received: { id }
      });
    }
    
    console.log('Fetching claim with ID:', claimId);
    
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true,
          },
        },
      },
    });

    if (!claim) {
      console.log('Claim not found with ID:', claimId);
      return res.status(404).json({ 
        success: false,
        error: 'Claim not found',
        details: `No claim exists with ID ${claimId}`,
        claimId
      });
    }
    
    console.log('Claim found, fetching associated images...');
    
    // Get associated images
    const images = await prisma.image.findMany({
      where: { claimId: claim.id }
    });
    
    console.log(`Found ${images.length} images for claim ${claimId}`);
    
    const response = {
      success: true,
      claim,
      images: images.map(formatMediaRecord)
    };

    console.log('=== Response being sent ===');
    console.log('Response size - claim:', !!response.claim, 'images count:', response.images.length);
    console.log('===========================');

    return res.status(200).json(response);
  } catch (error) {
    console.error('=== Error fetching claim ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('============================');
    
    const errorResponse = {
      success: false,
      error: 'Failed to fetch claim',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      requestParams: req.params
    };
    
    console.log('Error response being sent:', JSON.stringify(errorResponse, null, 2));
    return res.status(500).json(errorResponse);
  }
}

// Get claims for a subject and all linked subjects
export async function getClaimsBySubject(req: Request, res: Response) {
  console.log('=== GET /api/claims/subject/:uri - Request received ===');
  console.log('Request params:', JSON.stringify(req.params, null, 2));
  console.log('Request query:', JSON.stringify(req.query, null, 2));
  console.log('=======================================================');

  try {
    const { uri } = req.params;
    const { page = 1, limit = 50, includeLinked = 'true', depth = '1' } = req.query;

    // Validate query parameters
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const depthNum = Number(depth);
    
    if (isNaN(pageNum) || pageNum < 1) {
      console.error('Invalid page parameter:', page);
      return res.status(400).json({
        success: false,
        error: 'Invalid page parameter',
        details: 'Page must be a positive integer',
        received: { page }
      });
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      console.error('Invalid limit parameter:', limit);
      return res.status(400).json({
        success: false,
        error: 'Invalid limit parameter',
        details: 'Limit must be between 1 and 1000',
        received: { limit }
      });
    }
    
    if (!uri) {
      console.error('Missing URI parameter');
      return res.status(400).json({
        success: false,
        error: 'Missing URI parameter',
        details: 'URI parameter is required'
      });
    }
    
    // Try to decode as base64 first (new format)
    let decodedUri = uri;

    // Check if it looks like base64 (alphanumeric plus +/= and no URI characters)
    if (/^[A-Za-z0-9+/=]+$/.test(uri) && uri.length > 10) {
      try {
        // Attempt base64 decode
        const decoded = Buffer.from(uri, "base64").toString("utf-8");
        // Verify it's a valid URI by checking for URI scheme pattern
        // Any scheme followed by : is valid (http:, https:, urn:, did:, mailto:, etc.)
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) {
          decodedUri = decoded;
          console.log("Decoded base64 URI:", decodedUri);
        }
      } catch (e) {
        // Not valid base64, use as-is
        console.log('URI is not valid base64, using as-is');
      }
    } else {
      // Old format - decode URI component
      try {
        decodedUri = decodeURIComponent(uri);
        console.log('Decoded URI component:', decodedUri);
      } catch (e) {
        console.log('Failed to decode URI component, using as-is');
      }
    }

    console.log("Getting claims for subject:", decodedUri);

    // Find all linked subjects if requested
    let subjectsToQuery = [decodedUri];

    if (includeLinked === "true") {
      const linkedSubjects = await findLinkedSubjects(decodedUri);
      subjectsToQuery = Array.from(linkedSubjects);
      console.log("Found linked subjects:", subjectsToQuery);
    }

    // Get claims for all linked subjects
    console.log(`Querying claims for ${subjectsToQuery.length} subjects with pagination (page: ${pageNum}, limit: ${limitNum})...`);
    const claims = await prisma.claim.findMany({
      where: {
        subject: { in: subjectsToQuery },
      },

      orderBy: { effectiveDate: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,

      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true,
          },
        },
      },
    });
    
    console.log(`Found ${claims.length} claims`);
    
    // Get images for all claims
    const claimIds = claims.map(claim => claim.id);
    console.log('Fetching images for claims...');
    const allImages = await prisma.image.findMany({
      where: { claimId: { in: claimIds } }
    });
    
    console.log(`Found ${allImages.length} total images`);
    
    // Group images by claimId using formatMediaRecord helper
    const imagesByClaimId = allImages.reduce((acc, img) => {
      if (!acc[img.claimId]) {
        acc[img.claimId] = [];
      }
      acc[img.claimId].push(formatMediaRecord(img));
      return acc;
    }, {} as Record<number, any[]>);

    // If depth=2, fetch endorsements (claims where subject is this claim's URI)
    let endorsementsByClaimId: Record<number, any[]> = {};
    let endorsementImages: Record<number, any[]> = {};

    if (depthNum === 2 && claimIds.length > 0) {
      console.log('Fetching endorsements for depth=2...');

      // Build claim URIs for all claims
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const claimUris = claimIds.map(id => `${proto}://${host}/api/claim/${id}`);

      // Single query to get all endorsements
      const endorsements = await prisma.$queryRaw<any[]>`
        SELECT
          e.*,
          CAST(SUBSTRING(e.subject FROM '/api/claim/([0-9]+)$') AS INTEGER) as parent_claim_id
        FROM "Claim" e
        WHERE e.subject = ANY(${claimUris})
        ORDER BY e."effectiveDate" DESC
      `;

      console.log(`Found ${endorsements.length} endorsements`);

      // Get images for endorsements
      const endorsementIds = endorsements.map(e => e.id);
      if (endorsementIds.length > 0) {
        const endorsementImagesRaw = await prisma.image.findMany({
          where: { claimId: { in: endorsementIds } }
        });

        // Group endorsement images
        endorsementImages = endorsementImagesRaw.reduce((acc, img) => {
          if (!acc[img.claimId]) {
            acc[img.claimId] = [];
          }
          acc[img.claimId].push(formatMediaRecord(img));
          return acc;
        }, {} as Record<number, any[]>);
      }

      // Group endorsements by parent claim ID
      endorsementsByClaimId = endorsements.reduce((acc, endorsement) => {
        const parentId = endorsement.parent_claim_id;
        if (parentId) {
          if (!acc[parentId]) {
            acc[parentId] = [];
          }
          // Remove the helper field and add images
          const { parent_claim_id, ...endorsementData } = endorsement;
          acc[parentId].push({
            ...endorsementData,
            images: endorsementImages[endorsement.id] || []
          });
        }
        return acc;
      }, {} as Record<number, any[]>);
    }

    // Get total count for all subjects
    console.log('Getting total count...');
    const total = await prisma.claim.count({
      where: { subject: { in: subjectsToQuery } }
    });

    const response = {
      success: true,
      claims: claims.map(claim => ({
        ...claim,
        images: imagesByClaimId[claim.id] || [],
        ...(depthNum === 2 && { endorsements: endorsementsByClaimId[claim.id] || [] })
      })),
      linkedSubjects: subjectsToQuery,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      query: {
        originalUri: uri,
        decodedUri,
        includeLinked: includeLinked === 'true',
        depth: depthNum
      }
    };
    
    console.log('=== Response being sent ===');
    console.log('Response stats:', {
      claimsCount: response.claims.length,
      linkedSubjectsCount: response.linkedSubjects.length,
      totalClaims: response.pagination.total,
      currentPage: response.pagination.page,
      totalPages: response.pagination.totalPages

    });
    console.log('===========================');
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('=== Error fetching claims by subject ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('========================================');
    
    const errorResponse = {
      success: false,
      error: 'Failed to fetch claims',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      requestParams: req.params,
      requestQuery: req.query
    };
    
    console.log('Error response being sent:', JSON.stringify(errorResponse, null, 2));
    return res.status(500).json(errorResponse);
  }
}
