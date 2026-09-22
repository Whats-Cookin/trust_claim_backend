import { Claim } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface ClaimEntityNames {
  // The thing the claim is about. Only a client that actually knows what the
  // subject is may name it.
  subjectName?: string | null;
  // The person making the claim, identified by sourceURI. On an endorsement
  // this is the name they signed with - it belongs to them, not to what they
  // endorsed.
  sourceName?: string | null;
}

// A name nobody typed: one this codebase or the pipeline derived from the URI
// itself. Those are placeholders and an explicit, human-supplied name may
// replace them. A name a person actually gave is never overwritten.
function derivedNameCandidates(uri: string): string[] {
  const out = new Set<string>();
  try {
    const u = new URL(uri);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) {
      out.add(last);
      // pipeline lib/infer.extract_fallback_name: hyphens/underscores to spaces,
      // each word capitalised.
      out.add(
        last
          .replace(/[-_]/g, ' ')
          .split(' ')
          .filter(Boolean)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      );
    }
    out.add(u.hostname.replace(/^www\./, ''));
  } catch {
    /* not a URL - nothing is derivable, so nothing counts as a placeholder */
  }
  if (uri.startsWith('did:')) {
    const tail = uri.split(':').pop();
    if (tail) out.add(tail);
  }
  return [...out].filter(Boolean);
}

function isPlaceholderName(uri: string, stored: string | null | undefined): boolean {
  const s = (stored || '').trim();
  if (!s) return true;
  if (s === 'Unknown Resource' || s === 'Unknown') return true;
  return derivedNameCandidates(uri).some(c => c.toLowerCase() === s.toLowerCase());
}

export class EntityDetector {
  static async processClaimEntities(claim: Claim, names: ClaimEntityNames = {}) {
    // A claim body's "name" used to be applied to claim.subject, so every
    // endorsement renamed the endorsed thing to whoever signed last - five
    // testimonials for a community centre in Gaza left it named after the most
    // recent endorser. Names are routed by role now, and an existing name is
    // never overwritten.
    if (claim.subject) {
      await this.detectEntity(claim.subject, names.subjectName ?? null);
    }

    const sourceUri =
      claim.sourceURI && claim.sourceURI !== claim.issuerId ? claim.sourceURI : null;
    if (sourceUri) {
      await this.detectEntity(sourceUri, names.sourceName ?? null);
    }

    if (claim.object) {
      await this.detectEntity(claim.object, null);
    }
  }

