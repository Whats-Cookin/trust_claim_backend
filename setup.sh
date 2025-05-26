#!/bin/bash

# LinkedTrust Backend Setup Script
# This script sets up the new clean implementation

echo "LinkedTrust Backend Setup"
echo "========================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Must run from trust_claim_backend directory"
    exit 1
fi

# Step 1: Install dependencies
echo "Step 1: Installing dependencies..."
npm install

# Step 2: Generate Prisma client
echo "Step 2: Generating Prisma client..."
npx prisma generate

# Step 3: Run database migration
echo "Step 3: Running database migration..."
echo "This will:"
echo "  - Add CREDENTIAL to EntityType enum"
echo "  - Add fields to Credential table"
echo "  - Create uri_entities table"
echo "  - Drop ClaimData table"
echo ""
read -p "Continue with migration? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx prisma migrate dev --name add_credential_entity_system
else
    echo "Migration cancelled"
    exit 1
fi

# Step 4: Update .env if needed
echo "Step 4: Checking environment variables..."
if ! grep -q "PIPELINE_SERVICE_URL" .env; then
    echo "Adding PIPELINE_SERVICE_URL to .env..."
    echo "PIPELINE_SERVICE_URL=http://localhost:8001" >> .env
fi

if ! grep -q "BASE_URL" .env; then
    echo "Adding BASE_URL to .env..."
    echo "BASE_URL=https://linkedtrust.us" >> .env
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. Test the new endpoints (see src/README.md)"
echo "3. Update frontend to use enhanced entity data"
echo "4. Deploy when ready"
