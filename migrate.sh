#!/bin/bash

# LinkedTrust Backend Migration Script
# This script helps migrate from the old structure to the new clean implementation

echo "LinkedTrust Backend Migration"
echo "============================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Must run from trust_claim_backend directory"
    exit 1
fi

# Step 1: Backup current setup
echo "Step 1: Creating backup..."
cp package.json package.backup.json
cp tsconfig.json tsconfig.backup.json 2>/dev/null || true

# Step 2: Apply new configuration
echo "Step 2: Applying new configuration..."
cp package_new.json package.json
cp tsconfig_new.json tsconfig.json

# Step 3: Install dependencies
echo "Step 3: Installing dependencies..."
npm install

# Step 4: Generate Prisma client
echo "Step 4: Generating Prisma client..."
npx prisma generate

# Step 5: Run database migration
echo "Step 5: Running database migration..."
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

# Step 6: Create symlink for gradual migration
echo "Step 6: Setting up for gradual migration..."
if [ ! -L "src" ]; then
    mv src src_old
    ln -s src_new src
    echo "Created symlink: src -> src_new"
    echo "Old source backed up to src_old"
fi

# Step 7: Update .env if needed
echo "Step 7: Checking environment variables..."
if ! grep -q "PIPELINE_SERVICE_URL" .env; then
    echo "Adding PIPELINE_SERVICE_URL to .env..."
    echo "PIPELINE_SERVICE_URL=http://localhost:8001" >> .env
fi

if ! grep -q "BASE_URL" .env; then
    echo "Adding BASE_URL to .env..."
    echo "BASE_URL=https://linkedtrust.us" >> .env
fi

echo ""
echo "Migration complete!"
echo ""
echo "Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. Test the new endpoints (see src_new/README.md)"
echo "3. Update frontend to use enhanced entity data"
echo "4. Deploy when ready"
echo ""
echo "To rollback:"
echo "1. rm src && mv src_old src"
echo "2. cp package.backup.json package.json"
echo "3. cp tsconfig.backup.json tsconfig.json"
echo "4. npm install"