  static async detectEntity(uri: string, name: any) {
    const existing = await prisma.uriEntity.findUnique({ where: { uri } });
    const newName = typeof name === 'string' ? name.trim() : '';
  
    if (existing) {
      // Replace only a placeholder - an empty name, or one derived from the URI.
      // A name a person supplied stands; a later claim carrying a different one
      // is not evidence that it is wrong.
      const mayNameEntity = !!newName && isPlaceholderName(uri, existing.name);
      if (mayNameEntity && existing.name !== newName) {
        await prisma.uriEntity.update({
          where: { uri },
          data: { name: newName },
        });
      } else if (newName && !mayNameEntity && existing.name !== newName) {
        console.log(
          `Keeping existing name for ${uri}: "${existing.name}" (claim offered "${newName}")`
        );
      }
  
      // ✅ Also align Node (used by reports) if it exists
      const node = await prisma.node.findFirst({ where: { nodeUri: uri } });
      if (node) {
        const updates: any = {};
        if (newName && isPlaceholderName(uri, node.name) && node.name !== newName) {
          updates.name = newName;
        }
        // Fix LinkedIn profile mislabel (should be PERSON)
        if (/linkedin\.com\/in\//i.test(uri) && node.entType !== 'PERSON') updates.entType = 'PERSON';
        if (Object.keys(updates).length) {
          await prisma.node.update({ where: { id: node.id }, data: updates });
        }
      }
  
      // Return fresh copy
      return await prisma.uriEntity.findUnique({ where: { uri } });
    }
  
    // Create new if not existing (prefer client name)
    const detection = await this.detectEntityType(uri);
    const finalName = newName || detection.name;
  
    try {
      const entity = await prisma.uriEntity.create({
        data: {
          uri,
          entityType: detection.entityType,
          entityTable: detection.entityTable,
          entityId: detection.entityId || uri,
          name: finalName,
        },
      });
  
      // Align Node if it already exists - again, placeholders only.
      const node = await prisma.node.findFirst({ where: { nodeUri: uri } });
      if (node) {
        const updates: any = {};
        if (finalName && isPlaceholderName(uri, node.name) && node.name !== finalName) {
          updates.name = finalName;
        }
        if (/linkedin\.com\/in\//i.test(uri) && node.entType !== 'PERSON') updates.entType = 'PERSON';
        if (Object.keys(updates).length) {
          await prisma.node.update({ where: { id: node.id }, data: updates });
        }
      }
  
      return entity;
    } catch (error) {
      console.log(`Entity already exists for URI: ${uri}`);
      return await prisma.uriEntity.findUnique({ where: { uri } });
    }
  }
  

  private static async detectEntityType(uri: string): Promise<{
    entityType: any;
    entityTable: string;
    entityId?: string;
    name?: string;
  }> {
    // Check if it's a credential
    const credential = await prisma.credential.findFirst({
      where: {
        OR: [{ id: uri }, { canonicalUri: uri }],
      },
    });

    if (credential) {
      return {
        entityType: "CREDENTIAL",
        entityTable: "Credential",
        entityId: credential.id,
        name: credential.name || undefined,
      };
    }

    // Check for existing nodes (might have been created by pipeline)
    const node = await prisma.node.findFirst({
      where: { nodeUri: uri },
    });

    if (node) {
      return {
        entityType: node.entType || "UNKNOWN",
        entityTable: "Node",
        entityId: node.id.toString(),
        name: node.name || undefined,
      };
    }

    // Pattern-based detection

    // DID patterns
    if (uri.startsWith("did:")) {
      if (uri.includes(":person:") || uri.includes(":key:")) {
        return {
          entityType: "PERSON",
          entityTable: "person_entities",
          name: uri.split(":").pop(),
        };
      }
      if (uri.includes(":org:") || uri.includes(":web:")) {
        return {
          entityType: "ORGANIZATION",
          entityTable: "organization_entities",
        };
      }
    }

    // URL patterns
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      // Social media profiles - LinkedIn personal
      if (uri.includes("linkedin.com/in/")) {
        return {
          entityType: "PERSON",
          entityTable: "person_entities",
          name: uri.split("/").pop(),
        };
      }

      // Twitter/X profiles (exclude non-profile paths)
      if (uri.includes("twitter.com/") || uri.includes("x.com/")) {
        const nonProfilePaths = ['/status/', '/search', '/explore', '/home', '/i/'];
        if (!nonProfilePaths.some(path => uri.includes(path))) {
          return {
            entityType: "PERSON",
            entityTable: "person_entities",
            name: uri.split("/").pop(),
          };
        }
      }

      // Bluesky profiles
      if (uri.includes("bsky.app/profile/") || uri.includes("bsky.social")) {
        return {
          entityType: "PERSON",
          entityTable: "person_entities",
          name: uri.split("/").pop(),
        };
      }

      // GitHub profiles (single path segment = user profile)
      if (uri.includes("github.com/")) {
        const path = uri.split("github.com/")[1]?.replace(/^\/|\/$/g, '') || '';
        const segments = path.split('/').filter(s => s);
        if (segments.length === 1) {
          return {
            entityType: "PERSON",
            entityTable: "person_entities",
            name: segments[0],
          };
        }
      }

      // Organization websites
      if (uri.includes("linkedin.com/company/") || /^https?:\/\/[^\/]+\/?$/.test(uri)) {
        // Root domain
        return {
          entityType: "ORGANIZATION",
          entityTable: "organization_entities",
          name: new URL(uri).hostname.replace("www.", ""),
        };
      }

      // Default to document for other URLs
      return {
        entityType: "DOCUMENT",
        entityTable: "documents",
        name: uri.split("/").pop() || "Document",
      };
    }

    // Email addresses
    if (uri.includes("@") && !uri.startsWith("http")) {
      return {
        entityType: "PERSON",
        entityTable: "person_entities",
        name: uri.split("@")[0],
      };
    }

    // URN patterns
    if (uri.startsWith("urn:")) {
      if (uri.includes(":credential:")) {
        return {
          entityType: "CREDENTIAL",
          entityTable: "Credential",
        };
      }
      if (uri.includes(":event:")) {
        return {
          entityType: "EVENT",
          entityTable: "events",
        };
      }
    }

    // Default
    return {
      entityType: "UNKNOWN",
      entityTable: "unknown",
      name: uri.split("/").pop() || uri.split(":").pop() || uri,
    };
  }

  // Batch process multiple URIs
  static async detectEntities(uris: string[], name?: any) {
    const results = [];

    // Check which URIs already exist
    const existing = await prisma.uriEntity.findMany({
      where: { uri: { in: uris } },
    });

    const existingUris = new Set(existing.map((e) => e.uri));
    const newUris = uris.filter((uri) => !existingUris.has(uri));

    // Process new URIs
    for (const uri of newUris) {
      const result = await this.detectEntity(uri, name);
      if (result) results.push(result);
    }

    return [...existing, ...results];
  }
}
