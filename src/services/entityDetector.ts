import { Claim } from "@prisma/client";
import { prisma } from "../lib/prisma";

export class EntityDetector {
  static async processClaimEntities(claim: Claim, name: any) {
    // Check each URI in the claim
    const urisToCheck = [
      claim.subject,
      claim.object,
      claim.sourceURI && claim.sourceURI !== claim.issuerId ? claim.sourceURI : null,
    ].filter(Boolean) as string[];

    for (const uri of urisToCheck) {
      await this.detectEntity(uri, name);
    }
  }

  static async detectEntity(uri: string, name: any) {
    const existing = await prisma.uriEntity.findUnique({ where: { uri } });
    const newName = typeof name === 'string' ? name.trim() : '';
  
    if (existing) {
      // ✅ Update entity name if client supplied one
      if (newName && existing.name !== newName) {
        await prisma.uriEntity.update({
          where: { uri },
          data: { name: newName },
        });
      }
  
      // ✅ Also align Node (used by reports) if it exists
      const node = await prisma.node.findFirst({ where: { nodeUri: uri } });
      if (node) {
        const updates: any = {};
        if (newName && node.name !== newName) updates.name = newName;
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
  
      // Align Node if it already exists
      const node = await prisma.node.findFirst({ where: { nodeUri: uri } });
      if (node) {
        const updates: any = {};
        if (finalName && node.name !== finalName) updates.name = finalName;
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
      // Social media profiles
      if (uri.includes("linkedin.com/in/") || uri.includes("twitter.com/") || uri.includes("github.com/")) {
        return {
          entityType: "PERSON",
          entityTable: "person_entities",
          name: uri.split("/").pop(),
        };
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
