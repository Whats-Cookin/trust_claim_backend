/**
 * Utility functions for formatting claim display data
 */

/**
 * Formats a claim's display name based on claim type
 * 
 * For "has skill" claims: "<subject_name> has skill <object>"
 * For other claims: returns the original name
 * 
 * @param claim The claim object with claim, object fields
 * @param subject_name The subject_name from ClaimData
 * @param name The name field from ClaimData
 * @returns Formatted display name
 */
export function formatClaimDisplayName(
  claim: { claim: string; object?: string | null }, 
  subject_name?: string | null,
  name?: string | null
): string {
  // For "has skill" credentials
  if (claim.claim === "has skill" && claim.object) {
    // If we have a subject_name, use the "<subject_name> has skill <object>" format
    if (subject_name) {
      return `${subject_name} has skill ${claim.object}`;
    }
    // Fallback to just the skill name
    return claim.object;
  }
  
  // For legacy "credential" claims - should be rare as most should be converted
  if (claim.claim === "credential" && name) {
    return name;
  }
  
  // For other claim types, return the name or a placeholder
  return name || "Unnamed claim";
}

/**
 * Formats a feed entry for display
 * 
 * @param entry The feed entry
 * @returns The modified feed entry with formatted display
 */
export function formatFeedEntry(entry: any): any {
  // For display purposes only (doesn't modify database)
  if (entry.claim === "has skill" || entry.claim === "credential") {
    // Use subject_name + claim + object format if available
    if (entry.subject_name && entry.object) {
      entry.display_name = `${entry.subject_name} has skill ${entry.object}`;
    }
    // Otherwise fallback to using the object (skill name) if available
    else if (entry.object) {
      entry.display_name = entry.object;
    }
    // Last resort, use the name field
    else {
      entry.display_name = entry.name;
    }
  }
  // For other claim types, use name field
  else {
    entry.display_name = entry.name;
  }
  
  return entry;
} 