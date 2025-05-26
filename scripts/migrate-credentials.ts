import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Migration script to update old credentials to the new field structure
 * 
 * Old structure:
 * - subject: contained the credential topic
 * - claimAddress: contained the verification URL
 * - ClaimData.name: could be inconsistent
 * - ClaimData.subject_name: stored some version of the topic
 * 
 * New structure:
 * - subject: contains the verification URL
 * - ClaimData.name: contains the credential topic
 * - ClaimData.subject_name: also contains the credential topic
 */
async function migrateCredentials() {
  try {
    console.log('Starting credential migration...');
    
    // Get all credential claims
    const credentials = await prisma.claim.findMany({
      where: { claim: 'credential' }
    });

    console.log(`Found ${credentials.length} credentials to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const credential of credentials) {
      try {
        // Get the corresponding ClaimData record
        const claimData = await prisma.claimData.findUnique({
          where: { claimId: credential.id }
        });
        
        if (!claimData) {
          console.log(`Skipping credential ${credential.id} - No ClaimData record`);
          skippedCount++;
          continue;
        }

        // Determine the correct topic and verification URL
        const oldTopic = credential.subject; // Old structure had topic in subject
        const verificationUrl = credential.claimAddress || `https://linkedclaims.com/view/${credential.id}`; // URL in claimAddress or default
        
        console.log(`Migrating credential ${credential.id}:`);
        console.log(`  Old topic: ${oldTopic}`);
        console.log(`  Old URL: ${verificationUrl}`);
        console.log(`  Old ClaimData.name: ${claimData.name}`);
        console.log(`  Old ClaimData.subject_name: ${claimData.subject_name}`);
        
        // Determine if migration is needed
        const needsMigration = 
          claimData.name !== oldTopic ||
          claimData.subject_name !== oldTopic ||
          credential.subject !== verificationUrl;
          
        if (!needsMigration) {
          console.log(`  Skipping - Already in correct format`);
          skippedCount++;
          continue;
        }

        // Update the ClaimData to use the correct field mapping
        await prisma.claimData.update({
          where: { id: claimData.id },
          data: {
            name: oldTopic, // Set name to the topic
            subject_name: oldTopic // Set subject_name to the topic as well
          }
        });
        
        // Update the Claim to use the correct field mapping
        await prisma.claim.update({
          where: { id: credential.id },
          data: {
            subject: verificationUrl // Set subject to the verification URL
          }
        });
        
        console.log(`  ✅ Successfully migrated credential ${credential.id}`);
        migratedCount++;
      } catch (err) {
        console.error(`  ❌ Error migrating credential ${credential.id}:`, err);
        errorCount++;
      }
    }

    console.log('\nMigration complete!');
    console.log(`Total credentials: ${credentials.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Skipped (already correct): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateCredentials()
  .then(() => console.log('Migration process finished'))
  .catch(e => console.error('Migration process failed:', e)); 