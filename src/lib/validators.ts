/**
 * URI validation utilities
 */

/**
 * Get the base URL for the application - single source of truth
 */
export function getBaseUrl(): string {
  return process.env.FRONTEND_URL || process.env.BASE_URL || 'https://live.linkedtrust.us';
}

/**
 * Check if a string is a valid URI with proper scheme and structure
 */
export function isValidUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') {
    return false;
  }
  
  // Check for basic URI pattern - must have a scheme
  const uriPattern = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
  
  if (!uriPattern) {
    return false;
  }
  
  try {
    // Use URL constructor for http/https URLs
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      new URL(uri);
      return true;
    }
    
    // For other schemes (urn:, did:, etc.), just check basic structure
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]+$/.test(uri);
  } catch {
    return false;
  }
}

/**
 * Convert a numeric user ID to a proper URI
 */
export function userIdToUri(userId: string | number | undefined): string | null {
  if (!userId) {
    return null;
  }
  
  const baseUrl = getBaseUrl();
  
  if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
    // Convert numeric ID to URI format
    return `${baseUrl}/user/${userId}`;
  } else if (typeof userId === 'string' && isValidUri(userId)) {
    // Already a valid URI (including DIDs)
    return userId;
  }
  
  return null;
}
