import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Script to specifically fix the test credentials we created
 */
async function fixTestCredentials() {
  try {
    console.log('Starting test credential fix...');
    
    // Get the test credentials we created
    const testCredentials = [
      { id: 119033, topic: "Web Development" },
      { id: 119034, topic: "Advanced Web Development" },
      { id: 119035, topic: "Cloud Computing" },
      { id: 119036, topic: "SQL Mastery" }
    ];

    let fixedCount = 0;
    let errorCount = 0;

    for (const cred of testCredentials) {
      try {
        console.log(`Fixing test credential ${cred.id}...`);
        
        // Get the corresponding ClaimData record
        const claimData = await prisma.claimData.findUnique({
          where: { claimId: cred.id }
        });
        
        if (!claimData) {
          console.log(`Skipping credential ${cred.id} - No ClaimData record`);
          continue;
        }

        // Get the corresponding Claim record
        const claim = await prisma.claim.findUnique({
          where: { id: cred.id }
        });

        if (!claim) {
          console.log(`Skipping credential ${cred.id} - No Claim record`);
          continue;
        }

        console.log(`  Old name: ${claimData.name}`);
        console.log(`  Old subject_name: ${claimData.subject_name}`);
        console.log(`  Old subject: ${claim.subject}`);
        console.log(`  New topic: ${cred.topic}`);
        
        // Update the ClaimData to set the correct topic name
        await prisma.claimData.update({
          where: { id: claimData.id },
          data: {
            name: cred.topic,
            subject_name: cred.topic
          }
        });
        
        console.log(`  ✅ Successfully fixed credential ${cred.id}`);
        fixedCount++;
      } catch (err) {
        console.error(`  ❌ Error fixing credential ${cred.id}:`, err);
        errorCount++;
      }
    }

    console.log('\nFix complete!');
    console.log(`Successfully fixed: ${fixedCount}`);
    console.log(`Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('Fix failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixTestCredentials()
  .then(() => console.log('Fix process finished'))
  .catch(e => console.error('Fix process failed:', e)); 